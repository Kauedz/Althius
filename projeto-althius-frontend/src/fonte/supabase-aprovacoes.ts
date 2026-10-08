// As Aprovações reais do Workspace operacional (CRM-15): a fila que os Agentes alimentam quando a Permissão é Propor.
// Tudo passa pelas funções do banco (migration aprovacoes_reais): todo Participante ativo lê a fila; só um
// Administrador decide, e a pendente vence em 7 dias. A revisão da Memória do Workspace ainda não tem backend e não
// aparece aqui.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AprovacaoDeAcao, Decisao, FonteDeAgentes, IntegracaoId, LugarDaDecisao } from './tipos'

interface RegistroDaAprovacao {
  id: string
  agent_id: string
  integration_id: string
  action: string
  impact: string
  justification: string
  target_account_id: string | null
  /** O conteúdo guardado; `tipo` diz quem executa (`envio_ao_crm` ou `ferramenta`, ADR-0022). */
  payload?: { tipo?: unknown } | null
  state: 'pendente' | 'aprovada' | 'recusada' | 'cancelada' | 'expirada' | 'executando' | 'executada' | 'falhou'
  failure: string | null
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
  }
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

/** Quem executa a Aprovação depois de aprovada: a chamada de ferramenta de conector ou o envio ao CRM (o padrão). */
const EXECUTOR: Record<string, string> = { ferramenta: 'integration-tools' }

export function criarFonteDeAprovacoesSupabase(
  cliente: SupabaseClient,
  workspaceId: string,
): Pick<FonteDeAgentes, 'aprovacoes' | 'decidirAprovacao' | 'observar'> {
  const ouvintes = new Set<() => void>()
  // O tipo de cada Aprovação lida, para a execução depois de aprovar ir a quem sabe fazê-la.
  const tipos = new Map<string, string>()
  // O que abre junto (a navegação, a fila, cada cartão na Conversa) divide a mesma leitura em andamento.
  let leituraEmAndamento: Promise<AprovacaoDeAcao[]> | null = null

  async function lerAFila(): Promise<AprovacaoDeAcao[]> {
    const { data, error } = await cliente.rpc('list_approvals', { p_workspace_id: workspaceId })
    if (error) throw converterErro(error)
    for (const linha of (data ?? []) as RegistroDaAprovacao[]) {
      if (typeof linha.payload?.tipo === 'string') tipos.set(linha.id, linha.payload.tipo)
    }
    return ((data ?? []) as RegistroDaAprovacao[]).map(
      (linha): AprovacaoDeAcao => ({
        id: linha.id,
        agenteId: linha.agent_id,
        integracaoId: linha.integration_id as IntegracaoId,
        acao: linha.action,
        impacto: linha.impact,
        justificativa: linha.justification,
        origem: 'althius',
        gatilho: 'conversa',
        ...(linha.target_account_id ? { contaId: linha.target_account_id } : {}),
        ...estadoDa(linha),
      }),
    )
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
      // ferramenta de um conector (ADR-0022) sai pela `integration-tools`, do mesmo jeito.
      if (decisao === 'aprovada') {
        const executor = EXECUTOR[tipos.get(aprovacaoId) ?? ''] ?? 'crm-handoff'
        await cliente.functions
          .invoke(executor, { body: { action: 'executar_aprovacao', approvalId: aprovacaoId } })
          .catch(() => null)
      }
      // A leitura que começou antes da decisão não serve mais: quem reler pede de novo.
      leituraEmAndamento = null
      for (const ouvinte of ouvintes) ouvinte()
    },
  }
}
