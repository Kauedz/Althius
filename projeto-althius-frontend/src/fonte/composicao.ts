// O ponto de composição: escolhe as fontes de cada ambiente. As telas não sabem qual receberam.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ambiente, ParticipacaoNoWorkspace, ContaDeUsuarioDaSessao } from './ambiente'
import {
  criarFonteDeAgentesIndisponivel,
  criarFonteDeOnboardingIndisponivel,
  criarFonteDeSinaisIndisponivel,
} from './indisponivel'
import { criarFonteSimulada } from './simulada'
import { criarFonteDeConexoesSimulada } from './simulada-conexoes'
import { criarFonteDeContasSimulada } from './simulada-contas'
import { criarFonteDeOnboardingSimulada } from './simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from './simulada-sequencias'
import { criarFonteDeSinaisSimulada } from './simulada-sinais'
import { criarFonteDeConexoesSupabase } from './supabase-conexoes'
import { criarFonteDeContasSupabase } from './supabase-contas'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

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
    fonteDeConexoes: criarFonteDeConexoesSimulada(fonte),
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
  return {
    modo: 'real',
    fonte: criarFonteDeAgentesIndisponivel({ usuario, participacao }),
    fonteDeContas: criarFonteDeContasSupabase(cliente, () => participacao.workspaceId, () => usuario.id),
    fonteDeSequencias: criarFonteDeSequenciasSupabase(cliente, () => participacao.workspaceId, () => usuario.id),
    fonteDeOnboarding: criarFonteDeOnboardingIndisponivel(),
    fonteDeSinais: criarFonteDeSinaisIndisponivel(),
    fonteDeConexoes: criarFonteDeConexoesSupabase(cliente, () => participacao.workspaceId, () => participacao.papel),
    indisponiveis: new Set(['agentes', 'sinais', 'aprovacoes', 'configuracoes', 'onboarding', 'anexos']),
  }
}
