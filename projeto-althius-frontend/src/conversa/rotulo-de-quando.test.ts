import { describe, expect, it } from 'vitest'
import { rotuloDeQuando } from './historico-grupos'

// Quinta-feira, 15 de outubro de 2026, 12:00 em Brasília.
const AGORA = new Date('2026-10-15T15:00:00Z')

describe('o rótulo de quando uma Conversa foi atualizada', () => {
  it('hoje mostra a hora, no fuso de Brasília', () => {
    expect(rotuloDeQuando('2026-10-15T13:30:00Z', AGORA)).toBe('10:30')
  })

  it('ontem diz "Ontem", mesmo que passe da meia-noite em UTC', () => {
    expect(rotuloDeQuando('2026-10-14T23:30:00Z', AGORA)).toBe('Ontem')
    // 02:30 UTC de 15/10 ainda é 23:30 de 14/10 em Brasília.
    expect(rotuloDeQuando('2026-10-15T02:30:00Z', AGORA)).toBe('Ontem')
  })

  it('na última semana mostra o dia da semana, sem ponto', () => {
    expect(rotuloDeQuando('2026-10-12T15:00:00Z', AGORA)).toBe('seg')
  })

  it('antes disso mostra o dia e o mês', () => {
    expect(rotuloDeQuando('2026-09-05T15:00:00Z', AGORA)).toBe('5 set')
  })
})
