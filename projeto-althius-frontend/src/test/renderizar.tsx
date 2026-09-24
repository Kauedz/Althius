import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { criarFonteDeContasSimulada, type OpcoesFonteDeContasSimulada } from '@/fonte/simulada-contas'
import {
  criarFonteDeOnboardingSimulada,
  type OpcoesFonteDeOnboardingSimulada,
} from '@/fonte/simulada-onboarding'
import { criarFonteDeSequenciasSimulada, type OpcoesFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteSimulada } from '@/fonte/simulada'

export const DATA_HOJE_TESTES = new Date(2026, 8, 23, 12, 0, 0) // 23 de setembro de 2026

/** Renderiza o app inteiro sobre as fontes simuladas, sem atrasos nem animação de digitação. */
export function renderizarApp(
  rota = '/',
  opcoesContas: OpcoesFonteDeContasSimulada = {},
  opcoesSequencias: OpcoesFonteDeSequenciasSimulada = {},
  opcoesOnboarding: OpcoesFonteDeOnboardingSimulada = {},
) {
  const fonte = criarFonteSimulada({ atrasoMs: 0 })
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
  fonteDeContas.vincularFonteDeSequencias(fonteDeSequencias)
  const usuario = userEvent.setup()
  const resultado = render(
    <App
      fonte={fonte}
      fonteDeContas={fonteDeContas}
      fonteDeSequencias={fonteDeSequencias}
      fonteDeOnboarding={fonteDeOnboarding}
      rotaInicial={rota}
      animarDigitacao={false}
    />,
  )
  return { ...resultado, fonte, fonteDeContas, fonteDeSequencias, fonteDeOnboarding, usuario }
}
