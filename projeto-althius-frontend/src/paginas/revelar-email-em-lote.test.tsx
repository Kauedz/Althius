import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarAppCom } from '@/test/renderizar'

// Revelar e-mail em lote (enriquecimento 03): o custo máximo aparece antes de rodar, e só roda depois da confirmação.

/** O app em /contatos com Clara Dupont e Carlos Mendoza sem e-mail; os demais seguem a demo (com e-mail). */
function renderizarComDuasSemEmail(metodos: Partial<FonteDeContas> = {}) {
  return renderizarAppCom('/contatos', {
    contas: (fonteDeContas: FonteDeContas): FonteDeContas => ({
      ...fonteDeContas,
      contatos: async () =>
        (await fonteDeContas.contatos()).map((contato) =>
          ['Clara Dupont', 'Carlos Mendoza'].includes(contato.nome)
            ? { ...contato, canais: { ...contato.canais, email: false } }
            : contato,
        ),
      ...metodos,
    }),
  })
}

async function selecionar(usuario: ReturnType<typeof renderizarAppCom>['usuario'], nome: string) {
  await usuario.click(await screen.findByRole('checkbox', { name: `Selecionar ${nome}` }))
}

describe('Revelar E-mail em lote', () => {
  it('sem ninguém selecionado, o botão do lote não aparece', async () => {
    renderizarComDuasSemEmail()

    await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(screen.queryByRole('button', { name: 'Revelar E-mail em lote' })).not.toBeInTheDocument()
  })

  it('mostra o custo máximo (2 créditos por Contato sem e-mail; quem já tem custa 0) antes de rodar', async () => {
    const revelarContato = vi.fn()
    const { usuario } = renderizarComDuasSemEmail({ revelarContato })

    await selecionar(usuario, 'Clara Dupont')
    await selecionar(usuario, 'Carlos Mendoza')
    await selecionar(usuario, 'Alex Rivera') // já tem e-mail: entra na seleção mas custa 0

    await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail em lote' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Revelar E-mail em lote' })
    expect(within(dialogo).getByText('4 créditos')).toBeInTheDocument()
    expect(within(dialogo).getByText(/3 selecionados/)).toHaveTextContent(
      '3 selecionados · 2 sem e-mail (2 créditos cada) · 1 já com e-mail (sem custo).',
    )
    // O custo aparece antes de rodar: nenhuma chamada a revelarContato ainda.
    expect(revelarContato).not.toHaveBeenCalled()
  })

  it('só roda depois da confirmação, e só para quem não tem e-mail', async () => {
    const revelarContato = vi.fn().mockImplementation((contatoId: string) =>
      Promise.resolve({ sucesso: true, valor: `${contatoId}@empresa.test`, creditosDebitados: 2 }),
    )
    const { usuario } = renderizarComDuasSemEmail({ revelarContato })

    await selecionar(usuario, 'Clara Dupont')
    await selecionar(usuario, 'Carlos Mendoza')
    await selecionar(usuario, 'Alex Rivera')
    await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail em lote' }))
    await screen.findByRole('dialog', { name: 'Revelar E-mail em lote' })

    await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))

    expect(revelarContato).toHaveBeenCalledTimes(2)
    expect(revelarContato).toHaveBeenCalledWith('contato-anthropic-3', 'email')
    expect(revelarContato).not.toHaveBeenCalledWith('contato-anthropic-1', 'email')

    const dialogo = screen.getByRole('dialog', { name: 'Revelar E-mail em lote' })
    expect(within(dialogo).getByText(/Clara Dupont:/)).toHaveTextContent(
      'Clara Dupont: Encontrado: contato-anthropic-3@empresa.test (2 créditos debitados)',
    )
  })

  it('quando ninguém sem e-mail foi encontrado, nenhum crédito é debitado', async () => {
    const revelarContato = vi.fn().mockResolvedValue({ sucesso: false, valor: null, creditosDebitados: 0 })
    const { usuario } = renderizarComDuasSemEmail({ revelarContato })

    await selecionar(usuario, 'Clara Dupont')
    await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail em lote' }))
    await screen.findByRole('dialog', { name: 'Revelar E-mail em lote' })
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))

    const dialogo = screen.getByRole('dialog', { name: 'Revelar E-mail em lote' })
    expect(within(dialogo).getByText(/Clara Dupont:/)).toHaveTextContent(
      'Clara Dupont: Nenhum e-mail novo encontrado. Nenhum crédito foi debitado.',
    )
  })
})
