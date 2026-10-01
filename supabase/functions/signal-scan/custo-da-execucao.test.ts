import { assertEquals } from 'jsr:@std/assert@1'
import { clienteDoApify, custoDaExecucaoLida } from './apify.ts'

// Na execução real de 30/09/2026, o custo de um actor que cobra por evento veio 0: o `usageTotalUsd` é só o uso da
// plataforma, e a cobrança do actor está nos eventos (`chargedEventCounts` × preço em `pricingInfo`).

const porEvento = (eventos: Record<string, unknown>) => ({
  pricingModel: 'PAY_PER_EVENT',
  pricingPerEvent: { actorChargeEvents: eventos },
})

Deno.test('custo por evento: soma os eventos cobrados ao uso da plataforma, com o preço da faixa Free quando é por faixa', () => {
  const execucao = {
    usageTotalUsd: 0,
    chargedEventCounts: { 'actor-start': 1, 'short-profile': 3 },
    pricingInfo: porEvento({
      'actor-start': { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.02 }, GOLD: { tieredEventPriceUsd: 0.015 } } },
      'short-profile': { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.003 } } },
    }),
  }
  assertEquals(custoDaExecucaoLida(execucao), 0.029)
})

Deno.test('custo por evento com preço fixo e o uso da plataforma', () => {
  assertEquals(custoDaExecucaoLida({
    usageTotalUsd: 0.001,
    chargedEventCounts: { 'apify-default-dataset-item': 50, 'apify-actor-start': 1 },
    pricingInfo: porEvento({
      'apify-default-dataset-item': { eventPriceUsd: 0.002 },
      'apify-actor-start': { eventPriceUsd: 0.00005 },
    }),
  }), 0.10105)
})

Deno.test('sem eventos vale o uso da plataforma; evento sem preço conhecido deixa o custo em branco', () => {
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0.03 }), 0.03)
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0.03, chargedEventCounts: {} }), 0.03)
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 'x' }), null)
  assertEquals(custoDaExecucaoLida({ chargedEventCounts: { novo: 2 }, pricingInfo: porEvento({}) }), null)
  assertEquals(custoDaExecucaoLida(null), null)
})

Deno.test('cobra por evento e não mostra nenhum evento: o custo fica em branco, não 0', () => {
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0, pricingInfo: porEvento({ profile: { eventPriceUsd: 0.004 } }) }), null)
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0, chargedEventCounts: {}, pricingInfo: porEvento({}) }), null)
})

// Na execução real de 01/10/2026, já com os eventos somados, o custo seguiu 0, lido logo depois de a execução terminar
// (o motivo ainda não foi confirmado). O cliente lê de novo uma vez (quando pedido) e manda o resumo para o log.

const PRECOS = porEvento({ profile: { eventPriceUsd: 0.004 } })

function clienteQueLeOCusto(leituras: Record<string, unknown>[], esperaDoCustoMs: number) {
  const linhas: Record<string, unknown>[] = []
  let lidas = 0
  const fetchFn = ((url: string) => {
    if (url.includes('/actor-runs/')) return Promise.resolve(Response.json({ data: leituras[Math.min(lidas++, leituras.length - 1)] }))
    return Promise.resolve(new Response('x', { status: 500 }))
  }) as unknown as typeof fetch
  const apify = clienteDoApify({ tokens: ['conta-a'], fetchFn, esperaDoCustoMs, log: (l) => linhas.push(l) })
  return { apify, linhas, lidas: () => lidas }
}

Deno.test('sem os eventos na primeira leitura, lê de novo e usa a segunda; o log guarda só nomes de campo e números', async () => {
  const privado = { input: { queries: ['https://www.linkedin.com/in/pessoa-ficticia'] }, meta: { clientIp: '10.0.0.1' } }
  const { apify, linhas, lidas } = clienteQueLeOCusto([
    { status: 'SUCCEEDED', usageTotalUsd: 0, pricingInfo: PRECOS, ...privado },
    { status: 'SUCCEEDED', usageTotalUsd: 0, chargedEventCounts: { profile: 3 }, pricingInfo: PRECOS, ...privado },
  ], 1)
  assertEquals(await apify.custoDaExecucao!('run-1'), 0.012)
  assertEquals(lidas(), 2)
  assertEquals(linhas.map((l) => [l.tentativa, l.chargedEventCounts, l.costUsd]), [[1, {}, undefined], [2, { profile: 3 }, 0.012]])
  assertEquals(linhas[1], {
    type: 'apify_cost',
    runId: 'run-1',
    tentativa: 2,
    status: 'SUCCEEDED',
    pricingModel: 'PAY_PER_EVENT',
    usageTotalUsd: 0,
    chargedEventCounts: { profile: 3 },
    campos: ['chargedEventCounts', 'input', 'meta', 'pricingInfo', 'status', 'usageTotalUsd'],
    costUsd: 0.012,
  })
  const texto = JSON.stringify(linhas)
  assertEquals(texto.includes('pessoa-ficticia') || texto.includes('10.0.0.1'), false)
})

Deno.test('sem espera pedida (o signal-runner), lê uma vez só; e com os eventos já na primeira leitura, não lê de novo', async () => {
  const semEventos = { status: 'SUCCEEDED', usageTotalUsd: 0, pricingInfo: PRECOS }
  const runner = clienteQueLeOCusto([semEventos], 0)
  assertEquals(await runner.apify.custoDaExecucao!('run-2'), null)
  assertEquals(runner.lidas(), 1)
  assertEquals(runner.linhas.length, 1)
  const comEventos = clienteQueLeOCusto([{ ...semEventos, chargedEventCounts: { profile: 1 } }], 1)
  assertEquals(await comEventos.apify.custoDaExecucao!('run-3'), 0.004)
  assertEquals(comEventos.lidas(), 1)
})
