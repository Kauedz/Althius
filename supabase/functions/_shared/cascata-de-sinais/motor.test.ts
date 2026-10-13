// O motor da cascata: reserva, passos em ordem (a saída de um é a entrada do próximo), teto rígido, alternativas,
// liquidação do custo real e o Sinal gravado no fim. O banco e a fonte são falsos; a cascata é sintética de 4 passos
// (actor, regra, actor, regra). Os preços em créditos são do banco e têm o pgTAP próprio.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { cascataDeTeste, dbFalso } from './db-falso.ts'
import { rodarCascata } from './motor.ts'
import { MARCA_INTERNA } from '../marca.ts'
import {
  type ClienteDaFonte,
  type ContaDoWorkspace,
  ErroDaFonte,
  type ExecucaoDaFonte,
  type Item,
  type PedidoDeCascata,
  type RegistroDePassos,
  type SinalConfirmado,
} from './tipos.ts'

const WS = 'ws-1'
const CONTA: ContaDoWorkspace = { id: 'conta-1', name: 'Alfa Importadora', domain: 'alfa.test', linkedinUrl: null }
const AGORA = Date.parse('2026-10-13T12:00:00Z')

const sinalDe = (conta: ContaDoWorkspace, n: unknown): SinalConfirmado => ({
  contaId: conta.id,
  contaNome: conta.name,
  eventKey: `teste|${conta.id}|${String(n)}`,
  phrase: `Evento ${String(n)}`,
  firedAt: '2026-10-12T10:00:00Z',
  source: 'Fonte de teste',
  evidence: `Evidência ${String(n)}`,
})

/** Os passos sintéticos: gerar (actor) → dedupe (regra) → enriquecer (actor) → sinalizar (regra). */
function registro(extra: { gerar?: Partial<RegistroDePassos['passos']['gerar']>; fontes?: RegistroDePassos['fontes'] } = {}): RegistroDePassos {
  return {
    passos: {
      gerar: {
        montarEntrada: () => ({ input: { q: 'x' }, maxItems: 10 }),
        normalizar: (brutos, _e, _c, actorId) =>
          brutos.filter((b): b is Item => !!b && typeof b === 'object').map((b) => ({ n: (b as Item).n, por: actorId })),
        ...extra.gerar,
      },
      dedupe: {
        executar: (entrada) => [...new Map(entrada.map((i) => [i.n, i])).values()],
      },
      enriquecer: {
        montarEntrada: (entrada) => ({ input: { ns: entrada.map((i) => i.n) }, maxItems: 10 }),
        normalizar: (brutos, entrada) =>
          entrada.map((i) => ({ ...i, nome: (brutos as Item[]).find((b) => b.n === i.n)?.nome ?? null })),
      },
      sinalizar: {
        executar: (entrada, ctx) => entrada.map((i) => ({ ...sinalDe(ctx.contas[0], i.n) })),
      },
    },
    fontes: extra.fontes ?? {},
  }
}

type Resposta = ExecucaoDaFonte | ErroDaFonte
function fonteFalsa(porActor: Record<string, Resposta | ((n: number) => Resposta)>) {
  const chamadas: { actorId: string; input: unknown; maxItems: number; maxTotalChargeUsd: number; timeoutSegundos: number }[] = []
  const contagem = new Map<string, number>()
  const fonte: ClienteDaFonte = {
    rodar: (args) => {
      chamadas.push(args)
      const n = (contagem.get(args.actorId) ?? 0) + 1
      contagem.set(args.actorId, n)
      const r = porActor[args.actorId]
      const resposta = typeof r === 'function' ? r(n) : r
      if (!resposta) return Promise.reject(new Error(`actor sem resposta no teste: ${args.actorId}`))
      return resposta instanceof ErroDaFonte ? Promise.reject(resposta) : Promise.resolve(resposta)
    },
  }
  return { fonte, chamadas }
}

const exec = (itens: unknown[], custoUsd: number | null, runId = 'apify-run-1', tokenIndex = 0): ExecucaoDaFonte => ({
  apifyRunId: runId,
  build: '1.0.0',
  tokenIndex,
  items: itens,
  custoUsd,
})

const pedido = (extra: Partial<PedidoDeCascata> = {}): PedidoDeCascata => ({
  workspaceId: WS,
  userId: 'user-1',
  signalType: 'teste_em_cascata',
  origem: 'conversa',
  chave: 'chave-1',
  contas: [CONTA],
  ...extra,
})

const GERADOS = [{ n: 1 }, { n: 2 }, { n: 2 }]
const ENRIQUECIDOS = [{ n: 1, nome: 'um' }, { n: 2, nome: 'dois' }]

Deno.test('cascata de 4 passos: a saída de um vira a entrada do próximo e o Sinal é gravado no fim', async () => {
  const { db, passos, sinais, aberturas, fechamentos } = dbFalso(cascataDeTeste())
  const { fonte, chamadas } = fonteFalsa({
    'time~um': exec(GERADOS, 0.02, 'apify-1'),
    'time~dois': exec(ENRIQUECIDOS, 0.01, 'apify-2', 1),
  })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 2)
  assertEquals(r.mensagem, '2 Sinais novos gravados.')
  assertEquals(sinais.map((s) => s.sinal.eventKey), ['teste|conta-1|1', 'teste|conta-1|2'])
  // O passo 1 gerou 3 itens; o passo 2 tirou o repetido; o passo 3 recebeu só 1 e 2.
  assertEquals(chamadas[1].input, { ns: [1, 2] })
  assertEquals(passos.map((p) => [p.ordem, p.handler, p.itensEntrada]), [[1, 'gerar', 0], [2, 'dedupe', 3], [3, 'enriquecer', 2], [4, 'sinalizar', 2]])
  // Cada passo guarda run id, conta usada (índice), custo e itens.
  const p1 = passos[0].fim!
  assertEquals([p1.estado, p1.apifyRunId, p1.tokenIndex, p1.custoUsd, p1.itensSaida], ['succeeded', 'apify-1', 0, 0.02, 3])
  assertEquals(passos[2].fim!.tokenIndex, 1)
  // A estimativa vai ao banco antes de rodar: 0,001+0,002×10 + 0,001+0,004×5 = 0,042.
  assertEquals(aberturas[0].estimativaUsd, 0.042)
  assertEquals(aberturas[0].origem, 'conversa')
  // O custo real fecha a conta: 0,02 + 0,01.
  assertEquals(fechamentos.length, 1)
  assertEquals([fechamentos[0].estado, fechamentos[0].custoUsd, fechamentos[0].novos], ['succeeded', 0.03, 2])
  assertEquals(r.custoUsd, 0.03)
  assert(!MARCA_INTERNA.test(r.mensagem))
})

Deno.test('o maxTotalChargeUsd de cada run cabe no que resta do teto', async () => {
  const { db } = dbFalso(cascataDeTeste({ capUsd: 0.5 }))
  const { fonte, chamadas } = fonteFalsa({ 'time~um': exec(GERADOS, 0.3), 'time~dois': exec(ENRIQUECIDOS, 0.05) })
  await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(chamadas.map((c) => c.maxTotalChargeUsd), [0.5, 0.2])
})

Deno.test('passo sem itens encerra a cascata sem rodar nem cobrar o resto', async () => {
  const { db, passos, sinais, fechamentos } = dbFalso(cascataDeTeste())
  const { fonte, chamadas } = fonteFalsa({ 'time~um': exec([], 0.001), 'time~dois': exec(ENRIQUECIDOS, 0.01) })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 0)
  assertEquals(chamadas.map((c) => c.actorId), ['time~um'])
  assertEquals(passos.map((p) => [p.ordem, p.fim?.estado]), [[1, 'empty']])
  assertEquals(sinais.length, 0)
  assertEquals([fechamentos[0].estado, fechamentos[0].custoUsd, fechamentos[0].casados], ['succeeded', 0.001, 0])
  assert(r.mensagem.length > 0 && !MARCA_INTERNA.test(r.mensagem))
})

Deno.test('todas as contas sem crédito: falha amigável, nada gravado e o erro real no passo', async () => {
  const { db, passos, sinais, fechamentos } = dbFalso(cascataDeTeste())
  const { fonte } = fonteFalsa({
    'time~um': new ErroDaFonte('sem_credito_em_todas', 'Sem saldo na fonte de dados; avisamos a equipe.', {
      statusHttp: 402,
      tokenIndex: 1,
      erroReal: 'Insufficient credit',
    }),
  })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'falhou')
  assertEquals(r.mensagem, 'Sem saldo na fonte de dados; avisamos a equipe.')
  assertEquals(sinais.length, 0)
  assertEquals([fechamentos[0].estado, fechamentos[0].custoUsd], ['failed', 0])
  assertEquals(fechamentos[0].erroAmigavel, 'Sem saldo na fonte de dados; avisamos a equipe.')
  const f = passos[0].fim!
  assertEquals([f.estado, f.statusHttp, f.erroReal, f.tokenIndex], ['failed', 402, 'Insufficient credit', 1])
})

Deno.test('timeout num passo do meio: falha, cobra só o consumido e nada vira Sinal', async () => {
  const { db, passos, fechamentos } = dbFalso(cascataDeTeste())
  const { fonte } = fonteFalsa({
    'time~um': exec(GERADOS, 0.01),
    'time~dois': new ErroDaFonte('timeout', 'Nossa busca não respondeu a tempo.', { apifyRunId: 'apify-t', custoUsd: 0.004, erroReal: 'abortado' }),
  })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'falhou')
  assertEquals(r.mensagem, 'Nossa busca não respondeu a tempo.')
  assertEquals([fechamentos[0].estado, fechamentos[0].custoUsd], ['failed', 0.014])
  const f = passos.find((p) => p.ordem === 3)!.fim!
  assertEquals([f.estado, f.apifyRunId, f.custoUsd], ['failed', 'apify-t', 0.004])
})

Deno.test('o teto rígido aborta no meio: o passo seguinte não roda e só o consumido é liquidado', async () => {
  // Teto de US$ 0,05: o passo 1 gasta 0,04; o passo 3 estima 0,001+0,004×2 = 0,009, que passaria do teto.
  const { db, passos, sinais, fechamentos } = dbFalso(cascataDeTeste({ capUsd: 0.045 }))
  const { fonte, chamadas } = fonteFalsa({ 'time~um': exec(GERADOS, 0.04), 'time~dois': exec(ENRIQUECIDOS, 0.01) })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'abortada')
  assertEquals(chamadas.map((c) => c.actorId), ['time~um'], 'o passo 3 não começou')
  assertEquals(sinais.length, 0)
  assertEquals([fechamentos[0].estado, fechamentos[0].custoUsd], ['aborted', 0.04])
  assertEquals(passos.find((p) => p.ordem === 3)?.fim?.estado, 'aborted_cap')
  assert(r.mensagem.includes('teto'), r.mensagem)
  assert(!MARCA_INTERNA.test(r.mensagem))
})

Deno.test('item malformado do actor é ignorado; o Sinal sem os campos não é gravado e nada quebra', async () => {
  const reg = registro()
  reg.passos.sinalizar = {
    executar: (entrada, ctx) => [
      ...entrada.map((i) => sinalDe(ctx.contas[0], i.n)),
      { contaId: 'conta-1', phrase: 'sem chave' },
      null as unknown as Item,
    ],
  }
  const { db, sinais } = dbFalso(cascataDeTeste())
  const { fonte } = fonteFalsa({ 'time~um': exec([null, 7, 'x', { n: 1 }], 0.01), 'time~dois': exec([{ n: 1, nome: 'um' }], 0.01) })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(sinais.map((s) => s.sinal.eventKey), ['teste|conta-1|1'])
})

Deno.test('resultado que não confere com a consulta dispara a alternativa, mesmo sem erro da fonte', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'time~reserva', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0, estPerItemUsd: 0.001 }]
  const reg = registro({
    gerar: { confereConsulta: (brutos) => brutos.some((b) => !!b && typeof b === 'object' && (b as Item).confere === true) },
  })
  const { db, passos } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': exec([{ n: 1, confere: false }], 0.01),
    'time~reserva': exec([{ n: 2, confere: true }], 0.002, 'apify-r'),
    'time~dois': exec([{ n: 2, nome: 'dois' }], 0.01),
  })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(chamadas.map((c) => c.actorId), ['time~um', 'time~reserva', 'time~dois'])
  assertEquals(passos.filter((p) => p.ordem === 1).map((p) => [p.tentativa, p.fim?.estado]), [[1, 'empty'], [2, 'succeeded']])
  assertEquals(r.sinais.map((s) => s.eventKey), ['teste|conta-1|2'])
  assert(!MARCA_INTERNA.test(r.mensagem))
})

Deno.test('lista vazia de verdade não dispara a alternativa', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'time~reserva', priceModel: 'FREE', estPerItemUsd: 0 }]
  const reg = registro({
    gerar: { confereConsulta: () => false },
  })
  const { db } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': exec([], 0.01),
    'time~reserva': exec([{ n: 1, confere: true }], 0),
    'time~dois': exec([{ n: 1, nome: 'um' }], 0.01),
  })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(chamadas.map((c) => c.actorId), ['time~um'])
  assertEquals(r.sinais.length, 0)
})

Deno.test('a busca longa do Diário Oficial não roda como reserva, mesmo quando o principal falha', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'jenko_systems~diario-oficial-uniao-dou', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.2, estPerItemUsd: 0.0001 }]
  const { db } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': new ErroDaFonte('http', 'A fonte pública está indisponível agora.', { statusHttp: 500, erroReal: 'boom' }),
    'jenko_systems~diario-oficial-uniao-dou': exec([{ n: 1 }], 0.2),
    'time~dois': exec([{ n: 1, nome: 'um' }], 0.01),
  })
  await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(chamadas.map((c) => c.actorId).includes('jenko_systems~diario-oficial-uniao-dou'), false)
})

Deno.test('se nenhuma tentativa confere com a consulta, o resultado fora da janela não vira Sinal', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'time~reserva', priceModel: 'PAY_PER_EVENT', estPerItemUsd: 0.001 }]
  const reg = registro({ gerar: { confereConsulta: () => false } })
  const { db, sinais } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': exec([{ n: 1, confere: false }], 0.01),
    'time~reserva': exec([{ n: 9, confere: false }], 0.002),
  })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(chamadas.map((c) => c.actorId), ['time~um', 'time~reserva'])
  assertEquals([r.desfecho, r.sinais.length, sinais.length], ['concluida', 0, 0])
})

Deno.test('o actor principal falha e o alternativo assume; os dois ficam no rastro', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'time~reserva', priceModel: 'PAY_PER_EVENT', estPerItemUsd: 0.001 }]
  const { db, passos } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': new ErroDaFonte('http', 'A fonte pública está indisponível agora.', { statusHttp: 500, erroReal: 'boom' }),
    'time~reserva': exec([{ n: 1 }], 0.002, 'apify-r'),
    'time~dois': exec([{ n: 1, nome: 'um' }], 0.01),
  })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(chamadas.map((c) => c.actorId), ['time~um', 'time~reserva', 'time~dois'])
  const tentativas = passos.filter((p) => p.ordem === 1).map((p) => [p.tentativa, p.actorId, p.fim?.estado])
  assertEquals(tentativas, [[1, 'time~um', 'failed'], [2, 'time~reserva', 'succeeded']])
  // O normalizador recebeu o actor que de fato respondeu.
  assertEquals(passos.find((p) => p.ordem === 2)?.itensEntrada, 1)
})

Deno.test('a alternativa pode ser uma fonte pública aberta', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'fonte_publica', source: 'dados_abertos' }]
  const { db } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': new ErroDaFonte('run_falhou', 'A fonte pública está indisponível agora.', { erroReal: 'FAILED' }),
    'time~dois': exec([{ n: 5, nome: 'cinco' }], 0.01),
  })
  const reg = registro({ fontes: { dados_abertos: { buscar: () => Promise.resolve([{ n: 5 }]) } } })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(chamadas.map((c) => c.actorId), ['time~um', 'time~dois'])
  assertEquals(r.sinais.map((s) => s.eventKey), ['teste|conta-1|5'])
})

Deno.test('todas as alternativas falham: a cascata falha com a mensagem amigável e sem Sinal', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'time~reserva', priceModel: 'FREE' }]
  const { db, sinais } = dbFalso(def)
  const { fonte } = fonteFalsa({
    'time~um': new ErroDaFonte('http', 'x', { statusHttp: 500, erroReal: 'a' }),
    'time~reserva': new ErroDaFonte('rede', 'x', { erroReal: 'b' }),
  })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'falhou')
  assertEquals(r.mensagem, 'A fonte pública está indisponível agora.')
  assertEquals(sinais.length, 0)
})

Deno.test('sem crédito em todas as contas não tenta o actor alternativo (é a mesma conta)', async () => {
  const def = cascataDeTeste()
  def.steps[0].fallbacks = [{ kind: 'actor', actorId: 'time~reserva', priceModel: 'FREE' }]
  const { db } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({
    'time~um': new ErroDaFonte('sem_credito_em_todas', 'Sem saldo na fonte de dados; avisamos a equipe.', { statusHttp: 402, erroReal: 'x' }),
    'time~reserva': exec([{ n: 1 }], 0),
  })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'falhou')
  assertEquals(chamadas.map((c) => c.actorId), ['time~um'])
})

Deno.test('o enriquecimento do fim falha: os Sinais já confirmados são gravados e a execução é parcial', async () => {
  const def = cascataDeTeste()
  // Passos: gerar → sinalizar (regra) → enriquecer (actor que só acrescenta evidência).
  def.steps = [
    def.steps[0],
    { ...def.steps[3], ordem: 2 },
    { ...def.steps[2], ordem: 3, handler: 'enriquecer_sinal' },
  ]
  const reg = registro()
  reg.passos.enriquecer_sinal = {
    montarEntrada: () => ({ input: {}, maxItems: 5 }),
    normalizar: (_b, entrada) => entrada,
  }
  const { db, sinais, fechamentos } = dbFalso(def)
  const { fonte } = fonteFalsa({
    'time~um': exec([{ n: 1 }], 0.02),
    'time~dois': new ErroDaFonte('http', 'x', { statusHttp: 500, erroReal: 'boom' }),
  })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'parcial')
  assertEquals(sinais.map((s) => s.sinal.eventKey), ['teste|conta-1|1'])
  assertEquals([fechamentos[0].estado, fechamentos[0].novos, fechamentos[0].custoUsd], ['partial', 1, 0.02])
})

Deno.test('idempotência: a mesma execução em andamento ou já concluída não roda nem grava de novo', async () => {
  for (const [outcome, desfecho] of [['em_andamento', 'em_andamento'], ['done', 'ja_concluida']] as const) {
    const { db, sinais, passos } = dbFalso(cascataDeTeste(), { abertura: { outcome } })
    const { fonte, chamadas } = fonteFalsa({ 'time~um': exec(GERADOS, 0.02) })
    const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
    assertEquals(r.desfecho, desfecho)
    assertEquals([chamadas.length, sinais.length, passos.length], [0, 0, 0])
    assertEquals(r.creditosCobrados, 0)
  }
})

Deno.test('o mesmo resultado em outra execução não cria o Sinal duas vezes', async () => {
  const { db, sinais } = dbFalso(cascataDeTeste())
  const registroPronto = registro()
  const deps = () => ({ db, fonte: fonteFalsa({ 'time~um': exec([{ n: 1 }], 0.01), 'time~dois': exec([{ n: 1, nome: 'um' }], 0.01) }).fonte, registro: registroPronto, agora: () => AGORA, log: () => {} })
  const a = await rodarCascata(deps(), pedido({ chave: 'a' }))
  const b = await rodarCascata(deps(), pedido({ chave: 'b' }))
  assertEquals([a.novos, a.repetidos], [1, 0])
  assertEquals([b.novos, b.repetidos], [0, 1])
  assertEquals(sinais.filter((s) => s.novo).length, 1)
})

Deno.test('sem fonte não reserva crédito: o motivo volta como resposta válida', async () => {
  const def = cascataDeTeste({ state: 'sem_fonte', semFonteMotivo: 'A consulta é individual e exige verificação humana.', steps: [] })
  const { db, aberturas } = dbFalso(def)
  const { fonte, chamadas } = fonteFalsa({})
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'sem_fonte')
  assertEquals(r.mensagem, 'A consulta é individual e exige verificação humana.')
  assertEquals([aberturas.length, chamadas.length, r.creditosCobrados], [0, 0, 0])
})

Deno.test('cada recusa da abertura vira uma resposta neutra e nada roda', async () => {
  const casos: [string, string][] = [
    ['em_teste', 'em_teste'],
    ['indisponivel', 'indisponivel'],
    ['sem_cascata', 'sem_cascata'],
    ['no_credits', 'sem_creditos'],
    ['limite_diario', 'limite_diario'],
    ['ja_rodou_hoje', 'ja_rodou_hoje'],
    ['confirmar', 'automatico_parado'],
    ['sem_teto', 'automatico_parado'],
    ['teto_atingido', 'automatico_parado'],
  ]
  for (const [outcome, desfecho] of casos) {
    const { db } = dbFalso(cascataDeTeste(), { abertura: { outcome: outcome as 'go' } })
    const { fonte, chamadas } = fonteFalsa({})
    const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
    assertEquals(r.desfecho, desfecho, outcome)
    assertEquals(chamadas.length, 0, outcome)
    assert(r.mensagem.length > 0 && !MARCA_INTERNA.test(r.mensagem), `${outcome}: ${r.mensagem}`)
  }
})

Deno.test('o Workspace sem Contas-alvo não gasta nada numa cascata por Conta', async () => {
  const { db, aberturas } = dbFalso(cascataDeTeste(), { contas: [] })
  const r = await rodarCascata(
    { db, fonte: fonteFalsa({}).fonte, registro: registro(), agora: () => AGORA, log: () => {} },
    pedido({ contas: undefined }),
  )
  assertEquals(r.desfecho, 'sem_contas')
  assertEquals(aberturas.length, 0)
})

Deno.test('sem Contas no pedido, a cascata lê as do Workspace (ou as pedidas)', async () => {
  const outra: ContaDoWorkspace = { id: 'conta-2', name: 'Beta', domain: null, linkedinUrl: null }
  const { db } = dbFalso(cascataDeTeste(), { contas: [CONTA, outra] })
  const { fonte } = fonteFalsa({ 'time~um': exec([{ n: 1 }], 0.01), 'time~dois': exec([{ n: 1, nome: 'um' }], 0.01) })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido({ contas: undefined, idsDeContas: ['conta-2'] }))
  assertEquals(r.sinais.map((s) => s.contaId), ['conta-2'])
})

Deno.test('o teto de créditos pedido e a origem chegam à abertura', async () => {
  const { db, aberturas } = dbFalso(cascataDeTeste())
  const { fonte } = fonteFalsa({ 'time~um': exec([], 0) })
  await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido({ tetoCreditos: 2, origem: 'monitor', monitorId: 'mon-1', chave: 'monitor:mon-1:slot' }))
  assertEquals([aberturas[0].tetoCreditos, aberturas[0].origem, aberturas[0].monitorId, aberturas[0].chave], [2, 'monitor', 'mon-1', 'monitor:mon-1:slot'])
})

Deno.test('o prazo final vencido aborta antes de gastar', async () => {
  const { db, fechamentos } = dbFalso(cascataDeTeste())
  const { fonte, chamadas } = fonteFalsa({ 'time~um': exec(GERADOS, 0.02) })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido({ prazoFinal: AGORA + 1_000 }))
  assertEquals(r.desfecho, 'abortada')
  assertEquals(chamadas.length, 0)
  assertEquals([fechamentos[0].estado, fechamentos[0].custoUsd], ['aborted', 0])
})

Deno.test('um passo sem implementação falha a cascata com mensagem neutra, antes de reservar qualquer crédito', async () => {
  const reg = registro()
  delete reg.passos.dedupe
  const { db, aberturas } = dbFalso(cascataDeTeste())
  const { fonte, chamadas } = fonteFalsa({ 'time~um': exec(GERADOS, 0.02) })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'falhou')
  assert(!MARCA_INTERNA.test(r.mensagem))
  assertEquals([aberturas.length, chamadas.length], [0, 0], 'nada é reservado nem rodado')
})

Deno.test('o passo que pula não custa nada e passa a entrada adiante', async () => {
  const reg = registro()
  reg.passos.enriquecer = { montarEntrada: () => ({ pular: 'nenhuma Conta com CNPJ' }), normalizar: () => [] }
  const { db, passos } = dbFalso(cascataDeTeste())
  const { fonte, chamadas } = fonteFalsa({ 'time~um': exec([{ n: 1 }], 0.01) })
  const r = await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(chamadas.map((c) => c.actorId), ['time~um'])
  assertEquals(passos.find((p) => p.ordem === 3)?.fim?.estado, 'skipped')
  assertEquals(r.sinais.length, 1)
})

Deno.test('um token ou chave no erro real nunca é gravado', async () => {
  const { db, passos } = dbFalso(cascataDeTeste())
  const { fonte } = fonteFalsa({
    'time~um': new ErroDaFonte('http', 'A fonte pública está indisponível agora.', {
      statusHttp: 500,
      erroReal: 'falhou com Bearer apify_api_ABCDEFGHIJKLMNOP1234 e sk-abcdefghij1234',
    }),
  })
  const logs: unknown[] = []
  await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: (c) => logs.push(c) }, pedido())
  const gravado = JSON.stringify([passos[0].fim?.erroReal, logs])
  assert(!gravado.includes('apify_api_ABCDEFGHIJKLMNOP1234') && !gravado.includes('sk-abcdefghij1234'), gravado)
})

Deno.test('o Sinal que o banco recusa não derruba os outros: a execução fica parcial', async () => {
  const { db, sinais } = dbFalso(cascataDeTeste(), { falhaAoGravar: (s) => s.eventKey.endsWith('|1') })
  const { fonte } = fonteFalsa({ 'time~um': exec([{ n: 1 }, { n: 2 }], 0.01), 'time~dois': exec(ENRIQUECIDOS, 0.01) })
  const r = await rodarCascata({ db, fonte, registro: registro(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'parcial')
  assertEquals(sinais.map((s) => s.sinal.eventKey), ['teste|conta-1|2'])
})

Deno.test('um passo que devolve Sinal de uma Conta fora do pedido não o grava (isolamento)', async () => {
  const reg = registro()
  reg.passos.sinalizar = { executar: () => [sinalDe(CONTA, 1), sinalDe({ ...CONTA, id: 'conta-de-outro-workspace' }, 2)] }
  const { db, sinais } = dbFalso(cascataDeTeste())
  const { fonte } = fonteFalsa({ 'time~um': exec([{ n: 1 }], 0.01), 'time~dois': exec([{ n: 1, nome: 'um' }], 0.01) })
  await rodarCascata({ db, fonte, registro: reg, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(sinais.map((s) => s.contaId), ['conta-1'])
})
