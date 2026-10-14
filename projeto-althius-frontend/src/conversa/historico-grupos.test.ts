import { describe, expect, it } from 'vitest'
import type { ResumoDeConversa } from '@/fonte/tipos'
import { agruparConversas } from './historico-grupos'

const agora = new Date(2026, 9, 14, 15, 0)
const conversa = (id: string, atualizadaEm: Date, extra: Partial<ResumoDeConversa> = {}): ResumoDeConversa => ({
  id,
  titulo: null,
  primeiroPedido: `Pedido ${id}`,
  atualizadaEm: atualizadaEm.toISOString(),
  emAndamento: false,
  ...extra,
})

describe('agruparConversas', () => {
  const lista = [
    conversa('hoje', new Date(2026, 9, 14, 9, 0)),
    conversa('ontem', new Date(2026, 9, 13, 22, 0), { titulo: 'Previsão do trimestre' }),
    conversa('semana', new Date(2026, 9, 8, 10, 0)),
    conversa('antiga', new Date(2026, 8, 1, 10, 0)),
  ]

  it('agrupa em Hoje, Últimos 7 dias e Mais antigas, nessa ordem', () => {
    expect(agruparConversas(lista, '', agora).map((g) => [g.nome, g.conversas.map((c) => c.id)])).toEqual([
      ['Hoje', ['hoje']],
      ['Últimos 7 dias', ['ontem', 'semana']],
      ['Mais antigas', ['antiga']],
    ])
  })

  it('a busca acha pelo nome, sem acento nem maiúscula, e esconde os grupos vazios', () => {
    expect(agruparConversas(lista, 'previsao', agora)).toEqual([
      { nome: 'Últimos 7 dias', conversas: [lista[1]] },
    ])
  })

  it('a busca também acha pelo primeiro pedido', () => {
    expect(agruparConversas(lista, 'pedido antiga', agora).map((g) => g.nome)).toEqual(['Mais antigas'])
  })
})
