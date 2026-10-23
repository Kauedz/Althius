import { describe, expect, it } from 'vitest'
import { tempoRelativo } from './tempo-relativo'

const agora = new Date(2026, 9, 23, 15, 0, 0)

describe('tempoRelativo', () => {
  it('diz agora quando faz menos de um minuto', () => {
    expect(tempoRelativo(new Date(2026, 9, 23, 14, 59, 30), agora)).toBe('agora')
  })

  it('diz os minutos de hoje', () => {
    expect(tempoRelativo(new Date(2026, 9, 23, 14, 48), agora)).toBe('há 12 min')
  })

  it('diz as horas de hoje', () => {
    expect(tempoRelativo(new Date(2026, 9, 23, 12, 0), agora)).toBe('há 3 h')
  })

  it('diz ontem com a hora', () => {
    expect(tempoRelativo(new Date(2026, 9, 22, 16, 40), agora)).toBe('ontem, 16:40')
  })

  it('diz o dia da semana com a hora nos últimos 7 dias', () => {
    expect(tempoRelativo(new Date(2026, 9, 20, 10, 15), agora)).toBe('terça, 10:15')
    expect(tempoRelativo(new Date(2026, 9, 16, 9, 0), agora)).toBe('sexta, 09:00')
  })

  it('diz o dia e o mês nas datas mais antigas', () => {
    expect(tempoRelativo(new Date(2026, 9, 14, 10, 0), agora)).toBe('14 out')
    expect(tempoRelativo(new Date(2026, 9, 2, 8, 0), agora)).toBe('2 out')
  })
})
