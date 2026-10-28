// O ponto de composição: escolhe as fontes de cada ambiente. As telas não sabem qual receberam. A Demonstração fica
// em `composicao-da-demonstracao`, carregada sob demanda: as fontes simuladas e os dados de exemplo não entram no
// pacote principal do app.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ambiente, MotivoDasConversasIndisponiveis, ModuloDoWorkspace, ParticipacaoNoWorkspace, ContaDeUsuarioDaSessao } from './ambiente'
import { criarFonteDeAgentesIndisponivel } from './indisponivel'
import { criarFonteDeOnboardingSupabase } from './supabase-onboarding'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'
import { criarFonteDeAprovacoesSupabase } from './supabase-aprovacoes'
import { criarFonteDeConexoesSupabase } from './supabase-conexoes'
import { criarFonteDeContasSupabase } from './supabase-contas'
import { criarFonteDeContasRemetentesSupabase } from './supabase-contas-remetentes'
import { criarFonteDeConversasSupabase } from './supabase-conversas'
import { criarFonteDeParticipantesSupabase } from './supabase-participantes'
import { criarFonteDeAutomacaoSupabase } from './supabase-automacao'
import { criarFonteDoPlaybookSupabase } from './supabase-playbook'
import { criarFonteDoPerfilSupabase } from './supabase-perfil'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'
import { criarFonteDeSinaisSupabase } from './supabase-sinais'
import { criarFonteDeDescobertasSupabase } from './supabase-descobertas'
import { lerSaldoDeCreditos, lerExtratoDeCreditos, lerPrecosDeCreditos } from './creditos'
import { lerResumoDoContrato } from './supabase-contrato'
import { criarFonteDoAgenteSupabase } from './supabase-agente'

/**
 * Um Workspace operacional: as fontes ligadas ao backend pela sessão e pelo Workspace escolhido. Um módulo sem
 * backend entra com uma fonte que não traz dado de demonstração e recusa as ações, e fica em `indisponiveis`. As
 * Conversas só entram com `conversasDisponiveis`: a Edge Function confirmou que o modelo está configurado. Os Sinais só
 * entram com `sinaisDisponiveis`: o registro de actors tem ao menos um actor que passou no teste.
 */
export function criarAmbienteDoWorkspace({
  cliente,
  usuario,
  participacao,
  conversasDisponiveis = false,
  motivoDasConversas,
  sinaisDisponiveis = false,
  aprovacoesDisponiveis = false,
  anexosDisponiveis = false,
}: {
  cliente: SupabaseClient
  usuario: ContaDeUsuarioDaSessao
  participacao: ParticipacaoNoWorkspace
  conversasDisponiveis?: boolean
  motivoDasConversas?: MotivoDasConversasIndisponiveis
  sinaisDisponiveis?: boolean
  /** A fila real de Aprovações (CRM-15); o aplicativo a liga junto com as Conversas, onde os Agentes as pedem. */
  aprovacoesDisponiveis?: boolean
  /** Os anexos dos passos (canais-10) entram quando o backend diz que o módulo foi ligado. */
  anexosDisponiveis?: boolean
}): Ambiente {
  const participantes = criarFonteDeParticipantesSupabase(cliente, participacao.workspaceId, usuario.id)
  const perfil = criarFonteDoPerfilSupabase(cliente, { usuario, participacao })
  const agentes = criarFonteDeAgentesSupabase(cliente, participacao.workspaceId)
  const conversas = conversasDisponiveis
    ? criarFonteDeConversasSupabase(cliente, participacao.workspaceId, { agentes: () => agentes.agentes() })
    : {}
  const indisponiveis = new Set<ModuloDoWorkspace>([
    'conversas', 'sinais', 'aprovacoes', 'configuracoes', 'anexos',
  ])
  if (conversasDisponiveis) indisponiveis.delete('conversas')
  if (sinaisDisponiveis) indisponiveis.delete('sinais')
  if (aprovacoesDisponiveis) indisponiveis.delete('aprovacoes')
  if (anexosDisponiveis) indisponiveis.delete('anexos')
  // A Fonte das Aprovações entra com a fila ou com as Conversas: a Aprovação que um Agente pede aparece e é decidida na
  // própria Conversa (ADR-0022) e na fila /aprovacoes.
  const aprovacoes = aprovacoesDisponiveis || conversasDisponiveis
    ? criarFonteDeAprovacoesSupabase(cliente, participacao.workspaceId)
    : undefined
  return {
    modo: 'real',
    motivoDasConversas,
    // Participantes e convites, Meu perfil e Preferências, a configuração dos Agentes, as Conexões, as Conversas e as
    // Aprovações (com o modelo configurado) já têm backend; o resto de Configurações, ainda não.
    fonte: {
      ...criarFonteDeAgentesIndisponivel({ usuario, participacao }),
      ...participantes,
      ...perfil,
      ...agentes,
      saldoDeCreditos: () => lerSaldoDeCreditos(cliente, participacao.workspaceId),
      precosDeCreditos: () => lerPrecosDeCreditos(cliente),
      extratoDeCreditos: () => lerExtratoDeCreditos(cliente, participacao.workspaceId),
      contratoDoWorkspace: () => lerResumoDoContrato(cliente, participacao.workspaceId),
      ...conversas,
      ...(aprovacoes
        ? {
            aprovacoes: aprovacoes.aprovacoes,
            filaDeAprovacoes: aprovacoes.filaDeAprovacoes,
            decidirAprovacao: aprovacoes.decidirAprovacao,
          }
        : {}),
      // Com a fila ligada, o número na navegação conta as pendentes dela; uma leitura que falha não tira o Workspace.
      ...(aprovacoes && aprovacoesDisponiveis
        ? {
            async workspace() {
              const [dados, lista] = await Promise.all([perfil.workspace(), aprovacoes.filaDeAprovacoes().catch(() => [])])
              return { ...dados, aprovacoesPendentes: lista.filter((a) => a.estado === 'pendente').length }
            },
          }
        : {}),
      observar(ouvinte) {
        const paradas = [participantes, perfil, agentes, ...(aprovacoes ? [aprovacoes] : [])].map((fonte) => fonte.observar(ouvinte))
        return () => paradas.forEach((parar) => parar())
      },
    },
    fonteDeContas: criarFonteDeContasSupabase(
      cliente,
      () => participacao.workspaceId,
      () => usuario.id,
      () => participacao.papel === 'administrador',
    ),
    fonteDeSequencias: criarFonteDeSequenciasSupabase(cliente, () => participacao.workspaceId, () => usuario.id),
    fonteDeOnboarding: criarFonteDeOnboardingSupabase(cliente, participacao.workspaceId),
    // O módulo Sinais aparece quando o primeiro actor passa no teste (sinais-reais 03); cada card mostra o próprio estado.
    fonteDeSinais: criarFonteDeSinaisSupabase(cliente, () => participacao.workspaceId),
    fonteDeConexoes: criarFonteDeConexoesSupabase(cliente, () => participacao.workspaceId),
    fonteDeContasRemetentes: criarFonteDeContasRemetentesSupabase(cliente, () => participacao.workspaceId),
    fonteDoPlaybook: criarFonteDoPlaybookSupabase(cliente, () => participacao.workspaceId, async () => {
      const { participantes: quem } = await participantes.participantesDoWorkspace()
      return new Map(quem.map(({ conta }) => [conta.id, conta.nome]))
    }, aprovacoes),
    fonteDeAutomacao: criarFonteDeAutomacaoSupabase(cliente, () => participacao.workspaceId),
    fonteDeDescobertas: criarFonteDeDescobertasSupabase(cliente, () => participacao.workspaceId),
    fonteDoAgente: criarFonteDoAgenteSupabase(cliente, () => participacao.workspaceId),
    indisponiveis,
  }
}
