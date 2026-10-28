// Ticket 5b: o pedido que a equipe publicou como Modelo oferece "Usar o Modelo" a quem pediu; o que ainda está em
// construção, não.
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDeSinais, PedidoDeSinal } from '@/fonte/sinais-tipos'
import { renderizarAppCom } from '@/test/renderizar'

const BASE: Omit<PedidoDeSinal, 'id' | 'evento' | 'status'> = {
  empresasOuNicho: 'Comex e importação',
  urgencia: 'este_mes',
  contato: { nome: 'Marina Alves', email: 'marina.alves@databricks.com' },
  criadoEm: '2026-09-20T12:00:00Z',
}

const comPedidos = (fonte: FonteDeSinais): FonteDeSinais =>
  Object.assign(Object.create(fonte) as FonteDeSinais, {
    pedidosDeSinal: () => Promise.resolve([
      { ...BASE, id: 'p1', evento: 'Portos com fila de navios', status: 'disponivel', modeloId: 'pedido-abc123' },
      { ...BASE, id: 'p2', evento: 'Armazém novo em Santos', status: 'em_construcao' },
    ] satisfies PedidoDeSinal[]),
  })

describe('Pedido de Sinal vira Modelo', () => {
  it('o pedido disponível leva ao Briefing com o Modelo; o em construção não oferece', async () => {
    renderizarAppCom('/sinais/pedidos', { sinais: comPedidos })
    const usar = await screen.findByRole('link', { name: 'Usar o Modelo' })
    expect(usar).toHaveAttribute('href', '/sinais/novo?modelo=pedido-abc123')
    expect(screen.getAllByRole('link', { name: 'Usar o Modelo' })).toHaveLength(1)
  })
})
