import { describe, expect, it } from 'vitest'
import { formatarDataCompleta, formatarDataDoModulo, formatarPeriodoIsoPorExtenso } from './formatar-data'

describe('Formatação de datas do módulo', () => {
  const hoje = new Date(2026, 8, 23, 12, 0, 0) // 23 de setembro de 2026

  it('formata o dia de hoje', () => {
    const hojeMesmo = new Date(2026, 8, 23, 8, 0, 0)
    expect(formatarDataDoModulo(hojeMesmo, hoje)).toBe('hoje')
    expect(formatarDataDoModulo(hojeMesmo, hoje, { maiuscula: true })).toBe('Hoje')
  })

  it('formata ontem', () => {
    const ontem = new Date(2026, 8, 22, 15, 0, 0)
    expect(formatarDataDoModulo(ontem, hoje)).toBe('ontem')
    expect(formatarDataDoModulo(ontem, hoje, { maiuscula: true })).toBe('Ontem')
  })

  it('formata há N dias (2 a 6 dias)', () => {
    const doisDiasAtras = new Date(2026, 8, 21, 10, 0, 0)
    expect(formatarDataDoModulo(doisDiasAtras, hoje)).toBe('há 2 dias')
    expect(formatarDataDoModulo(doisDiasAtras, hoje, { maiuscula: true })).toBe('Há 2 dias')

    const cincoDiasAtras = new Date(2026, 8, 18, 10, 0, 0)
    expect(formatarDataDoModulo(cincoDiasAtras, hoje)).toBe('há 5 dias')
    expect(formatarDataDoModulo(cincoDiasAtras, hoje, { maiuscula: true })).toBe('Há 5 dias')
  })

  it('formata há N semanas (7 a 30 dias)', () => {
    const umaSemanaAtras = new Date(2026, 8, 16, 12, 0, 0) // 7 dias
    expect(formatarDataDoModulo(umaSemanaAtras, hoje)).toBe('há 1 semana')
    expect(formatarDataDoModulo(umaSemanaAtras, hoje, { maiuscula: true })).toBe('Há 1 semana')

    const duasSemanasAtras = new Date(2026, 8, 9, 12, 0, 0) // 14 dias
    expect(formatarDataDoModulo(duasSemanasAtras, hoje)).toBe('há 2 semanas')
    expect(formatarDataDoModulo(duasSemanasAtras, hoje, { maiuscula: true })).toBe('Há 2 semanas')

    const quatroSemanasAtras = new Date(2026, 7, 26, 12, 0, 0) // 28 dias
    expect(formatarDataDoModulo(quatroSemanasAtras, hoje)).toBe('há 4 semanas')
    expect(formatarDataDoModulo(quatroSemanasAtras, hoje, { maiuscula: true })).toBe('Há 4 semanas')
  })

  it('formata data explícita no mesmo ano (> 30 dias)', () => {
    const dataMesmoAno = new Date(2026, 2, 12, 10, 0, 0) // 12 mar. 2026
    expect(formatarDataDoModulo(dataMesmoAno, hoje)).toBe('12 mar.')
    expect(formatarDataDoModulo(dataMesmoAno, hoje, { maiuscula: true })).toBe('12 mar.')
  })

  it('formata data explícita em outro ano (> 30 dias)', () => {
    const dataOutroAno = new Date(2025, 2, 12, 10, 0, 0) // 12 mar. 2025
    expect(formatarDataDoModulo(dataOutroAno, hoje)).toBe('12 mar. 2025')
  })

  it('formata data completa para tooltip e acessibilidade', () => {
    const data = new Date(2026, 2, 12, 10, 0, 0)
    expect(formatarDataCompleta(data)).toBe('12 de março de 2026')
  })
})

describe('Formatação de períodos', () => {
  it('não repete o mês nem o ano em comum', () => {
    expect(formatarPeriodoIsoPorExtenso('2026-09-01', '2026-09-23')).toBe('1 a 23 de setembro de 2026')
    expect(formatarPeriodoIsoPorExtenso('2026-08-28', '2026-09-03')).toBe('28 de agosto a 3 de setembro de 2026')
    expect(formatarPeriodoIsoPorExtenso('2025-12-15', '2026-01-14')).toBe('15 de dezembro de 2025 a 14 de janeiro de 2026')
  })

  it('um período de um dia só mostra o dia', () => {
    expect(formatarPeriodoIsoPorExtenso('2026-10-01', '2026-10-01')).toBe('1 de outubro de 2026')
  })
})
