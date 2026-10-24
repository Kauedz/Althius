/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AVISO_DE_REPETICAO,
  AUTOMACAO_NAO_LIBERADA,
  ErroDoLimite,
  LIMITES_DO_PRECO,
  PEDIDO_DE_AUTOMACAO,
  TEXTO_DA_PAUSA_POR_CREDITOS,
  TEXTO_DO_SEM_CREDITOS,
  TITULO_DA_PAUSA_POR_CREDITOS,
  codigoDoErroDoLimite,
  estimativaLocal,
  textoDaEstimativa,
  textoDoErroDoLimite,
  validarLimitePorDia,
} from './preco-por-rodada'

// A conta da Demonstração é a do servidor (`public.quote_signal_schedule`). Estes testes leem a migration e o pgTAP: os mesmos
// números e a mesma fórmula, para a tela nunca prometer uma conta que o banco não faz.

const RAIZ = path.resolve(import.meta.dirname, '../../..')
const MIGRATION = readFileSync(path.join(RAIZ, 'supabase/migrations/20261119120000_preco_por_rodada_e_limites.sql'), 'utf8')
const PGTAP = readFileSync(path.join(RAIZ, 'supabase/tests/preco_por_rodada_e_limites.sql'), 'utf8')

const DOIS_HORARIOS_UTEIS = { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5] }

describe('a estimativa antes de ativar', () => {
  it('12 Contas a 2 créditos e 2 horários em dias úteis: 24 por rodada, 48 por dia, 10 rodadas por semana, cerca de 1.040 por mês', () => {
    const e = estimativaLocal({ porRodada: 24, agenda: DOIS_HORARIOS_UTEIS, saldo: 1000 })

    expect(e).toMatchObject({
      porRodada: 24, rodadasPorSemana: 10, porDia: 48, porMesAprox: 1040, limiteSugeridoPorDia: 48, avisoDeRepeticao: false, ilimitado: false,
      bloqueio: null,
    })
    // O mesmo exemplo e o mesmo resultado que o pgTAP confere no banco.
    expect(PGTAP).toContain("'24|10|48|1040|1000.00|29|f|48|-|f'")
    expect(e.diasDeSaldo).toBe(29)
  })

  it('o mês arredonda para cima: 1 rodada por semana de 2 créditos é 8,67 e vira 9', () => {
    expect(estimativaLocal({ porRodada: 2, agenda: { horarios: ['08:00'], dias: [1] }, saldo: 0 }).porMesAprox).toBe(9)
  })

  it('a conta de dias de saldo é para baixo e usa a média da semana', () => {
    // 10 rodadas de 24 por semana: 34,29 por dia em média.
    const com = (saldo: number) => estimativaLocal({ porRodada: 24, agenda: DOIS_HORARIOS_UTEIS, saldo }).diasDeSaldo
    expect(com(110)).toBe(3)
    expect(com(34)).toBe(0)
    expect(com(35)).toBe(1)
    expect(com(0)).toBe(0)
    expect(com(-5)).toBe(0)
  })

  it('sem Agenda vale uma rodada por dia, todos os dias', () => {
    expect(estimativaLocal({ porRodada: 6, saldo: 100 })).toMatchObject({ rodadasPorSemana: 7, porDia: 6, porMesAprox: 182, avisoDeRepeticao: false })
  })

  it('o aviso de repetição vem acima de 2 rodadas por dia', () => {
    const com = (horarios: string[]) => estimativaLocal({ porRodada: 24, agenda: { horarios, dias: [1] }, saldo: 0 }).avisoDeRepeticao
    expect(com(['08:00'])).toBe(false)
    expect(com(['08:00', '14:00'])).toBe(false)
    expect(com(['08:00', '12:00', '16:00'])).toBe(true)
    expect(LIMITES_DO_PRECO.rodadasPorDiaParaOAviso).toBe(2)
  })

  it('a Equipe, ilimitada, e o Sinal sem custo não têm dias de saldo', () => {
    expect(estimativaLocal({ porRodada: 24, agenda: DOIS_HORARIOS_UTEIS, saldo: 0, ilimitado: true }).diasDeSaldo).toBeNull()
    expect(estimativaLocal({ porRodada: 0, agenda: DOIS_HORARIOS_UTEIS, saldo: 50 }).diasDeSaldo).toBeNull()
  })

  it('a fórmula e os limites são os da migration', () => {
    expect(MIGRATION).toContain('ceil((v_por_semana * 52 * v_por_rodada)::numeric / 12)')
    expect(MIGRATION).toContain('floor(greatest(v_saldo, 0) / (v_e.o_rodadas_por_semana * v_e.o_por_rodada / 7.0))')
    expect(MIGRATION).toContain(`when 'pause_after_skips' then ${LIMITES_DO_PRECO.rodadasPuladasParaPausar} `)
    expect(MIGRATION).toContain(`when 'repeat_warning_above' then ${LIMITES_DO_PRECO.rodadasPorDiaParaOAviso} `)
  })
})

describe('as frases', () => {
  it('a estimativa em créditos, com o saldo', () => {
    const e = estimativaLocal({ porRodada: 24, agenda: DOIS_HORARIOS_UTEIS, saldo: 110 })

    expect(textoDaEstimativa(e)).toBe(
      'Até 24 créditos por rodada · até 48 por dia · cerca de 1.040 por mês. Seu saldo dura cerca de 3 dias nesse ritmo.',
    )
  })

  it('o singular, o saldo curto e o que não tem saldo contado', () => {
    const base = { porRodada: 1, agenda: { horarios: ['08:00'], dias: [1] } }
    expect(textoDaEstimativa(estimativaLocal({ ...base, saldo: 1 }))).toBe(
      'Até 1 crédito por rodada · até 1 por dia · cerca de 5 por mês. Seu saldo dura cerca de 7 dias nesse ritmo.',
    )
    expect(textoDaEstimativa(estimativaLocal({ ...base, saldo: 0 }))).toContain('Seu saldo dura menos de 1 dia nesse ritmo.')
    expect(textoDaEstimativa(estimativaLocal({ porRodada: 24, agenda: DOIS_HORARIOS_UTEIS, saldo: 0, ilimitado: true }))).toBe(
      'Até 24 créditos por rodada · até 48 por dia · cerca de 1.040 por mês.',
    )
  })

  it('o texto do que acontece sem créditos é o pedido', () => {
    expect(TEXTO_DO_SEM_CREDITOS).toBe(
      'Se os créditos acabarem, a rodada é pulada sem cobrança. Depois de 3 rodadas puladas, o Sinal pausa e avisamos aqui.',
    )
    expect(TITULO_DA_PAUSA_POR_CREDITOS).toBe('Pausado por falta de créditos')
    expect(AVISO_DE_REPETICAO).toBe('Rodar várias vezes por dia costuma repetir resultados.')
    expect(PEDIDO_DE_AUTOMACAO).toBe('Peça ao responsável pelo plano para liberar a automação.')
  })

  it('nenhuma frase fala em dólar, em valor de Teto, em fornecedor ou em actor', () => {
    const frases = [
      TEXTO_DO_SEM_CREDITOS, TITULO_DA_PAUSA_POR_CREDITOS, TEXTO_DA_PAUSA_POR_CREDITOS, AVISO_DE_REPETICAO, PEDIDO_DE_AUTOMACAO,
      AUTOMACAO_NAO_LIBERADA,
      textoDaEstimativa(estimativaLocal({ porRodada: 24, agenda: DOIS_HORARIOS_UTEIS, saldo: 110 })),
      ...(['tipo_sem_limite', 'sem_estimativa', 'limite_invalido', 'acima_do_sugerido'] as const).map((c) => textoDoErroDoLimite(c, 48)),
    ]
    for (const frase of frases) expect(frase).not.toMatch(/US\$|\$|teto|apify|actor|fornecedor/i)
  })
})

describe('o limite por dia', () => {
  it('vale de 1 ao sugerido, em número inteiro: a pessoa pode baixar, não subir', () => {
    expect(validarLimitePorDia('30', 48)).toBeNull()
    expect(validarLimitePorDia('48', 48)).toBeNull()
    expect(validarLimitePorDia('1', 48)).toBeNull()
    expect(validarLimitePorDia(' 12 ', 48)).toBeNull()
    expect(validarLimitePorDia('49', 48)).toBe('acima_do_sugerido')
    expect(validarLimitePorDia('0', 48)).toBe('limite_invalido')
    expect(validarLimitePorDia('', 48)).toBe('limite_invalido')
    expect(validarLimitePorDia('-3', 48)).toBe('limite_invalido')
    expect(validarLimitePorDia('2,5', 48)).toBe('limite_invalido')
    expect(validarLimitePorDia('abc', 48)).toBe('limite_invalido')
  })

  it('cada recusa do servidor tem a sua frase, sem texto técnico', () => {
    expect(codigoDoErroDoLimite('daily credit cap invalid: acima_do_sugerido')).toBe('acima_do_sugerido')
    expect(codigoDoErroDoLimite('algo qualquer')).toBeNull()
    expect(new ErroDoLimite('acima_do_sugerido', 48).message).toBe('O limite não pode passar de 48 créditos por dia, o máximo da agenda.')
    expect(new ErroDoLimite('limite_invalido').message).toBe('Use um número inteiro de créditos, de 1 em diante.')
    for (const codigo of ['tipo_sem_limite', 'sem_estimativa', 'limite_invalido', 'acima_do_sugerido'] as const) {
      expect(MIGRATION).toContain(`daily credit cap invalid: ${codigo}`)
    }
  })
})
