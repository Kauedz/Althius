// O ponto de composição: escolhe as fontes de cada ambiente. As telas não sabem qual receberam.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ambiente, ParticipacaoNoWorkspace, ContaDeUsuarioDaSessao } from './ambiente'
import {
  criarFonteDeAgentesIndisponivel,
  criarFonteDeOnboardingIndisponivel,
  criarFonteDeSinaisIndisponivel,
} from './indisponivel'
import { criarFonteSimulada } from './simulada'
import { criarFonteDeContasSimulada } from './simulada-contas'
import { criarFonteDeContasRemetentesDaDemonstracao } from './simulada-contas-remetentes'
import { criarFonteDeOnboardingSimulada } from './simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from './simulada-sequencias'
import { criarFonteDeSinaisSimulada } from './simulada-sinais'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'
import { criarFonteDeContasSupabase } from './supabase-contas'
import { criarFonteDeContasRemetentesSupabase } from './supabase-contas-remetentes'
import { criarFonteDeParticipantesSupabase } from './supabase-participantes'
import { criarFonteDoPerfilSupabase } from './supabase-perfil'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

/** A Demonstração: todas as fontes simuladas, ligadas entre si, com o estado que sobrevive no `armazenamento`. */
export function criarAmbienteDeDemonstracao({ armazenamento }: { armazenamento: Storage }): Ambiente {
  const fonteDeContas = criarFonteDeContasSimulada({ armazenamento })
  const fonteDeSequencias = criarFonteDeSequenciasSimulada({ armazenamento })
  const fonteDeSinais = criarFonteDeSinaisSimulada({ fonteDeContas })
  fonteDeContas.vincularFonteDeSequencias(fonteDeSequencias)
  fonteDeSinais.vincularFonteDeContas(fonteDeContas)
  return {
    modo: 'demonstracao',
    fonte: criarFonteSimulada({ armazenamento }),
    fonteDeContas,
    fonteDeSequencias,
    fonteDeOnboarding: criarFonteDeOnboardingSimulada({ armazenamento }),
    fonteDeSinais,
    fonteDeContasRemetentes: criarFonteDeContasRemetentesDaDemonstracao(),
    indisponiveis: new Set(),
  }
}

/**
 * Um Workspace operacional: as fontes ligadas ao backend pela sessão e pelo Workspace escolhido. Um módulo sem
 * backend entra com uma fonte que não traz dado de demonstração e recusa as ações, e fica em `indisponiveis`.
 */
export function criarAmbienteDoWorkspace({
  cliente,
  usuario,
  participacao,
}: {
  cliente: SupabaseClient
  usuario: ContaDeUsuarioDaSessao
  participacao: ParticipacaoNoWorkspace
}): Ambiente {
  const participantes = criarFonteDeParticipantesSupabase(cliente, participacao.workspaceId, usuario.id)
  const perfil = criarFonteDoPerfilSupabase(cliente, { usuario, participacao })
  const agentes = criarFonteDeAgentesSupabase(cliente, participacao.workspaceId)
  return {
    modo: 'real',
    // Participantes e convites, Meu perfil e Preferências e a configuração dos Agentes já têm backend; as Conversas, as
    // Aprovações, as Conexões e o resto de Configurações, ainda não.
    fonte: {
      ...criarFonteDeAgentesIndisponivel({ usuario, participacao }),
      ...participantes,
      ...perfil,
      ...agentes,
      observar(ouvinte) {
        const paradas = [participantes, perfil, agentes].map((fonte) => fonte.observar(ouvinte))
        return () => paradas.forEach((parar) => parar())
      },
    },
    fonteDeContas: criarFonteDeContasSupabase(cliente, () => participacao.workspaceId, () => usuario.id),
    fonteDeSequencias: criarFonteDeSequenciasSupabase(cliente, () => participacao.workspaceId, () => usuario.id),
    fonteDeOnboarding: criarFonteDeOnboardingIndisponivel(),
    fonteDeSinais: criarFonteDeSinaisIndisponivel(),
    fonteDeContasRemetentes: criarFonteDeContasRemetentesSupabase(cliente, () => participacao.workspaceId),
    indisponiveis: new Set(['conversas', 'sinais', 'aprovacoes', 'conexoes', 'configuracoes', 'onboarding', 'anexos']),
  }
}
