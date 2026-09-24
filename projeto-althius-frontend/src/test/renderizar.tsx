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

/** Renderiza o app inteiro sobre as fontes simuladas, sem atrasos nem animação de digitação. */
export function renderizarApp(
  rota = '/',
  opcoesContas: OpcoesFonteDeContasSimulada = {},
  opcoesSequencias: OpcoesFonteDeSequenciasSimulada = {},
  opcoesOnboarding: OpcoesFonteDeOnboardingSimulada = {},
  opcoesSinais: OpcoesFonteDeSinaisSimulada = {},
  opcoesFonte: OpcoesFonteSimulada = {},
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
  const fonteDeOnboarding = criarFonteDeOnboardingSimulada(opcoesOnboarding)
  const fonteDeSinais = criarFonteDeSinaisSimulada({
    atrasoMs: 0,
    hoje: DATA_HOJE_TESTES,
    fonteDeContas,
    ...opcoesSinais,
  })
  fonteDeContas.vincularFonteDeSequencias(fonteDeSequencias)
  fonteDeSinais.vincularFonteDeContas(fonteDeContas)
  const usuario = userEvent.setup()
  const resultado = render(
    <App
      fonte={fonte}
      fonteDeContas={fonteDeContas}
      fonteDeSequencias={fonteDeSequencias}
      fonteDeOnboarding={fonteDeOnboarding}
      fonteDeSinais={fonteDeSinais}
      rotaInicial={rota}
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
