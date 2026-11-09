import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

async function abrirLote() {
  const app = renderizarApp('/contas')
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
  await app.usuario.click(within(tabela).getByRole('checkbox', { name: 'Selecionar Figma' }))
  await app.usuario.click(within(tabela).getByRole('checkbox', { name: 'Selecionar OpenAI' }))
  await app.usuario.click(screen.getByRole('button', { name: 'Criar Sequências' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Criar Sequências em lote' })
  return { ...app, dialogo }
}

describe('Criação em lote de Sequências', () => {
  it('na lista de Contas, seleciona várias, mostra quantas nascem e quais ficam de fora, e cria pelo template escolhido', async () => {
    const { usuario, fonteDeSequencias, dialogo } = await abrirLote()
    expect(within(dialogo).getByText('1 Sequência será criada.')).toBeInTheDocument()
    expect(within(dialogo).getByText(/OpenAI/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/Já em Sequência ativa/)).toBeInTheDocument()

    await usuario.selectOptions(await within(dialogo).findByRole('combobox', { name: 'Template das Sequências' }), 'abertura-por-sinal')
    expect(within(dialogo).getByText(/1 · Abertura com o Sinal \(E-mail\)/)).toBeInTheDocument()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar criação' }))

    expect(await screen.findByText(/1 Sequência criada/)).toBeInTheDocument()
    const criadas = (await fonteDeSequencias.sequencias()).filter((s) => s.contaId === 'figma')
    expect(criadas).toHaveLength(1)
    expect(criadas[0].steps.map((passo) => passo.titulo)).toEqual(['Abertura com o Sinal', 'Retomada', 'Último toque'])
  })

  it('sem template escolhido, nada é criado e a cadência não vem do Playbook', async () => {
    const { dialogo } = await abrirLote()
    expect(await within(dialogo).findByRole('combobox', { name: 'Template das Sequências' })).toHaveValue('')
    expect(within(dialogo).getByText(/Escolha um template da Althius ou um template seu/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Confirmar criação' })).toBeDisabled()
    expect(dialogo).not.toHaveTextContent(/Playbook/)
  })
})
