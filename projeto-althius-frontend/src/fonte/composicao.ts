// O ponto de composição: escolhe as fontes de cada ambiente. As telas não sabem qual receberam.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ambiente, ModuloDoWorkspace, ParticipacaoNoWorkspace, ContaDeUsuarioDaSessao } from './ambiente'
import {
  criarFonteDeAgentesIndisponivel,
  criarFonteDeOnboardingIndisponivel,
} from './indisponivel'
import { criarFonteDeAutomacaoSimulada } from './simulada-automacao'
import { criarFonteDoPlaybookSimulada } from './simulada-playbook'
import { criarFonteSimulada } from './simulada'
import { criarFonteDeConexoesSimulada } from './simulada-conexoes'
import { criarFonteDeContasSimulada } from './simulada-contas'
import { criarFonteDeContasRemetentesDaDemonstracao } from './simulada-contas-remetentes'
import { criarFonteDeOnboardingSimulada } from './simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from './simulada-sequencias'
import { criarFonteDeSinaisSimulada } from './simulada-sinais'
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

/** A Demonstração: todas as fontes simuladas, ligadas entre si, com o estado que sobrevive no `armazenamento`. */
export function criarAmbienteDeDemonstracao({ armazenamento }: { armazenamento: Storage }): Ambiente {
  const fonteDeContas = criarFonteDeContasSimulada({ armazenamento })
  const fonteDeSequencias = criarFonteDeSequenciasSimulada({ armazenamento })
  const fonteDeSinais = criarFonteDeSinaisSimulada({ fonteDeContas })
  fonteDeContas.vincularFonteDeSequencias(fonteDeSequencias)
  fonteDeSinais.vincularFonteDeContas(fonteDeContas)
  const fonte = criarFonteSimulada({ armazenamento })
  return {
    modo: 'demonstracao',
    fonte,
    fonteDeContas,
    fonteDeSequencias,
    fonteDeOnboarding: criarFonteDeOnboardingSimulada({ armazenamento }),
    fonteDeSinais,
    fonteDeConexoes: criarFonteDeConexoesSimulada({ armazenamento }),
    fonteDeContasRemetentes: criarFonteDeContasRemetentesDaDemonstracao(),
    fonteDoPlaybook: criarFonteDoPlaybookSimulada(),
    fonteDeAutomacao: criarFonteDeAutomacaoSimulada({ agentes: () => fonte.agentes() }),
    indisponiveis: new Set(),
  }
}

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
  sinaisDisponiveis = false,
  aprovacoesDisponiveis = false,
}: {
  cliente: SupabaseClient
  usuario: ContaDeUsuarioDaSessao
  participacao: ParticipacaoNoWorkspace
  conversasDisponiveis?: boolean
  sinaisDisponiveis?: boolean
  /** A fila real de Aprovações (CRM-15) entra com o primeiro executor de ação externa (ex.: Enviar ao CRM). */
  aprovacoesDisponiveis?: boolean
}): Ambiente {
  const participantes = criarFonteDeParticipantesSupabase(cliente, participacao.workspaceId, usuario.id)
  const perfil = criarFonteDoPerfilSupabase(cliente, { usuario, participacao })
  const agentes = criarFonteDeAgentesSupabase(cliente, participacao.workspaceId)
  const conversas = conversasDisponiveis
    ? criarFonteDeConversasSupabase(cliente, participacao.workspaceId, { agentes: () => agentes.agentes() })
    : {}
  const indisponiveis = new Set<ModuloDoWorkspace>([
    'conversas', 'sinais', 'aprovacoes', 'configuracoes', 'onboarding', 'anexos',
  ])
  if (conversasDisponiveis) indisponiveis.delete('conversas')
  if (sinaisDisponiveis) indisponiveis.delete('sinais')
  if (aprovacoesDisponiveis) indisponiveis.delete('aprovacoes')
  const aprovacoes = aprovacoesDisponiveis ? criarFonteDeAprovacoesSupabase(cliente, participacao.workspaceId) : undefined
  return {
    modo: 'real',
    // Participantes e convites, Meu perfil e Preferências, a configuração dos Agentes, as Conexões e as Conversas
    // (com o modelo configurado) já têm backend; as Aprovações e o resto de Configurações, ainda não.
    fonte: {
      ...criarFonteDeAgentesIndisponivel({ usuario, participacao }),
      ...participantes,
      ...perfil,
      ...agentes,
      ...conversas,
      ...(aprovacoes ? { aprovacoes: aprovacoes.aprovacoes, decidirAprovacao: aprovacoes.decidirAprovacao } : {}),
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
    fonteDeOnboarding: criarFonteDeOnboardingIndisponivel(),
    // O módulo Sinais aparece quando o primeiro actor passa no teste (sinais-reais 03); cada card mostra o próprio estado.
    fonteDeSinais: criarFonteDeSinaisSupabase(cliente, () => participacao.workspaceId),
    fonteDeConexoes: criarFonteDeConexoesSupabase(cliente, () => participacao.workspaceId),
    fonteDeContasRemetentes: criarFonteDeContasRemetentesSupabase(cliente, () => participacao.workspaceId),
    fonteDoPlaybook: criarFonteDoPlaybookSupabase(cliente, () => participacao.workspaceId, async () => {
      const { participantes: quem } = await participantes.participantesDoWorkspace()
      return new Map(quem.map(({ conta }) => [conta.id, conta.nome]))
    }),
    fonteDeAutomacao: criarFonteDeAutomacaoSupabase(cliente, () => participacao.workspaceId),
    indisponiveis,
  }
}
