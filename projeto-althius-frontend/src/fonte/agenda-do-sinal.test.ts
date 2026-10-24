/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AGENDA_PADRAO,
  AVISO_DO_ESCOPO_GRANDE,
  CODIGOS_DE_ERRO_DA_AGENDA,
  DIAS_UTEIS,
  ErroDaAgenda,
  HORARIOS_POSSIVEIS,
  LIMITES_DA_AGENDA,
  REGRA_DA_AGENDA,
  TEXTO_DO_ERRO_DA_AGENDA,
  adicionarHorario,
  alternarDia,
  codigoDoErroDaAgenda,
  mesmaAgenda,
  proximaRodada,
  proximasRodadas,
  removerHorario,
  rodadasPorSemana,
  textoDaAgenda,
  textoDaRodada,
  textoDasProximasRodadas,
  textoDosDias,
  validarAgenda,
  type AgendaDoSinal,
} from './agenda-do-sinal'

// A Agenda vale no servidor (`private.validate_signal_schedule`, `private.next_signal_run`). Estes testes leem a migration e o
// pgTAP como texto e falham se os limites, os códigos de recusa ou a tabela de casos da próxima Rodada divergirem do código
// da tela. O arquivo do servidor fica fora de `src`: lê-se do disco.

const RAIZ = path.resolve(import.meta.dirname, '../../..')
const MIGRATION = readFileSync(path.join(RAIZ, 'supabase/migrations/20261118120000_agenda_do_sinal.sql'), 'utf8')
const PGTAP = readFileSync(path.join(RAIZ, 'supabase/tests/agenda_do_sinal.sql'), 'utf8')

const agenda = (horarios: string[], dias: number[] = [...DIAS_UTEIS]): AgendaDoSinal => ({ horarios, dias })

describe('os limites e os códigos são os do servidor', () => {
  const limite = (nome: string) => Number(new RegExp(`when '${nome}' then (\\d+)`).exec(MIGRATION)?.[1])

  it('o passo, o máximo por dia, o intervalo e o escopo grande', () => {
    expect(limite('step_minutes')).toBe(LIMITES_DA_AGENDA.passoEmMinutos)
    expect(limite('max_per_day')).toBe(LIMITES_DA_AGENDA.maximoPorDia)
    expect(limite('min_gap_minutes')).toBe(LIMITES_DA_AGENDA.intervaloMinimoEmMinutos)
    expect(limite('big_scope_accounts')).toBe(LIMITES_DA_AGENDA.contasDoEscopoGrande)
    expect(limite('big_scope_max_per_day')).toBe(LIMITES_DA_AGENDA.maximoNoEscopoGrande)
  })

  it('os dias úteis são o padrão do servidor', () => {
    expect(MIGRATION).toContain(`select '${JSON.stringify([...DIAS_UTEIS])}'::jsonb;`)
  })

  it('cada código de recusa da tela existe no servidor, e o servidor não recusa com código que a tela não conhece', () => {
    const doServidor = [...MIGRATION.matchAll(/fail_signal_schedule\('([a-z_]+)'\)/g)].map((m) => m[1])
    expect(new Set(doServidor)).toEqual(new Set(CODIGOS_DE_ERRO_DA_AGENDA))
    for (const codigo of CODIGOS_DE_ERRO_DA_AGENDA) expect(TEXTO_DO_ERRO_DA_AGENDA[codigo]).toBeTruthy()
  })

  it('a tela oferece todos os horários de 15 em 15 minutos', () => {
    expect(HORARIOS_POSSIVEIS).toHaveLength(96)
    expect(HORARIOS_POSSIVEIS[0]).toBe('00:00')
    expect(HORARIOS_POSSIVEIS[1]).toBe('00:15')
    expect(HORARIOS_POSSIVEIS[95]).toBe('23:45')
    expect(HORARIOS_POSSIVEIS.every((h) => validarAgenda(agenda([h])) === null)).toBe(true)
  })

  it('o texto da regra e o aviso do escopo grande saem dos limites', () => {
    expect(REGRA_DA_AGENDA).toBe('Até 6 rodadas por dia, com pelo menos 2 horas entre elas.')
    expect(AVISO_DO_ESCOPO_GRANDE).toBe('Com mais de 50 Contas, o Sinal roda 1 vez por dia.')
  })

  it('o código do banco vira o código da tela', () => {
    expect(codigoDoErroDaAgenda('signal schedule invalid: intervalo_curto')).toBe('intervalo_curto')
    expect(codigoDoErroDaAgenda('signal schedule invalid: coisa_nova')).toBeNull()
    expect(codigoDoErroDaAgenda('outra mensagem')).toBeNull()
    expect(new ErroDaAgenda('muitas_contas').message).toBe('Com mais de 50 Contas, o Sinal roda 1 vez por dia.')
  })
})

describe('a próxima Rodada: a tabela de casos do pgTAP, rodada aqui', () => {
  // Cada caso do pgTAP (`insert into casos values (...)`): a Agenda, o instante de partida e o horário esperado.
  const casos = [...PGTAP.matchAll(/\('(\d\d [^']+)', '(\{[^']*\})',\s*'([^']+)', '([^']+)'\)/g)].map((m) => ({
    nome: m[1],
    agenda: JSON.parse(m[2]) as { horarios: string[]; dias?: number[] },
    depois: m[3],
    esperado: m[4],
  }))
  // "2026-10-26 08:00:00.000001-03" -> ISO. O Date só guarda milissegundos; o horário igual ao instante não conta nos dois lados.
  const instante = (texto: string) => new Date(texto.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))

  it('lê os casos do pgTAP', () => {
    expect(casos.length).toBe(18)
  })

  it.each(casos.map((c) => [c.nome, c] as const))('%s', (_nome, c) => {
    const proxima = proximaRodada({ horarios: c.agenda.horarios, dias: c.agenda.dias ?? [...DIAS_UTEIS] }, instante(c.depois))
    expect(proxima?.toISOString()).toBe(instante(c.esperado).toISOString())
  })

  it('sem horário ou sem dia não há próxima Rodada', () => {
    expect(proximaRodada(agenda([]), new Date('2026-10-26T12:00:00Z'))).toBeNull()
    expect(proximaRodada(agenda(['08:00'], []), new Date('2026-10-26T12:00:00Z'))).toBeNull()
  })

  it('os próximos horários seguem um depois do outro, de sexta 18:00 em diante', () => {
    const lista = proximasRodadas(agenda(['08:00', '14:00']), new Date('2026-10-23T21:00:00Z'), 5)
    expect(lista.map((d) => d.toISOString())).toEqual([
      '2026-10-26T11:00:00.000Z',
      '2026-10-26T17:00:00.000Z',
      '2026-10-27T11:00:00.000Z',
      '2026-10-27T17:00:00.000Z',
      '2026-10-28T11:00:00.000Z',
    ])
  })
})

describe('validar a Agenda: as recusas do pgTAP, conferidas aqui', () => {
  // Os casos de `private.validate_signal_schedule` que a tela sabe representar (horários em texto, dias em número).
  const aceitos = [...PGTAP.matchAll(/lives_ok\(\$\$select private\.validate_signal_schedule\('(\{[^']*\})', (\d+)\)\$\$/g)].map((m) => ({
    json: JSON.parse(m[1]) as { horarios?: unknown; dias?: unknown },
    contas: Number(m[2]),
  }))
  const recusados = [
    ...PGTAP.matchAll(/throws_ok\(\$\$select private\.validate_signal_schedule\('(\{[^']*\})', (\d+)\)\$\$,\s*'22023', 'signal schedule invalid: ([a-z_]+)'/g),
  ].map((m) => ({ json: JSON.parse(m[1]) as { horarios?: unknown; dias?: unknown; fuso?: unknown; extra?: unknown }, contas: Number(m[2]), codigo: m[3] }))

  /** A Agenda que a tela representa: horários em texto e dias em número (os dias que faltam valem os dias úteis). */
  function daTela(json: { horarios?: unknown; dias?: unknown; fuso?: unknown; extra?: unknown }): AgendaDoSinal | null {
    if ((json.fuso !== undefined && json.fuso !== 'America/Sao_Paulo') || json.extra !== undefined) return null
    if (!Array.isArray(json.horarios) || !json.horarios.every((h) => typeof h === 'string')) return null
    if (json.dias !== undefined && (!Array.isArray(json.dias) || !json.dias.every((d) => typeof d === 'number'))) return null
    return { horarios: json.horarios as string[], dias: (json.dias as number[] | undefined) ?? [...DIAS_UTEIS] }
  }

  it('lê os casos do pgTAP', () => {
    expect(aceitos.length).toBeGreaterThanOrEqual(6)
    expect(recusados.length).toBeGreaterThanOrEqual(20)
  })

  it('o que o servidor aceita, a tela aceita', () => {
    let conferidos = 0
    for (const caso of aceitos) {
      const doServidor = daTela(caso.json)
      if (!doServidor) continue
      conferidos++
      expect(validarAgenda(doServidor, caso.contas), JSON.stringify(caso.json)).toBeNull()
    }
    expect(conferidos).toBe(aceitos.length)
  })

  it('o que o servidor recusa, a tela recusa com o mesmo código', () => {
    let conferidos = 0
    for (const caso of recusados) {
      const doServidor = daTela(caso.json)
      if (!doServidor) continue
      conferidos++
      expect(validarAgenda(doServidor, caso.contas), JSON.stringify(caso.json)).toBe(caso.codigo)
    }
    // Só ficam de fora os formatos que a tela nunca produz (fuso, campo desconhecido, horário que não é texto, dia em texto).
    expect(conferidos).toBeGreaterThanOrEqual(recusados.length - 6)
  })

  it('1h45 de intervalo, 7 horários e mais de 50 Contas com 2 horários', () => {
    expect(validarAgenda(agenda(['08:00', '09:45']))).toBe('intervalo_curto')
    expect(validarAgenda(agenda(['08:00', '10:00']))).toBeNull()
    expect(validarAgenda(agenda(['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00']))).toBe('muitos_horarios')
    expect(validarAgenda(agenda(['08:00', '14:00']), 51)).toBe('muitas_contas')
    expect(validarAgenda(agenda(['08:00', '14:00']), 50)).toBeNull()
    expect(validarAgenda(agenda(['08:00']), 51)).toBeNull()
  })

  it('a virada do dia conta: 23:00 e 01:00 são 2 horas, 23:15 e 01:00 são 1h45', () => {
    expect(validarAgenda(agenda(['23:00', '01:00']))).toBeNull()
    expect(validarAgenda(agenda(['23:15', '01:00']))).toBe('intervalo_curto')
  })
})

describe('editar a Agenda', () => {
  it('o padrão é um horário em dias úteis', () => {
    expect(AGENDA_PADRAO).toEqual({ horarios: ['08:00'], dias: [1, 2, 3, 4, 5] })
    expect(validarAgenda(AGENDA_PADRAO)).toBeNull()
  })

  it('adicionar e remover horários mantém a ordem', () => {
    let a = adicionarHorario(AGENDA_PADRAO, '14:00')
    expect(a.horarios).toEqual(['08:00', '14:00'])
    a = adicionarHorario(a, '11:00')
    expect(a.horarios).toEqual(['08:00', '11:00', '14:00'])
    expect(removerHorario(a, '11:00').horarios).toEqual(['08:00', '14:00'])
    expect(AGENDA_PADRAO.horarios).toEqual(['08:00'])
  })

  it('alternar um dia liga e desliga, em ordem', () => {
    const sabado = alternarDia(AGENDA_PADRAO, 6)
    expect(sabado.dias).toEqual([1, 2, 3, 4, 5, 6])
    expect(alternarDia(sabado, 6).dias).toEqual([1, 2, 3, 4, 5])
    expect(alternarDia(agenda(['08:00'], [1]), 1).dias).toEqual([])
    expect(validarAgenda(alternarDia(agenda(['08:00'], [1]), 1))).toBe('sem_dia')
  })

  it('comparar ignora a ordem', () => {
    expect(mesmaAgenda(agenda(['14:00', '08:00'], [3, 1]), agenda(['08:00', '14:00'], [1, 3]))).toBe(true)
    expect(mesmaAgenda(agenda(['08:00']), agenda(['09:00']))).toBe(false)
  })

  it('as rodadas por semana são horários vezes dias', () => {
    expect(rodadasPorSemana(AGENDA_PADRAO)).toBe(5)
    expect(rodadasPorSemana(agenda(['08:00', '14:00']))).toBe(10)
    expect(rodadasPorSemana(agenda(['08:00', '14:00'], [1, 2, 3, 4, 5, 6, 7]))).toBe(14)
  })
})

describe('os textos', () => {
  it('os dias', () => {
    expect(textoDosDias([1, 2, 3, 4, 5])).toBe('seg a sex')
    expect(textoDosDias([5, 3, 1])).toBe('seg, qua e sex')
    expect(textoDosDias([1, 2, 3, 4, 5, 6, 7])).toBe('todos os dias')
    expect(textoDosDias([6, 7])).toBe('sáb e dom')
    expect(textoDosDias([2])).toBe('ter')
  })

  it('a Agenda', () => {
    expect(textoDaAgenda(agenda(['14:00', '08:00']))).toBe('08:00 e 14:00, seg a sex')
    expect(textoDaAgenda(agenda(['08:00', '12:00', '16:00'], [1, 3]))).toBe('08:00, 12:00 e 16:00, seg e qua')
  })

  it('a Rodada, no horário de Brasília e com "por volta de"', () => {
    expect(textoDaRodada('2026-10-26T11:00:00.000Z')).toBe('seg 26/10 por volta de 08:00')
    expect(textoDaRodada('2026-10-27T02:15:00.000Z')).toBe('seg 26/10 por volta de 23:15')
    expect(textoDaRodada(new Date('2026-12-31T20:00:00Z'))).toBe('qui 31/12 por volta de 17:00')
  })

  it('as próximas Rodadas', () => {
    expect(textoDasProximasRodadas(['2026-10-26T11:00:00.000Z', '2026-10-26T17:00:00.000Z', '2026-10-27T11:00:00.000Z'])).toBe(
      'Próximas rodadas: seg 26/10 por volta de 08:00, seg 26/10 por volta de 14:00 e ter 27/10 por volta de 08:00.',
    )
  })
})
