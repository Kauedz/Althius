import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { criarFonteDeContasSimulada, type OpcoesFonteDeContasSimulada } from '@/fonte/simulada-contas'
import {
  criarFonteDeOnboardingSimulada,
  type OpcoesFonteDeOnboardingSimulada,
} from '@/fonte/simulada-onboarding'
import { criarFonteDeSequenciasSimulada, type OpcoesFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteDeSinaisSimulada, type OpcoesFonteDeSinaisSimulada } from '@/fonte/simulada-sinais'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'

export const DATA_HOJE_TESTES = new Date(2026, 8, 23, 12, 0, 0) // 23 de setembro de 2026

/**
 * Renderiza o app inteiro sobre as fontes simuladas, sem atrasos nem animação de digitação. A sessão já concluiu
 * o onboarding, salvo quando `opcoesOnboarding` diz o contrário.
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
  const fonte = criarFonteSimulada({ atrasoMs: 0, ...opcoesFonte })
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
  const resultado = render(
    <App
      fonte={fonte}
      fonteDeContas={fonteDeContas}
      fonteDeSequencias={fonteDeSequencias}
      fonteDeOnboarding={fonteDeOnboarding}
      fonteDeSinais={fonteDeSinais}
      rotaInicial={noNavegador ? undefined : rota}
      animarDigitacao={false}
    />,
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

/** O app no histórico do navegador, a partir desta rota: o voltar do navegador é `window.history.back()`. */
export function renderizarAppNoNavegador(rota: string) {
  return renderizarApp(rota, {}, {}, {}, {}, {}, true)
}
