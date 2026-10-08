import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustoDaBusca, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// "Buscar Sinais de novo" na Conta (sinais-reais 08): a busca sob pedido mostra o custo em créditos antes de rodar.

const cotacao = (o: Partial<CustoDaBusca> = {}): CustoDaBusca => ({
  monitoramentos: 2,
  creditos: 2,
  saldo: 10,
  emAndamento: false,
  terminouEm: null,
  motivo: null,
  ...o,
})

/** A Fonte de Contas da Demonstração com a busca ajustada pelo teste. */
function comBusca(busca: Partial<Pick<FonteDeContas, 'custoDeBuscarSinais' | 'buscarSinaisDeNovo'>>) {
  return {
    contas: (fonte: FonteDeContas): FonteDeContas => Object.assign(Object.create(fonte) as FonteDeContas, busca),
  }
}

const botao = () => screen.findByRole('button', { name: 'Buscar Sinais de novo' })

afterEach(() => {
  vi.useRealTimers()
})

describe('Buscar Sinais de novo', () => {
  it('a Demonstração mostra o botão com o custo em créditos antes de rodar', async () => {
    renderizarApp('/contas/openai')
    const b = await botao()
    expect(b).toBeEnabled()
    expect(b).toHaveAccessibleDescription(/2 créditos/)
    expect(screen.getByText('2 créditos')).toBeInTheDocument()
  })

  it('com um só Monitoramento o custo é 1 crédito, no singular', async () => {
    renderizarAppCom('/contas/openai', comBusca({ custoDeBuscarSinais: () => Promise.resolve(cotacao({ monitoramentos: 1, creditos: 1 })) }))
    expect(await botao()).toHaveAccessibleDescription('1 crédito')
  })

  it('clicar pede a busca uma vez e a tela passa a mostrar que ela está em andamento', async () => {
    let emAndamento = false
    const pedidos: string[] = []
    const { usuario } = renderizarAppCom('/contas/openai', comBusca({
      custoDeBuscarSinais: () => Promise.resolve(cotacao({ emAndamento })),
      buscarSinaisDeNovo: (contaId) => {
        pedidos.push(contaId)
        emAndamento = true
        return Promise.resolve()
      },
    }))
    await usuario.click(await botao())
    expect(await screen.findByText('Buscando Sinais…')).toBeInTheDocument()
    expect(pedidos).toEqual(['openai'])
    expect(screen.getByRole('button', { name: 'Buscar Sinais de novo' })).toBeDisabled()
  })

  it('sem Monitoramento ativo, o botão fica desligado e diz por quê', async () => {
    renderizarAppCom('/contas/openai', comBusca({ custoDeBuscarSinais: () => Promise.resolve(cotacao({ monitoramentos: 0, creditos: 0 })) }))
    expect(await botao()).toBeDisabled()
    expect(screen.getByText('Nenhum Monitoramento ativo para buscar.')).toBeInTheDocument()
  })

  it('sem saldo para o custo, o botão fica desligado e mostra o saldo', async () => {
    renderizarAppCom('/contas/openai', comBusca({ custoDeBuscarSinais: () => Promise.resolve(cotacao({ creditos: 2, saldo: 1 })) }))
    expect(await botao()).toBeDisabled()
    expect(screen.getByText('Sem créditos suficientes: o saldo é 1.')).toBeInTheDocument()
  })

  it('mostra como terminou a última busca, com o motivo de não ter varrido tudo', async () => {
    renderizarAppCom('/contas/openai', comBusca({
      custoDeBuscarSinais: () =>
        Promise.resolve(cotacao({ terminouEm: '2026-09-22T12:00:00+00:00', motivo: '1 varredura falhou; tente de novo mais tarde.' })),
    }))
    await botao()
    expect(screen.getByText('Última busca: ontem')).toBeInTheDocument()
    expect(screen.getByText('1 varredura falhou; tente de novo mais tarde.')).toBeInTheDocument()
  })

  it('a recusa do banco aparece em português e o botão continua disponível', async () => {
    const { usuario } = renderizarAppCom('/contas/openai', comBusca({
      buscarSinaisDeNovo: () => Promise.reject(new Error('Você chegou ao seu limite mensal de créditos.')),
    }))
    await usuario.click(await botao())
    expect(await screen.findByRole('alert')).toHaveTextContent('Você chegou ao seu limite mensal de créditos.')
    expect(screen.getByRole('button', { name: 'Buscar Sinais de novo' })).toBeEnabled()
  })

  it('enquanto a busca está em andamento, a tela confere de tempos em tempos e recarrega os Sinais quando ela termina', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let emAndamento = true
    let conferencias = 0
    renderizarAppCom('/contas/openai', comBusca({
      custoDeBuscarSinais: () => (conferencias++, Promise.resolve(cotacao({ emAndamento }))),
    }))
    expect(await screen.findByText('Buscando Sinais…')).toBeInTheDocument()
    const antes = conferencias
    emAndamento = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await waitFor(() => expect(screen.queryByText('Buscando Sinais…')).not.toBeInTheDocument())
    expect(conferencias).toBeGreaterThan(antes)
    expect(screen.getByRole('button', { name: 'Buscar Sinais de novo' })).toBeEnabled()
  })

  it('a Conta arquivada não oferece a busca', async () => {
    renderizarAppCom('/contas/openai', {
      contas: (fonte): FonteDeContas =>
        Object.assign(Object.create(fonte) as FonteDeContas, {
          conta: async (id: string) => ({ ...(await fonte.conta(id)), arquivadaEm: '2026-09-01T00:00:00Z' }),
        }),
    })
    await screen.findByRole('heading', { name: 'Sinais' })
    expect(screen.queryByRole('button', { name: 'Buscar Sinais de novo' })).not.toBeInTheDocument()
  })

  it('uma Fonte sem a busca não mostra o botão', async () => {
    renderizarAppCom('/contas/openai', comBusca({ custoDeBuscarSinais: undefined, buscarSinaisDeNovo: undefined }))
    await screen.findByRole('heading', { name: 'Sinais' })
    expect(screen.queryByRole('button', { name: 'Buscar Sinais de novo' })).not.toBeInTheDocument()
  })

  it('com o módulo Sinais indisponível no Workspace, o botão não aparece', async () => {
    renderizarAppCom('/contas/openai', { indisponiveis: ['sinais'] })
    await screen.findByRole('heading', { name: 'Sinais' })
    expect(screen.queryByRole('button', { name: 'Buscar Sinais de novo' })).not.toBeInTheDocument()
  })
})
