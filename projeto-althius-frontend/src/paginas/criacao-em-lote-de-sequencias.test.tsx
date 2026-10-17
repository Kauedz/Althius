import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Criação em lote de Sequências', () => {
  it('na lista de Contas, seleciona várias, mostra quantas nascem e quais ficam de fora, e cria pelo modelo da Cadência', async () => {
    const { usuario, fonteDeSequencias } = renderizarApp('/contas')
    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })

    await usuario.click(within(tabela).getByRole('checkbox', { name: 'Selecionar Figma' }))
    await usuario.click(within(tabela).getByRole('checkbox', { name: 'Selecionar OpenAI' }))

    await usuario.click(screen.getByRole('button', { name: 'Criar Sequências' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Criar Sequências em lote' })
    expect(within(dialogo).getByRole('checkbox', { name: /Usar a Cadência do Playbook como modelo/ })).toBeChecked()
    expect(within(dialogo).getByText(/Dia 1 · Abertura pelo Sinal/)).toBeInTheDocument()
    expect(within(dialogo).getByText('1 Sequência será criada.')).toBeInTheDocument()
    expect(within(dialogo).getByText(/OpenAI/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/Já em Sequência ativa/)).toBeInTheDocument()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar criação' }))

    expect(await screen.findByText(/1 Sequência criada/)).toBeInTheDocument()
    const criadas = (await fonteDeSequencias.sequencias()).filter((s) => s.contaId === 'figma')
    expect(criadas).toHaveLength(1)
    expect(criadas[0].steps.length).toBeGreaterThan(0)
  })
})
