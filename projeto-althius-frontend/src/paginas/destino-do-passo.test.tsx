import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Contato, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

/** Os Contatos da demo, com as listas de e-mails e telefones da Sarah Chen que a fonte do Workspace operacional traz. */
function comListasDaSarah(base: FonteDeContas): FonteDeContas {
  const todos = async (): Promise<Contato[]> =>
    (await base.contatos()).map((contato) =>
      contato.nome === 'Sarah Chen'
        ? {
            ...contato,
            email: 'sarah@openai.com',
            whatsapp: '+5511988887777',
            emails: [
              { valor: 'sarah@openai.com', rotulo: 'trabalho' },
              { valor: 'sarah.chen@gmail.com', rotulo: 'pessoal' },
            ],
            telefones: [
              { valor: '+5511988887777', tipo: 'celular', whatsapp: true },
              { valor: '+551133334444', tipo: 'fixo', whatsapp: false },
              { valor: '+551122223333', tipo: 'fixo', whatsapp: true },
            ],
          }
        : contato,
    )
  return { ...base, contatos: todos }
}

const destinoAtual = () => screen.getByTestId('destino-atual')

describe('O passo escolhe qual e-mail ou telefone do Contato usar', () => {
  it('o passo de E-mail lista os e-mails do Contato, o número 1 é o principal e a escolha muda o Destino mostrado', async () => {
    const { usuario } = renderizarAppCom('/sequencias/sequencia-openai', { contas: comListasDaSarah })
    await screen.findByTestId('composer-step')

    const seletor = screen.getByRole('combobox', { name: 'E-mail do Contato neste passo' })
    expect(seletor).toHaveValue('1')
    expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Número 1 · sarah@openai.com (Trabalho)',
      'Número 2 · sarah.chen@gmail.com (Pessoal)',
    ])
    expect(destinoAtual()).toHaveTextContent('sarah@openai.com')

    await usuario.selectOptions(seletor, '2')

    expect(destinoAtual()).toHaveTextContent('sarah.chen@gmail.com')
    expect(screen.getByRole('combobox', { name: 'E-mail do Contato neste passo' })).toHaveValue('2')

    // Voltar ao número 1 tira `destino` do passo: ausente vale 1.
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'E-mail do Contato neste passo' }), '1')
    expect(destinoAtual()).toHaveTextContent('sarah@openai.com')
  })

  it('o passo de WhatsApp escolhe só entre os telefones marcados, e trocar de canal zera o número', async () => {
    const { usuario } = renderizarAppCom('/sequencias/sequencia-openai', { contas: comListasDaSarah })
    await screen.findByTestId('composer-step')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'E-mail do Contato neste passo' }), '2')

    await usuario.click(screen.getByRole('tab', { name: /WhatsApp/ }))

    const seletor = screen.getByRole('combobox', { name: 'Telefone do Contato neste passo' })
    expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Número 1 · +5511988887777 (Celular)',
      'Número 3 · +551122223333 (Fixo)',
    ])
    expect(seletor).toHaveValue('1')
    expect(destinoAtual()).toHaveTextContent('+5511988887777')

    await usuario.selectOptions(seletor, '3')
    expect(destinoAtual()).toHaveTextContent('+551122223333')
  })

  it('o Contato com um só e-mail, e a Demonstração, não mostram o seletor', async () => {
    renderizarApp('/sequencias/sequencia-openai')
    await screen.findByTestId('composer-step')

    expect(screen.queryByRole('combobox', { name: /neste passo/ })).not.toBeInTheDocument()
  })
})
