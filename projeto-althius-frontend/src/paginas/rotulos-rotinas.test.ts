import { describe, expect, it } from 'vitest'
import { descreverFrequencia } from './rotulos'

describe('descreverFrequencia com o dia do mês', () => {
  it('a Rotina mensal diz o dia do mês', () => {
    expect(descreverFrequencia({ frequencia: 'mensal', diaDoMes: 15, horario: '09:00' })).toBe('Todo mês, dia 15 às 09:00')
  })

  it('sem o dia do mês, a frase é a de sempre', () => {
    expect(descreverFrequencia({ frequencia: 'mensal', horario: '09:00' })).toBe('Todo mês às 09:00')
    expect(descreverFrequencia({ frequencia: 'diaria', horario: '08:00' })).toBe('Todo dia às 08:00')
  })
})
