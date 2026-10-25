/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AJUDA_DO_LIMITE_MENSAL,
  AVISO_DE_REPETICAO,
  AUTOMACAO_NAO_LIBERADA,
  BOTAO_LIBERAR_E_ATIVAR,
  CODIGOS_DE_ERRO_DA_AUTOMACAO,
  ErroDaAutomacao,
  ErroDoLimite,
  LIMITES_DO_PRECO,
  PEDIDO_DE_AUTOMACAO,
  ROTULO_DO_LIMITE_MENSAL,
  TEXTO_DA_PAUSA_POR_CREDITOS,
  TEXTO_DA_RODADA_PULADA,
  TEXTO_DO_ERRO_DA_AUTOMACAO,
  TEXTO_DO_SEM_CREDITOS,
  TITULO_DA_PAUSA_POR_CREDITOS,
  TITULO_DA_RODADA_PULADA,
  codigoDoErroDaAutomacao,
  codigoDoErroDoLimite,
  estimativaLocal,
  sinalComRodadaPulada,
  tetoMensalSugerido,
  textoDaEstimativa,
  textoDoErroDoLimite,
  validarLimiteMensal,
  validarLimitePorDia,
} from './preco-por-rodada'
import { contasDaRodada, loteDaRodada } from './plano-do-sinal'
import { ultimaDefinicaoNoBanco } from '@/test/ultima-definicao-no-banco'

// A conta da Demonstração é a do servidor (`public.quote_signal_schedule`). Estes testes leem a migration e o pgTAP: os mesmos
// números e a mesma fórmula, para a tela nunca prometer uma conta que o banco não faz.

const RAIZ = path.resolve(import.meta.dirname, '../../..')
// A fórmula do preço e as recusas do limite por dia vivem em 20261119; os limites (pausa, aviso de repetição, margem do Teto)
// foram redefinidos depois: lê-se a ÚLTIMA definição de `private.signal_price_limit`.
const MIGRATION = readFileSync(path.join(RAIZ, 'supabase/migrations/20261119120000_preco_por_rodada_e_limites.sql'), 'utf8')
const LIMITES_NO_BANCO = ultimaDefinicaoNoBanco('private.signal_price_limit')
const PGTAP = readFileSync(path.join(RAIZ, 'supabase/tests/preco_por_rodada_e_limites.sql'), 'utf8')
const PGTAP_DOS_AJUSTES = readFileSync(path.join(RAIZ, 'supabase/tests/ajustes_das_decisoes_do_agente_de_sinal.sql'), 'utf8')

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
    expect(LIMITES_NO_BANCO).toContain(`when 'pause_after_skips' then ${LIMITES_DO_PRECO.rodadasPuladasParaPausar} `)
    expect(LIMITES_NO_BANCO).toContain(`when 'repeat_warning_above' then ${LIMITES_DO_PRECO.rodadasPorDiaParaOAviso} `)
    expect(LIMITES_NO_BANCO).toContain(`when 'monthly_cap_margin_percent' then ${LIMITES_DO_PRECO.margemDoTetoMensalEmPercentual} `)
  })

  it('a estimativa conta o lote: 60 Contas, lote 25, 2 créditos por Conta, 2 horários em dias úteis', () => {
    const porRodada = contasDaRodada(60, { maxEmpresasPorRodada: 25 }) * 2
    const e = estimativaLocal({ porRodada, agenda: DOIS_HORARIOS_UTEIS, saldo: 1000 })
    // O mesmo exemplo que o pgTAP confere no banco (`quote_signal_schedule`): 50 por rodada, 100 por dia, 2.167 por mês.
    expect(e).toMatchObject({ porRodada: 50, rodadasPorSemana: 10, porDia: 100, porMesAprox: 2167, limiteSugeridoPorDia: 100 })
    expect(PGTAP_DOS_AJUSTES).toContain("'50|10|100|2167|100'")
  })

  it('o lote é o do Plano, ou 25 sem Plano, dentro da faixa de 1 a 100', () => {
    expect(loteDaRodada({ maxEmpresasPorRodada: 30 })).toBe(30)
    expect(loteDaRodada(undefined)).toBe(25)
    expect(loteDaRodada({ maxEmpresasPorRodada: 0 })).toBe(1)
    expect(loteDaRodada({ maxEmpresasPorRodada: 500 })).toBe(100)
    expect(contasDaRodada(10, { maxEmpresasPorRodada: 25 })).toBe(10)
    expect(contasDaRodada(60, undefined)).toBe(25)
  })

  it('o Teto mensal sugerido é o custo do mês mais 20%, para cima: ceil(2.167 × 1,2) = 2.601', () => {
    expect(tetoMensalSugerido(2167)).toBe(2601)
    expect(tetoMensalSugerido(1084)).toBe(1301)
    // Limitado aos créditos da faixa, e nunca menos de 1.
    expect(tetoMensalSugerido(8667, 4500)).toBe(4500)
    expect(tetoMensalSugerido(0)).toBe(1)
    expect(PGTAP_DOS_AJUSTES).toContain('2601')
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
    expect(TITULO_DA_RODADA_PULADA).toBe('Rodada pulada por falta de créditos')
    expect(TEXTO_DA_RODADA_PULADA).toBe(
      'A última rodada foi pulada porque os créditos acabaram. Depois de 3 rodadas puladas seguidas, o Sinal pausa.',
    )
    expect(AVISO_DE_REPETICAO).toBe('Rodar várias vezes por dia costuma repetir resultados.')
    expect(PEDIDO_DE_AUTOMACAO).toBe('Peça ao responsável pelo plano para liberar a automação.')
  })

  it('nenhuma frase fala em dólar, em valor de Teto, em fornecedor ou em actor', () => {
    const frases = [
      TEXTO_DO_SEM_CREDITOS, TITULO_DA_PAUSA_POR_CREDITOS, TEXTO_DA_PAUSA_POR_CREDITOS, AVISO_DE_REPETICAO, PEDIDO_DE_AUTOMACAO,
      AUTOMACAO_NAO_LIBERADA, TITULO_DA_RODADA_PULADA, TEXTO_DA_RODADA_PULADA, ROTULO_DO_LIMITE_MENSAL, AJUDA_DO_LIMITE_MENSAL,
      BOTAO_LIBERAR_E_ATIVAR, ...Object.values(TEXTO_DO_ERRO_DA_AUTOMACAO),
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

describe('o aviso da 1ª Rodada pulada', () => {
  it('vale para o Sinal ativo com ao menos uma Rodada pulada', () => {
    expect(sinalComRodadaPulada({ estado: 'ativo', rodadasPuladas: 1 })).toBe(true)
    expect(sinalComRodadaPulada({ estado: 'ativo', rodadasPuladas: 2 })).toBe(true)
    expect(sinalComRodadaPulada({ estado: 'ativo', rodadasPuladas: 0 })).toBe(false)
    expect(sinalComRodadaPulada({ estado: 'ativo' })).toBe(false)
    // O pausado já tem o aviso da pausa.
    expect(sinalComRodadaPulada({ estado: 'pausado', rodadasPuladas: 3 })).toBe(false)
  })

  it('o aviso do banco (workspace_notices) usa o mesmo texto e o mesmo kind', () => {
    const finish = ultimaDefinicaoNoBanco('public.finish_signal_monitor_run')
    expect(finish).toContain("'sinal_rodada_pulada'")
    expect(finish).toContain('A última rodada foi pulada porque os créditos acabaram. Depois de ')
  })
})

describe('liberar a automação ao ativar', () => {
  it('o limite mensal é um inteiro de 1 em diante; a faixa quem confere é o servidor', () => {
    expect(validarLimiteMensal('2601')).toBeNull()
    expect(validarLimiteMensal(' 1 ')).toBeNull()
    expect(validarLimiteMensal('0')).toBe('limite_invalido')
    expect(validarLimiteMensal('')).toBe('limite_invalido')
    expect(validarLimiteMensal('-5')).toBe('limite_invalido')
    expect(validarLimiteMensal('12,5')).toBe('limite_invalido')
    expect(validarLimiteMensal('muito')).toBe('limite_invalido')
  })

  it('cada recusa do servidor tem a sua frase e existe na função do banco', () => {
    const enable = ultimaDefinicaoNoBanco('public.enable_signal_automation')
    for (const codigo of CODIGOS_DE_ERRO_DA_AUTOMACAO) {
      expect(enable).toContain(`signal automation invalid: ${codigo}`)
      expect(new ErroDaAutomacao(codigo).message).toBe(TEXTO_DO_ERRO_DA_AUTOMACAO[codigo])
    }
    expect(codigoDoErroDaAutomacao('signal automation invalid: acima_da_faixa')).toBe('acima_da_faixa')
    expect(codigoDoErroDaAutomacao('outra coisa')).toBeNull()
  })

  it('o rótulo e o botão são os pedidos, sem a palavra Teto', () => {
    expect(ROTULO_DO_LIMITE_MENSAL).toBe('Limite mensal da automação (créditos)')
    expect(BOTAO_LIBERAR_E_ATIVAR).toBe('Liberar e ativar')
  })
})
