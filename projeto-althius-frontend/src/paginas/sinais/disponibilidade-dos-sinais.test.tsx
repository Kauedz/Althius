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

const cartao = async (nome: string) =>
  (await within(await screen.findByRole('region', { name: 'Catálogo de sinais' })).findByRole('heading', { level: 3, name: nome })).closest('li') as HTMLElement

describe('Catálogo de Sinais: o card visível não carrega selo de estado', () => {
  it('a Demonstração mostra o catálogo sem aviso nem selos de estado', async () => {
    renderizarApp('/sinais')
    const vagas = await cartao('Abertura de vagas')
    expect(within(vagas).getByRole('link')).toHaveAttribute('href', '/sinais/novo?modelo=abertura-de-vagas')
    expect(screen.queryByText(/Novos Sinais entram aqui/)).not.toBeInTheDocument()
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
  })

  it('no Workspace operacional os cards visíveis continuam iguais, sem selo e sem aviso', async () => {
    renderizarAppCom('/sinais', { sinais: REAL })
    const vagas = await cartao('Abertura de vagas')
    const lideranca = await cartao('Nova liderança')
    expect(within(vagas).getByRole('link')).toHaveAttribute('href', '/sinais/novo?modelo=abertura-de-vagas')
    expect(within(lideranca).getByRole('link')).toHaveAttribute('href', '/sinais/novo?modelo=nova-lideranca')
    expect(screen.queryByRole('note', { name: 'Novos Sinais' })).not.toBeInTheDocument()
    expect(screen.queryByText('Disponível')).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Rodadas de investimento' })).not.toBeInTheDocument()
  })

  it('um tipo que saiu da tela volta ao catálogo, inclusive no operacional', async () => {
    renderizarAppCom('/sinais/tipos/rodadas', { sinais: REAL })
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Rodadas de investimento' })).not.toBeInTheDocument()
  })

  it('o endereço direto do formulário de um tipo arquivado volta ao catálogo', async () => {
    renderizarAppCom('/sinais/tipos/rodadas/novo', { sinais: REAL })
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar|Ativar/ })).not.toBeInTheDocument()
  })

  it('o tipo visível oferece Ativar Monitoramento', async () => {
    renderizarAppCom('/sinais/tipos/abertura-de-vagas', { sinais: REAL })
    expect(await screen.findByRole('link', { name: 'Ativar Monitoramento' })).toBeInTheDocument()
  })
})
