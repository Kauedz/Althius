import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Disponibilidade, FonteDeSinais } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

/** Uma Fonte de Sinais como a do Workspace operacional: cada tipo diz se está disponível, em teste ou em breve. */
const comDisponibilidade = (disponiveis: Record<string, Disponibilidade>) => (fonte: FonteDeSinais): FonteDeSinais =>
  Object.assign(Object.create(fonte) as FonteDeSinais, {
    tipos: async () =>
      (await fonte.tipos()).map((t) => ({ ...t, disponibilidade: disponiveis[t.id] ?? ('em-breve' as const) })),
    tipo: async (id: string) => ({ ...(await fonte.tipo(id)), disponibilidade: disponiveis[id] ?? ('em-breve' as const) }),
  })

const REAL = comDisponibilidade({ 'abertura-de-vagas': 'disponivel', 'nova-lideranca': 'em-teste' })

const cartao = async (nome: string) => (await screen.findByRole('heading', { level: 3, name: nome })).closest('li') as HTMLElement

describe('Catálogo de Sinais: o estado real de cada card', () => {
  it('a Demonstração mostra o catálogo completo, sem aviso nem selos de estado', async () => {
    renderizarApp('/sinais')
    const vagas = await cartao('Abertura de vagas')
    expect(within(vagas).getByRole('link')).toHaveAttribute('href', '/sinais/tipos/abertura-de-vagas')
    expect(screen.queryByText(/Novos Sinais entram aqui/)).not.toBeInTheDocument()
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
  })

  it('no Workspace operacional, o aviso no topo diz que novos Sinais entram ao passar no teste', async () => {
    renderizarAppCom('/sinais', { sinais: REAL })
    const aviso = await screen.findByRole('note', { name: 'Novos Sinais' })
    expect(aviso).toHaveTextContent('Novos Sinais entram aqui assim que passam no teste')
    expect(aviso).toHaveTextContent('Gupy')
    expect(aviso).toHaveTextContent('Google Ads')
    expect(aviso).toHaveTextContent('Reclame Aqui')
  })

  it('o card disponível abre normalmente; o em teste e o em breve mostram o estado e o motivo, sem deixar criar', async () => {
    renderizarAppCom('/sinais', { sinais: REAL })
    const disponivel = await cartao('Abertura de vagas')
    expect(within(disponivel).getByRole('link')).toHaveAttribute('href', '/sinais/tipos/abertura-de-vagas')
    expect(within(disponivel).getByText('Disponível')).toBeInTheDocument()

    const emTeste = await cartao('Nova liderança')
    expect(within(emTeste).queryByRole('link')).not.toBeInTheDocument()
    expect(within(emTeste).getByText('Em teste')).toBeInTheDocument()
    expect(within(emTeste).getByText(/ainda não roda de verdade/)).toBeInTheDocument()

    const emBreve = await cartao('Rodadas de investimento')
    expect(within(emBreve).queryByRole('link')).not.toBeInTheDocument()
    expect(within(emBreve).getByText('Em breve')).toBeInTheDocument()
    expect(within(emBreve).getByText(/chega em breve/)).toBeInTheDocument()
  })

  it('a página de um tipo que não está disponível não oferece Monitoramento novo e diz o motivo', async () => {
    renderizarAppCom('/sinais/tipos/rodadas', { sinais: REAL })
    expect(await screen.findByRole('heading', { level: 1, name: 'Rodadas de investimento' })).toBeInTheDocument()
    expect(await screen.findByText(/chega em breve/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Novo monitoramento/ })).not.toBeInTheDocument()
  })

  it('o endereço direto do formulário de um tipo que não está disponível volta para a página do tipo', async () => {
    renderizarAppCom('/sinais/tipos/rodadas/novo', { sinais: REAL })
    expect(await screen.findByText(/chega em breve/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar|Ativar/ })).not.toBeInTheDocument()
  })

  it('o tipo disponível continua oferecendo o Monitoramento novo', async () => {
    renderizarAppCom('/sinais/tipos/abertura-de-vagas', { sinais: REAL })
    expect(await screen.findByRole('link', { name: /Novo monitoramento/ })).toBeInTheDocument()
  })
})
