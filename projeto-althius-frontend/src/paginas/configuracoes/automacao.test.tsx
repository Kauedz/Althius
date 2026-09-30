import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

const linha = (nome: string) => screen.findByRole('listitem', { name: nome })

describe('Configurações › Automação e tetos', () => {
  it('lista os tipos de ação, os Agentes e as Integrações, tudo começando em confirmar', async () => {
    renderizarApp('/configuracoes/automacao')
    expect(await screen.findByRole('heading', { level: 2, name: 'Automação e tetos' })).toBeInTheDocument()
    for (const nome of ['Varredura de Sinais', 'Enriquecimento', 'Execuções de Agentes']) {
      const item = await linha(nome)
      expect(within(item).getByText('Cada ação pede confirmação.')).toBeInTheDocument()
    }
    expect(await screen.findByRole('heading', { level: 3, name: 'Agentes' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 3, name: 'Integrações' })).toBeInTheDocument()
  })

  it('automático sem teto é recusado na tela, com o motivo', async () => {
    const { usuario } = renderizarApp('/configuracoes/automacao')
    const item = await linha('Varredura de Sinais')
    await usuario.selectOptions(within(item).getByLabelText('Modo de Varredura de Sinais'), 'automatico')
    await usuario.click(within(item).getByRole('button', { name: 'Salvar' }))
    expect(await within(item).findByRole('alert')).toHaveTextContent('O automático precisa de um teto mensal aprovado.')
    expect(within(item).getByText('Cada ação pede confirmação.')).toBeInTheDocument()
  })

  it('com o teto aprovado, o automático passa a rodar e a página mostra o uso do mês', async () => {
    const { usuario } = renderizarApp('/configuracoes/automacao')
    const item = await linha('Enriquecimento')
    await usuario.selectOptions(within(item).getByLabelText('Modo de Enriquecimento'), 'automatico')
    await usuario.type(within(item).getByLabelText('Teto mensal de Enriquecimento'), '50')
    await usuario.click(within(item).getByRole('button', { name: 'Salvar' }))
    expect(await within(await linha('Enriquecimento')).findByText('Automático: 0 de 50 créditos usados no mês.')).toBeInTheDocument()
  })

  it('teto zero ou negativo é recusado', async () => {
    const { usuario } = renderizarApp('/configuracoes/automacao')
    const item = await linha('Execuções de Agentes')
    await usuario.type(within(item).getByLabelText('Teto mensal de Execuções de Agentes'), '0')
    await usuario.click(within(item).getByRole('button', { name: 'Salvar' }))
    expect(await within(item).findByRole('alert')).toHaveTextContent('O teto precisa ser maior que zero.')
  })

  it('a seção aparece nas abas de Configurações', async () => {
    renderizarApp('/configuracoes/perfil')
    const abas = await screen.findByRole('navigation', { name: 'Seções de Configurações' })
    expect(within(abas).getByRole('link', { name: 'Automação e tetos' })).toBeInTheDocument()
  })
})
