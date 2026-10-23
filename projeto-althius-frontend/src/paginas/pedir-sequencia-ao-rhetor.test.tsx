// O atalho "Pedir Sequência ao Rhetor" no detalhe da Conta Quente (cadencia-pela-ia 02): só no Workspace operacional, só
// para o Vendedor responsável e só sem Sequência em andamento. Abre a Conversa com o Rhetor já com o pedido e o nome da
// Conta. Na Demonstração, nada muda. As Fontes são as simuladas, num ambiente operacional montado só aqui.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '@/App'
import type { Ambiente, ModoDoAmbiente } from '@/fonte/ambiente'
import type { ContaAlvo } from '@/fonte/contas-tipos'
import { criarFonteSimulada } from '@/fonte/simulada'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteDeContasRemetentesDaDemonstracao } from '@/fonte/simulada-contas-remetentes'
import { criarFonteDeConexoesSimulada } from '@/fonte/simulada-conexoes'
import { criarFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteDeSinaisSimulada } from '@/fonte/simulada-sinais'
import { criarFonteDeOnboardingSimulada } from '@/fonte/simulada-onboarding'
import { DATA_HOJE_TESTES } from '@/test/renderizar'

function abrir(modo: ModoDoAmbiente, conta: Partial<ContaAlvo>, { comSequencia = false } = {}) {
  const fonte = criarFonteSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES })
  const contas = criarFonteDeContasSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES })
  const sequencias = criarFonteDeSequenciasSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES })
  contas.vincularFonteDeSequencias(sequencias)
  const sinais = criarFonteDeSinaisSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES, fonteDeContas: contas })
  const ambiente: Ambiente = {
    modo,
    fonte,
    fonteDeContas: { ...contas, conta: async (id) => ({ ...(await contas.conta(id)), ...conta }) },
    fonteDeSequencias: {
      ...sequencias,
      sequenciaPorConta: async (id) => (comSequencia ? sequencias.sequenciaPorConta(id) : null),
    },
    fonteDeOnboarding: criarFonteDeOnboardingSimulada({ atrasoDaLeituraMs: 0, resolverLogo: async () => null, jaConcluido: true }),
    fonteDeSinais: sinais,
    fonteDeContasRemetentes: criarFonteDeContasRemetentesDaDemonstracao(),
    fonteDeConexoes: criarFonteDeConexoesSimulada(),
    indisponiveis: new Set(),
  }
  render(<App ambiente={ambiente} rotaInicial="/contas/openai" animarDigitacao={false} />)
  return userEvent.setup()
}

const QUENTE_E_MINHA = { quente: true, sobMinhaResponsabilidade: true, nome: 'OpenAI' }

describe('Pedir Sequência ao Rhetor, a partir da Conta Quente', () => {
  it('o Vendedor responsável abre a Conversa com o Rhetor já com o pedido e o nome da Conta', async () => {
    const usuario = abrir('real', QUENTE_E_MINHA)
    await usuario.click(await screen.findByRole('button', { name: 'Pedir Sequência ao Rhetor' }))
    const conversa = await screen.findByRole('region', { name: 'Conversa' })
    expect(await within(conversa).findByText(/Monte uma Sequência de e-mail para a Conta-alvo OpenAI/)).toBeInTheDocument()
  })

  it('não aparece para quem não é o Vendedor responsável', async () => {
    abrir('real', { ...QUENTE_E_MINHA, sobMinhaResponsabilidade: false })
    await screen.findByRole('heading', { level: 2, name: 'OpenAI' })
    expect(screen.queryByRole('button', { name: 'Pedir Sequência ao Rhetor' })).not.toBeInTheDocument()
  })

  it('não aparece na Conta que já tem Sequência em andamento, nem na Conta que não está Quente', async () => {
    abrir('real', QUENTE_E_MINHA, { comSequencia: true })
    await screen.findByRole('heading', { level: 2, name: 'OpenAI' })
    expect(screen.queryByRole('button', { name: 'Pedir Sequência ao Rhetor' })).not.toBeInTheDocument()
  })

  it('não aparece na Conta fria', async () => {
    abrir('real', { ...QUENTE_E_MINHA, quente: false })
    await screen.findByRole('button', { name: /Criar sequência/ })
    expect(screen.queryByRole('button', { name: 'Pedir Sequência ao Rhetor' })).not.toBeInTheDocument()
  })

  it('na Demonstração, nada muda', async () => {
    abrir('demonstracao', QUENTE_E_MINHA)
    await screen.findByRole('button', { name: /Criar sequência/ })
    expect(screen.queryByRole('button', { name: 'Pedir Sequência ao Rhetor' })).not.toBeInTheDocument()
  })
})
