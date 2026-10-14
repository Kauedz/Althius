import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Catálogo único de Sinais', () => {
  it('mostra uma grade só, filtra por nicho e por família, e o pedido à equipe fica sempre visível', async () => {
    const { usuario } = renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    expect(within(catalogo).getByRole('heading', { level: 3, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(within(catalogo).queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem fonte')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b[A-H] ·/)

    const nichos = screen.getByRole('group', { name: 'Filtrar por nicho' })
    await usuario.click(within(nichos).getByRole('button', { name: 'Agro B2B' }))
    expect(screen.getByRole('link', { name: /Abertura de vagas/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Entrada de sócio/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nova cooperativa/ })).toBeInTheDocument()

    await usuario.click(within(nichos).getByRole('button', { name: 'Todos' }))
    const familias = screen.getByRole('group', { name: 'Filtrar por família' })
    await usuario.click(within(familias).getByRole('button', { name: 'Histórico comercial' }))
    expect(screen.getByRole('link', { name: /Proposta recusada/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abertura de vagas/ })).not.toBeInTheDocument()

    expect(screen.getByRole('region', { name: 'Pedir um Sinal' })).toHaveTextContent('Precisa de outro Sinal?')
    expect(screen.getByRole('link', { name: 'Falar com a equipe Althius' })).toHaveAttribute('href', '/sinais/pedidos')
  })

  it('a página do tipo tem um botão só, Criar Monitoramento, e a letra antiga do mercado vira o slug', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')
    expect(await screen.findByRole('link', { name: 'Criar Monitoramento' })).toHaveAttribute(
      'href',
      '/sinais/tipos/abertura-de-vagas/novo',
    )
    expect(screen.queryByRole('link', { name: 'Criar o primeiro' })).not.toBeInTheDocument()
    expect(screen.getByText(/Teto padrão de US\$ 20 por mês/)).toBeInTheDocument()
    expect(screen.getByText(/Vagas públicas em sites de emprego/)).toBeInTheDocument()

    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    await usuario.click(await screen.findByRole('link', { name: 'Painéis de mercado' }))
    expect(await screen.findByRole('link', { name: 'Comex e importação' })).toHaveAttribute(
      'href',
      '/sinais/mercado/comex-e-importacao',
    )
  })

  it('o pedido pede o evento, confirma o prazo e lista o status', async () => {
    const { usuario } = renderizarApp('/sinais/pedidos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Falar com a equipe Althius' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue(/Serviços financeiros/)).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Marina Alves')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveValue('marina.alves@databricks.com')

    await usuario.click(screen.getByRole('button', { name: 'Enviar pedido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/evento/i)

    await usuario.type(screen.getByRole('textbox', { name: 'Evento' }), 'Hospitais que anunciam novas alas')
    await usuario.click(screen.getByRole('radio', { name: 'Esta semana' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar pedido' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Pedido recebido, a equipe responde em até 2 dias úteis')
    const lista = await screen.findByRole('list', { name: 'Seus pedidos' })
    expect(within(lista).getByText('Hospitais que anunciam novas alas')).toBeInTheDocument()
    expect(within(lista).getByText('Novo')).toBeInTheDocument()
  })

  it('vagas-no-indeed abre Abertura de vagas', async () => {
    renderizarApp('/sinais/tipos/vagas-no-indeed')
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
  })

  it('um tipo arquivado volta ao catálogo', async () => {
    renderizarApp('/sinais/tipos/rodadas')
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Rodadas de investimento' })).not.toBeInTheDocument()
  })
})
