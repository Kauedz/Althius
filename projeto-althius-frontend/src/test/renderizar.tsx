import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import type { Ambiente } from '@/fonte/ambiente'
import type { FonteDeContas, FonteDeOnboarding } from '@/fonte/tipos'
import { criarFonteDeContasSimulada, type OpcoesFonteDeContasSimulada } from '@/fonte/simulada-contas'
import {
  criarFonteDeOnboardingSimulada,
  type OpcoesFonteDeOnboardingSimulada,
} from '@/fonte/simulada-onboarding'
import { criarFonteDeSequenciasSimulada, type OpcoesFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteDeSinaisSimulada, type OpcoesFonteDeSinaisSimulada } from '@/fonte/simulada-sinais'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'
import { criarFonteDeContasRemetentesDaDemonstracao } from '@/fonte/simulada-contas-remetentes'

export const DATA_HOJE_TESTES = new Date(2026, 8, 23, 12, 0, 0) // 23 de setembro de 2026

/**
 * Renderiza o app inteiro sobre as fontes simuladas, sem atrasos nem animação de digitação. A sessão já concluiu
 * o onboarding, salvo quando `opcoesOnboarding` diz o contrário. O site do onboarding não tem logo, salvo quando o
 * teste passa `resolverLogo`: o jsdom não baixa imagens.
 */
export function renderizarApp(
  rota = '/',
  opcoesContas: OpcoesFonteDeContasSimulada = {},
  opcoesSequencias: OpcoesFonteDeSequenciasSimulada = {},
  opcoesOnboarding: OpcoesFonteDeOnboardingSimulada = {},
  opcoesSinais: OpcoesFonteDeSinaisSimulada = {},
  opcoesFonte: OpcoesFonteSimulada = {},
  /** Roteia no histórico do navegador (o do jsdom), para o teste usar o voltar do navegador. */
  noNavegador = false,
) {
  return montarApp({ rota, opcoesContas, opcoesSequencias, opcoesOnboarding, opcoesSinais, opcoesFonte, noNavegador })
}

/** O app no histórico do navegador, a partir desta rota: o voltar do navegador é `window.history.back()`. */
export function renderizarAppNoNavegador(rota: string) {
  return renderizarApp(rota, {}, {}, {}, {}, {}, true)
}

interface Ajustes {
  opcoesOnboarding?: OpcoesFonteDeOnboardingSimulada
  /** Troca a Fonte de contas da demo por outra feita a partir dela, só neste teste. */
  contas?: (fonte: FonteDeContas) => FonteDeContas
  /** Troca a Fonte de onboarding simulada por outra feita a partir dela, só neste teste. */
  onboarding?: (fonte: FonteDeOnboarding) => FonteDeOnboarding
}

/** O app como em `renderizarApp`, com uma Fonte ajustada pelo teste no lugar da simulada. */
export function renderizarAppCom(rota: string, { opcoesOnboarding = {}, contas, onboarding }: Ajustes) {
  return montarApp({ rota, opcoesOnboarding, ajustarContas: contas, ajustarOnboarding: onboarding })
}

function montarApp({
  rota,
  opcoesContas = {},
  opcoesSequencias = {},
  opcoesOnboarding = {},
  opcoesSinais = {},
  opcoesFonte = {},
  noNavegador = false,
  ajustarContas = (fonte) => fonte,
  ajustarOnboarding = (fonte) => fonte,
}: {
  rota: string
  opcoesContas?: OpcoesFonteDeContasSimulada
  opcoesSequencias?: OpcoesFonteDeSequenciasSimulada
  opcoesOnboarding?: OpcoesFonteDeOnboardingSimulada
  opcoesSinais?: OpcoesFonteDeSinaisSimulada
  opcoesFonte?: OpcoesFonteSimulada
  noNavegador?: boolean
  ajustarContas?: (fonte: FonteDeContas) => FonteDeContas
  ajustarOnboarding?: (fonte: FonteDeOnboarding) => FonteDeOnboarding
}) {
  const fonte = criarFonteSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES, ...opcoesFonte })
  const fonteDeContas = criarFonteDeContasSimulada({
    atrasoMs: 0,
    hoje: DATA_HOJE_TESTES,
    ...opcoesContas,
  })
  const fonteDeSequencias = criarFonteDeSequenciasSimulada({
    atrasoMs: 0,
    hoje: DATA_HOJE_TESTES,
    ...opcoesSequencias,
  })
  const fonteDeOnboarding = criarFonteDeOnboardingSimulada({
    atrasoDaLeituraMs: 0,
    resolverLogo: async () => null,
    jaConcluido: true,
    ...opcoesOnboarding,
  })
  const fonteDeSinais = criarFonteDeSinaisSimulada({
    atrasoMs: 0,
    hoje: DATA_HOJE_TESTES,
    fonteDeContas,
    ...opcoesSinais,
  })
  fonteDeContas.vincularFonteDeSequencias(fonteDeSequencias)
  fonteDeSinais.vincularFonteDeContas(fonteDeContas)
  const usuario = userEvent.setup()
  if (noNavegador) window.history.replaceState(null, '', rota)
  const ambiente: Ambiente = {
    modo: 'demonstracao',
    fonte,
    fonteDeContas: ajustarContas(fonteDeContas),
    fonteDeSequencias,
    fonteDeOnboarding: ajustarOnboarding(fonteDeOnboarding),
    fonteDeSinais,
    fonteDeContasRemetentes: criarFonteDeContasRemetentesDaDemonstracao(),
    indisponiveis: new Set(),
  }
  const resultado = render(
    <App ambiente={ambiente} rotaInicial={noNavegador ? undefined : rota} animarDigitacao={false} />,
  )
  return {
    ...resultado,
    fonte,
    fonteDeContas,
    fonteDeSequencias,
    fonteDeOnboarding,
    fonteDeSinais,
    usuario,
  }
}
