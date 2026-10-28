import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'
import { ErroDoAgente, type FonteDoAgente } from '@/fonte/agente-tipos'

describe('A tela inicial é a conversa com o agente', () => {
  it('abre vazia, com o pedido ao agente e sugestões', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { name: 'O que você quer prospectar hoje?' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Peça algo ao agente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostre o ICP salvo do Workspace' })).toBeInTheDocument()
  })

  it('um pedido mostra os passos do agente, as empresas com a Aderência e por que combinam, e o gasto em créditos', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo ao agente' }), 'Ache empresas de logística{Enter}')

    const turno = await screen.findByRole('region', { name: 'Pedido: Ache empresas de logística' })
    const passos = within(turno).getByRole('list', { name: 'Passos do agente' })
    expect(within(passos).getByText('Ler o ICP do Workspace')).toBeInTheDocument()
    expect(within(passos).getByText('Buscar até 20 empresas pelo ICP')).toBeInTheDocument()

    const empresas = within(turno).getByRole('list', { name: 'Empresas encontradas' })
    expect(within(empresas).getByText('Translog Cargas Ltda')).toBeInTheDocument()
    expect(within(empresas).getByRole('list', { name: 'Por que Translog Cargas Ltda combina' })).toBeInTheDocument()
    expect(screen.getByText(/Gasto nesta conversa: 5 de 50 créditos/)).toBeInTheDocument()
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument()
  })

  it('aceitar uma empresa no cartão a torna Conta-alvo e oferece enriquecer o comitê', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo ao agente' }), 'Ache empresas{Enter}')
    await usuario.click(await screen.findByRole('button', { name: 'Aceitar Translog Cargas Ltda' }))

    expect(await screen.findByRole('button', { name: 'Enriquecer o comitê de Translog Cargas Ltda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceitar Translog Cargas Ltda' })).not.toBeInTheDocument()
  })

  it('a conversa fica no endereço e volta pelo histórico', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.click(await screen.findByRole('button', { name: 'Mostre o ICP salvo do Workspace' }))
    await screen.findByText('Este é o ICP salvo hoje, versão 3.')
    await usuario.click(screen.getByRole('button', { name: 'Nova conversa' }))
    expect(await screen.findByRole('heading', { name: 'O que você quer prospectar hoje?' })).toBeInTheDocument()

    await usuario.click(await screen.findByRole('button', { name: 'Conversas' }))
    const lista = screen.getByRole('navigation', { name: 'Conversas com o agente' })
    await usuario.click(within(lista).getAllByRole('button')[0])
    expect(await screen.findByText('Este é o ICP salvo hoje, versão 3.')).toBeInTheDocument()
  })

  it('com o motor fora do ar, avisa e não deixa pedir', async () => {
    renderizarAppCom('/', { agente: (f): FonteDoAgente => ({ ...f, disponivel: async () => false }) })
    expect(await screen.findByText(/O motor de IA do agente está fora do ar agora/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mostre o ICP salvo do Workspace' })).toBeDisabled())
  })

  it('um erro do servidor aparece em português, sem código técnico', async () => {
    const { usuario } = renderizarAppCom('/', {
      agente: (f): FonteDoAgente => ({ ...f, enviar: async () => { throw new ErroDoAgente('x', 'model_rate_limited') } }),
    })
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo ao agente' }), 'Oi{Enter}')
    expect(await screen.findByText('Muitos pedidos ao mesmo tempo neste Workspace. Espere um pouco e tente de novo.')).toBeInTheDocument()
  })

  it('ler o site propõe o ICP sem salvar; salvar pede confirmação de nova versão e mostra o ICP salvo', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo ao agente' }), 'Monte o ICP lendo o site translog.com.br{Enter}')

    const proposta = await screen.findByRole('region', { name: 'Proposta de ICP lida de translog.com.br' })
    expect(within(proposta).getByText('Logística e transporte')).toBeInTheDocument()
    expect(within(proposta).getByText(/Ainda não salvo/)).toBeInTheDocument()

    await usuario.type(screen.getByRole('textbox', { name: 'Peça algo ao agente' }), 'Pode salvar{Enter}')
    expect(await screen.findByText(/grava uma nova versão no Workspace/)).toBeInTheDocument()
    expect(screen.queryByText(/prospect/)).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar nova versão' }))
    expect(await screen.findByText('ICP, versão 4')).toBeInTheDocument()
  })
  it('o ICP pelos negócios ganhos do CRM mostra onde diverge do salvo, com o CRM sugerido', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo ao agente' }), 'Proponha o ICP pelos negócios ganhos do CRM{Enter}')

    const proposta = await screen.findByRole('region', { name: 'Proposta de ICP pelos negócios ganhos (HubSpot)' })
    expect(within(proposta).getByText('12 negócios ganhos lidos')).toBeInTheDocument()
    const divergencias = within(proposta).getByRole('list', { name: 'Onde o CRM diverge do ICP salvo' })
    const itens = within(divergencias).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent('Porte')
    expect(itens[0]).toHaveTextContent('CRM: 201-500')
    expect(itens[0]).toHaveTextContent('Salvo: 51-200')
    expect(within(proposta).getAllByText('Sugerido: o do CRM')).toHaveLength(2)
    expect(within(proposta).getByText(/Ainda não salvo/)).toBeInTheDocument()
  })
})
