// O atalho "Gerar Sequência" no detalhe da Conta: só no Workspace operacional, só
// para o Vendedor responsável e só sem Sequência em andamento. Abre a Conversa coordenada com o pedido e o nome da
// Conta. Na Demonstração, nada muda. As Fontes são as simuladas, num ambiente operacional montado só aqui.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
import { criarFonteDoContextoDaEmpresaSimulada } from '@/fonte/simulada-contexto-da-empresa'
import type { FonteDoContextoDaEmpresa } from '@/fonte/contexto-da-empresa-tipos'
import { DATA_HOJE_TESTES } from '@/test/renderizar'

function abrir(
  modo: ModoDoAmbiente,
  conta: Partial<ContaAlvo>,
  { comSequencia = false, semAgentes = false, contexto }: {
    comSequencia?: boolean
    semAgentes?: boolean
    contexto?: FonteDoContextoDaEmpresa
  } = {},
) {
  const simulada = criarFonteSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES })
  // Sem nenhum Agente (nem o Rhetor) no Workspace: o atalho não pode depender de achar um.
  const fonte = semAgentes ? { ...simulada, agentes: async () => [] } : simulada
  const conversar = vi.spyOn(fonte, 'conversar')
  const conversarCoordenado = vi.spyOn(fonte, 'conversarCoordenado')
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
    fonteDeOnboarding: criarFonteDeOnboardingSimulada({ resolverLogo: async () => null, jaConcluido: true }),
    fonteDeSinais: sinais,
    fonteDeContasRemetentes: criarFonteDeContasRemetentesDaDemonstracao(),
    fonteDeConexoes: criarFonteDeConexoesSimulada(),
    ...(contexto ? { fonteDoContextoDaEmpresa: contexto } : {}),
    indisponiveis: new Set(),
  }
  render(<App ambiente={ambiente} rotaInicial="/contas/openai" animarDigitacao={false} />)
  return { usuario: userEvent.setup(), conversar, conversarCoordenado }
}

const QUENTE_E_MINHA = { quente: true, sobMinhaResponsabilidade: true, nome: 'OpenAI' }

describe('Gerar Sequência a partir da Conta', () => {
  it('o Vendedor responsável abre uma Conversa nova com o Rhetor já com o pedido', async () => {
    const { usuario, conversar, conversarCoordenado } = abrir('real', QUENTE_E_MINHA)
    await usuario.click(await screen.findByRole('button', { name: 'Gerar Sequência' }))
    expect((await screen.findAllByText(/Monte uma Sequência de e-mail para a Conta-alvo OpenAI/)).length).toBeGreaterThan(0)
    // A página da Conversa do Rhetor recebe o pedido.
    expect(conversar).toHaveBeenCalledTimes(1)
    expect(conversar.mock.calls[0][0]).toBe('rhetor')
    expect(conversar.mock.calls[0][1].texto).toMatch(/Conta-alvo OpenAI \(id openai\)/)
    expect(conversar.mock.calls[0][1].texto).toMatch(/Sinal.*Contexto da empresa/)
    expect(conversarCoordenado).not.toHaveBeenCalled()
    expect(screen.queryByText(/só leitura/i)).not.toBeInTheDocument()
  })

  it('não envia quando o Workspace não tem Rhetor', async () => {
    const { usuario, conversar, conversarCoordenado } = abrir('real', QUENTE_E_MINHA, { semAgentes: true })
    await usuario.click(await screen.findByRole('button', { name: 'Gerar Sequência' }))
    expect(conversarCoordenado).not.toHaveBeenCalled()
    expect(conversar).not.toHaveBeenCalled()
  })

  it('o pedido é enviado ao Rhetor', async () => {
    const { usuario, conversar } = abrir('real', QUENTE_E_MINHA)
    await usuario.click(await screen.findByRole('button', { name: 'Gerar Sequência' }))
    expect(conversar).toHaveBeenCalledWith('rhetor', expect.objectContaining({ texto: expect.any(String) }))
  })

  it('não aparece para quem não é o Vendedor responsável', async () => {
    abrir('real', { ...QUENTE_E_MINHA, sobMinhaResponsabilidade: false })
    await screen.findByRole('heading', { level: 2, name: 'OpenAI' })
    expect(screen.queryByRole('button', { name: 'Gerar Sequência' })).not.toBeInTheDocument()
  })

  it('não aparece na Conta que já tem Sequência em andamento, nem na Conta que não está Quente', async () => {
    abrir('real', QUENTE_E_MINHA, { comSequencia: true })
    await screen.findByRole('heading', { level: 2, name: 'OpenAI' })
    expect(screen.queryByRole('button', { name: 'Gerar Sequência' })).not.toBeInTheDocument()
  })

  it('aparece na Conta não Quente e pede contexto enriquecido', async () => {
    const { usuario, conversar } = abrir('real', { ...QUENTE_E_MINHA, quente: false })
    await usuario.click(await screen.findByRole('button', { name: 'Gerar Sequência' }))
    expect(conversar.mock.calls[0][1].texto).toMatch(/Conta enriquecida.*Comitê.*Contexto da empresa.*Perfil de cliente ideal/)
  })

  it('na Demonstração, nada muda', async () => {
    abrir('demonstracao', QUENTE_E_MINHA)
    await screen.findByRole('button', { name: /Criar sequência/ })
    expect(screen.queryByRole('button', { name: 'Gerar Sequência' })).not.toBeInTheDocument()
  })

  it('sem Contexto da empresa, avisa que a Sequência pelo Rhetor precisa dele e leva a Configurações, sem bloquear', async () => {
    const contexto = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: 'openai.test' })
    abrir('real', QUENTE_E_MINHA, { contexto })
    expect(await screen.findByText(/A Sequência pelo Rhetor precisa do Contexto da empresa/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Contexto da empresa' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(screen.getByRole('button', { name: 'Gerar Sequência' })).toBeEnabled()
  })

  it('com o Contexto da empresa vigente, não há aviso', async () => {
    abrir('real', QUENTE_E_MINHA, { contexto: criarFonteDoContextoDaEmpresaSimulada() })
    expect(await screen.findByRole('button', { name: 'Gerar Sequência' })).toBeInTheDocument()
    expect(screen.queryByText(/precisa do Contexto da empresa/)).not.toBeInTheDocument()
  })
})
