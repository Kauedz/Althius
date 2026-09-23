import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Módulo Sequências e Casca (Ticket 02)', () => {
  it('o item "Sequências" aparece na seção Workspace da sidebar entre Contas e Contatos e Agentes e abre o módulo', async () => {
    const { usuario } = renderizarApp('/')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const links = within(nav).getAllByRole('link')
    expect(links[0]).toHaveTextContent('Contas e Contatos')
    expect(links[1]).toHaveTextContent('Sequências')
    expect(links[2]).toHaveTextContent('Agentes')

    // Clicar em Sequências abre a página de Sequências
    await usuario.click(links[1])
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(links[1]).toHaveAttribute('aria-current', 'page')
  })

  it('o item Sequências fica ativo em sub-rotas do módulo', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const linkSequencias = within(nav).getByRole('link', { name: 'Sequências' })
    expect(linkSequencias).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
  })

  it('a página inicial continua sendo a grade de Agentes', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
  })

  it('a tela de Sequências exibe o título, descrição, contagem e as sequências iniciais da demo', async () => {
    renderizarApp('/sequencias')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(
      screen.getByText(/Planos de abordagem por Conta-alvo/i),
    ).toBeInTheDocument()
    expect(screen.getByText('7 sequências')).toBeInTheDocument()

    const lista = screen.getByRole('list', { name: 'Lista de Sequências' })
    expect(within(lista).getByText('openai')).toBeInTheDocument()
    expect(within(lista).getByText('stripe')).toBeInTheDocument()
  })

  it('abrir Sequências com fonte vazia mostra estado vazio e não quebra Contas nem Agentes', async () => {
    const { usuario } = renderizarApp('/sequencias', {}, { vazia: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma sequência ainda/i)).toBeInTheDocument()

    // Navegar para Contas funciona perfeitamente
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    await usuario.click(within(nav).getByRole('link', { name: 'Contas e Contatos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()

    // Navegar para Agentes funciona perfeitamente
    await usuario.click(within(nav).getByRole('link', { name: 'Agentes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()

    // Voltar para Sequências vazia continua funcionando
    await usuario.click(within(nav).getByRole('link', { name: 'Sequências' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma sequência ainda/i)).toBeInTheDocument()
  })

  it('exibe alerta de erro e permite recarregar via "Tentar de novo"', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias', {}, { falha: true })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar as sequências.')

    fonteDeSequencias.definirFalha(false)
    const botaoTentar = within(alerta).getByRole('button', { name: 'Tentar de novo' })
    await usuario.click(botaoTentar)

    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
  })

  it('recarrega automaticamente quando a fonte avisa uma mudança via observar', async () => {
    const { fonteDeSequencias } = renderizarApp('/sequencias')

    expect(await screen.findByText('7 sequências')).toBeInTheDocument()

    await fonteDeSequencias.criarSequencia({
      contaId: 'figma',
      participantesIds: ['contato-figma-1'],
    })

    expect(await screen.findByText('8 sequências')).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Lista de Sequências' })
    expect(within(lista).getByText('figma')).toBeInTheDocument()
  })
})
