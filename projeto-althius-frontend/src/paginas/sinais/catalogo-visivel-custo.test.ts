import { describe, expect, it } from 'vitest'
import { ajudaDoCusto, cardPorId } from './catalogo-visivel'

describe('preço dos cards no editor', () => {
  it('os 3 cards de Mercado custam 3 por execução, também no preço por Conta', () => {
    for (const id of ['nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca', 'calendario-e-plano-safra']) {
      const card = cardPorId(id)
      expect(card?.creditosPorConta).toBe(3)
      expect(card?.custoRotulo).toBe('3 créditos por execução')
      expect(ajudaDoCusto(id)).toBe('Cada execução debita 3 créditos.')
    }
  })

  it('o Sinal por Conta usa o preço do próprio card', () => {
    const card = cardPorId('abertura-de-vagas')
    const n = card?.creditosPorConta ?? 1
    expect(ajudaDoCusto('abertura-de-vagas')).toBe(
      n === 1 ? 'Cada Conta varrida debita 1 crédito.' : `Cada Conta varrida debita ${n} créditos.`,
    )
  })

  it('tipo sem card cobra 1 por Conta', () => {
    expect(ajudaDoCusto('tipo-que-nao-existe')).toBe('Cada Conta varrida debita 1 crédito.')
  })
})
