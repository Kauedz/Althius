import { describe, expect, it } from 'vitest'
import { classificarPedido } from './classificar-pedido'

describe('classificarPedido', () => {
  it('identifica um pedido geral sem intenção de acompanhamento', () => {
    expect(classificarPedido('O que é Aderência?')).toEqual({ caminho: 'geral' })
  })

  it('sugere Modelos compatíveis com um pedido de acompanhamento', () => {
    const resultado = classificarPedido('Quero acompanhar novas vagas de engenharia')
    expect(resultado.caminho).toBe('modelo')
    if (resultado.caminho === 'modelo') expect(resultado.modelos.map((modelo) => modelo.id)).toContain('abertura-de-vagas')
  })

  it('reconhece um Sinal novo quando não há Modelo compatível', () => {
    expect(classificarPedido('Monitore a variação diária do preço do cacau em bolsas locais')).toEqual({ caminho: 'plano_novo' })
  })
})
