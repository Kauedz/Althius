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
  return {
    modo: 'real',
    // Participantes e convites, Meu perfil e Preferências já têm backend; o resto de Agentes e Configurações, ainda não.
    fonte: {
      ...criarFonteDeAgentesIndisponivel({ usuario, participacao }),
      ...participantes,
      ...perfil,
      observar(ouvinte) {
        const pararDeOuvirParticipantes = participantes.observar(ouvinte)
        const pararDeOuvirPerfil = perfil.observar(ouvinte)
        return () => {
          pararDeOuvirParticipantes()
          pararDeOuvirPerfil()
        }
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
    fonteDeSinais: criarFonteDeSinaisIndisponivel(),
    fonteDeContasRemetentes: criarFonteDeContasRemetentesSupabase(cliente, () => participacao.workspaceId),
    indisponiveis: new Set(['agentes', 'sinais', 'aprovacoes', 'conexoes', 'configuracoes', 'onboarding', 'anexos']),
  }
}
