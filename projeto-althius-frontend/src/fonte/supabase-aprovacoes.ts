// As Aprovações reais do Workspace operacional (CRM-15): a fila que os Agentes alimentam quando a Permissão é Propor.
// Tudo passa pelas funções do banco (migration aprovacoes_reais): todo Participante ativo lê a fila; só um
// Administrador decide, e a pendente vence em 7 dias. Na mesma fila vem a revisão de uma seção do Playbook que o Scopus
// ou o Ethos propôs (CRM-09, ADR-0010): ela não tem Integração, e aprovar já grava a versão nova no banco.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ehSecaoDoPlaybook } from './playbook-tipos'
import { conteudoLido } from './supabase-playbook'
import type {
  Aprovacao,
  AprovacaoDeAcao,
  AprovacaoDeRevisaoDoPlaybook,
  Decisao,
  FonteDeAgentes,
  IntegracaoId,
  LugarDaDecisao,
} from './tipos'

type EstadoNoBanco =
  | 'pendente'
  | 'aprovada'
  | 'recusada'
  | 'cancelada'
  | 'expirada'
  | 'executando'
  | 'executada'
  | 'falhou'
  | 'desatualizada'

interface RegistroDaAprovacao {
  id: string
  agent_id: string
  integration_id: string | null
  action: string
  impact: string
  justification: string
  target_account_id: string | null
  /** O conteúdo guardado; `tipo` diz quem executa (`envio_ao_crm` ou `ferramenta`, ADR-0022). */
  payload?: { tipo?: unknown } | null
  state: EstadoNoBanco
  failure: string | null
  decided_by?: string | null
  /** `revisao` na revisão do Playbook (CRM-09); sem ela, ação. */
  category?: 'acao' | 'revisao' | null
  playbook_section?: string | null
  base_version?: number | null
  applied_version?: number | null
  /** Só enquanto pendente. */
  proposed_content?: { texto?: unknown; linhas?: unknown } | null
}

/** O estado do banco na linguagem da fila; executando, executada e falhou são de uma Aprovação já aprovada. */
function estadoDa(linha: RegistroDaAprovacao): Pick<AprovacaoDeAcao, 'estado' | 'execucao' | 'falha'> {
  switch (linha.state) {
    case 'pendente':
    case 'aprovada':
    case 'cancelada':
    case 'expirada':
      return { estado: linha.state }
    case 'recusada':
      return { estado: 'rejeitada' }
    case 'executando':
    case 'executada':
      return { estado: 'aprovada', execucao: linha.state }
    case 'falhou':
      return { estado: 'aprovada', execucao: 'falhou', ...(linha.failure ? { falha: linha.failure } : {}) }
    case 'desatualizada':
      // Só uma revisão fica desatualizada (o banco recusa numa ação); se chegasse aqui, não saiu nada.
      return { estado: 'cancelada' }
  }
}

/** O estado da revisão do Playbook: o da Aprovação, com `desatualizada`. Ela nunca é executada depois de aprovada. */
function estadoDaRevisao(state: EstadoNoBanco): AprovacaoDeRevisaoDoPlaybook['estado'] {
  if (state === 'recusada') return 'rejeitada'
  if (state === 'executando' || state === 'executada' || state === 'falhou') return 'aprovada'
  return state
}

function converterErro(error: { message: string }): Error {
  if (error.message.includes('only administrators can decide approvals')) {
    return new Error('Só Administradores do Workspace decidem Aprovações.')
  }
  if (error.message.includes('the approval was already decided')) return new Error('Esta Aprovação já foi decidida.')
  if (error.message.includes('approval not found')) return new Error('Aprovação não encontrada neste Workspace.')
  if (error.message.includes('active workspace membership required')) return new Error('Você não participa deste Workspace.')
  return new Error('Não foi possível concluir a decisão. Tente de novo.')
}

const ONDE: Record<string, 'fila' | 'conversa' | 'canal'> = { fila: 'fila', conversa: 'conversa' }

/**
 * Quem executa a Aprovação depois de aprovada: a chamada de ferramenta de conector, o envio ao CRM (o padrão) ou ninguém,
 * na revisão do Playbook, que o banco já gravou ao aprovar.
 */
const EXECUTOR: Record<string, string | null> = { ferramenta: 'integration-tools', revisao_do_playbook: null }

function aprovacaoDa(linha: RegistroDaAprovacao): Aprovacao {
  const base = {
    id: linha.id,
    agenteId: linha.agent_id,
    acao: linha.action,
    impacto: linha.impact,
    justificativa: linha.justification,
    origem: 'althius' as const,
    gatilho: 'conversa' as const,
  }
  const secao = linha.playbook_section ?? undefined
  if (linha.category === 'revisao' && ehSecaoDoPlaybook(secao)) {
    return {
      ...base,
      estado: estadoDaRevisao(linha.state),
      revisao: {
        tipo: 'playbook',
        secao,
        versaoBase: linha.base_version ?? 0,
        proposto: linha.state === 'pendente' && linha.proposed_content ? conteudoLido(linha.proposed_content) : null,
        versaoGravada: linha.applied_version ?? null,
        decididaPor: linha.decided_by ?? null,
      },
    }
  }
  return {
    ...base,
    integracaoId: linha.integration_id as IntegracaoId,
    ...(linha.target_account_id ? { contaId: linha.target_account_id } : {}),
    ...estadoDa(linha),
  }
}

export function criarFonteDeAprovacoesSupabase(
  cliente: SupabaseClient,
  workspaceId: string,
): Pick<FonteDeAgentes, 'aprovacoes' | 'decidirAprovacao' | 'observar'> {
  const ouvintes = new Set<() => void>()
  // O tipo de cada Aprovação lida, para a execução depois de aprovar ir a quem sabe fazê-la.
  const tipos = new Map<string, string>()
  // O que abre junto (a navegação, a fila, cada cartão na Conversa) divide a mesma leitura em andamento.
  let leituraEmAndamento: Promise<Aprovacao[]> | null = null

  async function lerAFila(): Promise<Aprovacao[]> {
    const { data, error } = await cliente.rpc('list_approvals', { p_workspace_id: workspaceId })
    if (error) throw converterErro(error)
    for (const linha of (data ?? []) as RegistroDaAprovacao[]) {
      if (typeof linha.payload?.tipo === 'string') tipos.set(linha.id, linha.payload.tipo)
    }
    return ((data ?? []) as RegistroDaAprovacao[]).map(aprovacaoDa)
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },

    aprovacoes() {
      if (leituraEmAndamento) return leituraEmAndamento
      const leitura = lerAFila().finally(() => {
        if (leituraEmAndamento === leitura) leituraEmAndamento = null
      })
      leituraEmAndamento = leitura
      return leitura
    },

    async decidirAprovacao(aprovacaoId: string, decisao: Decisao, onde: LugarDaDecisao) {
      const { error } = await cliente.rpc('decide_approval', {
        p_approval_id: aprovacaoId,
        p_decision: decisao === 'aprovada' ? 'aprovar' : 'recusar',
        p_where: ONDE[onde] ?? 'canal',
      })
      if (error) throw converterErro(error)
      // Aprovada, a ação sai logo (Etapa 5b): o `crm-handoff` confere de novo que quem pede é Administrador, reserva a
      // Aprovação uma vez só e envia exatamente o conteúdo revisado. Uma Aprovação que não é de envio ao CRM ele recusa
      // sem mudar nada. Um envio que não sai não desfaz a decisão: a fila relê e mostra executada ou falhou (sem resposta do
      // executor, a Aprovação fica aprovada, sem execução). A chamada de
      // ferramenta de um conector (ADR-0022) sai pela `integration-tools`, do mesmo jeito. A revisão do Playbook não
      // tem executor: aprovar já gravou a versão (ou a deixou desatualizada, se a seção mudou antes).
      if (decisao === 'aprovada') {
        const tipo = tipos.get(aprovacaoId) ?? ''
        const executor = tipo in EXECUTOR ? EXECUTOR[tipo] : 'crm-handoff'
        if (executor) {
          await cliente.functions
            .invoke(executor, { body: { action: 'executar_aprovacao', approvalId: aprovacaoId } })
            .catch(() => null)
        }
      }
      // A leitura que começou antes da decisão não serve mais: quem reler pede de novo.
      leituraEmAndamento = null
      for (const ouvinte of ouvintes) ouvinte()
    },
  }
}
