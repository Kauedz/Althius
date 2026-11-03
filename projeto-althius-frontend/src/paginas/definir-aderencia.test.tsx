import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContaAlvo, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarAppCom } from '@/test/renderizar'

function comConta(conta: Partial<ContaAlvo>, metodos: Partial<FonteDeContas> = {}) {
  return (fonteDeContas: FonteDeContas): FonteDeContas => ({
    ...fonteDeContas,
    conta: async (id) => ({ ...(await fonteDeContas.conta(id)), ...conta }),
    ...metodos,
  })
}

describe('Definir a Aderência pelo detalhe da Conta (kanban 08)', () => {
  it('sem o método na fonte, ou para quem não é o Vendedor responsável, a escolha não aparece', async () => {
    renderizarAppCom('/contas/openai', {
      contas: comConta({ sobMinhaResponsabilidade: false }, { definirAderencia: vi.fn() }),
    })
    await screen.findByRole('heading', { level: 2, name: 'OpenAI' })
    expect(screen.queryByRole('button', { name: 'Marcar Fit' })).not.toBeInTheDocument()
  })

  it('o Vendedor responsável marca Fit, com o motivo opcional', async () => {
    const definirAderencia = vi.fn(async () => {})
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comConta({ sobMinhaResponsabilidade: true, aderencia: undefined }, { definirAderencia }),
    })
    expect(await screen.findByText('Aderência sem avaliação')).toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Marcar Fit' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo da Aderência' }), '  Setor e porte do ICP  ')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar Fit' }))

    expect(definirAderencia).toHaveBeenCalledWith('openai', 'fit', 'Setor e porte do ICP')
    expect(await screen.findByRole('status')).toHaveTextContent('Fit gravado')
  })

  it('Não fit exige o motivo e avisa que o cartão vai para Descartada', async () => {
    const definirAderencia = vi.fn(async () => {})
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comConta({ sobMinhaResponsabilidade: true, aderencia: 'fit', motivoDaAderencia: 'Setor do ICP' }, { definirAderencia }),
    })
    expect(await screen.findByText('Setor do ICP')).toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Marcar Não fit' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('o cartão vai para Descartada')
    const confirmar = within(dialogo).getByRole('button', { name: 'Marcar Não fit' })
    expect(confirmar).toBeDisabled()
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo da Aderência' }), 'Só atende o setor público')
    await usuario.click(confirmar)

    expect(definirAderencia).toHaveBeenCalledWith('openai', 'nao-fit', 'Só atende o setor público')
  })

  it('a recusa do banco aparece no diálogo e ele continua aberto', async () => {
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comConta(
        { sobMinhaResponsabilidade: true },
        { definirAderencia: () => Promise.reject(new Error('Só o Vendedor responsável define a Aderência desta Conta.')) },
      ),
    })
    await usuario.click(await screen.findByRole('button', { name: 'Marcar Fit' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar Fit' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Só o Vendedor responsável define a Aderência desta Conta.')
  })
})
