import { assertEquals } from 'jsr:@std/assert@1'
import { clienteDoApify, custoDaExecucaoLida } from './apify.ts'

// O custo de um actor que cobra por evento: o `usageTotalUsd` é o total e já inclui os eventos (execução real de
// 01/10/2026); enquanto o Apify não fecha a conta, vale a soma dos eventos cobrados (`chargedEventCounts` × preço em
// `pricingInfo`).

const porEvento = (eventos: Record<string, unknown>) => ({
  pricingModel: 'PAY_PER_EVENT',
  pricingPerEvent: { actorChargeEvents: eventos },
})

Deno.test('custo por evento antes de o Apify fechar a conta: a soma dos eventos, com o preço da faixa Free quando é por faixa', () => {
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

Deno.test('custo por evento com preço fixo: o total do Apify ainda menor que os eventos não derruba o custo', () => {
  assertEquals(custoDaExecucaoLida({
    usageTotalUsd: 0.001,
    chargedEventCounts: { 'apify-default-dataset-item': 50, 'apify-actor-start': 1 },
    pricingInfo: porEvento({
      'apify-default-dataset-item': { eventPriceUsd: 0.002 },
      'apify-actor-start': { eventPriceUsd: 0.00005 },
    }),
  }), 0.10005)
})

Deno.test('o usageTotalUsd já inclui os eventos: não conta duas vezes (execução real de 01/10/2026)', () => {
  // 1 perfil a US$ 0,004: o Apify fechou a conta em 0,004, e a soma antiga gravou 0,008.
  const fechada = { usageTotalUsd: 0.004, chargedEventCounts: { profile: 1 }, pricingInfo: porEvento({ profile: { eventPriceUsd: 0.004 } }) }
  assertEquals(custoDaExecucaoLida(fechada), 0.004)
  // Com a plataforma cobrada da conta, o total passa da soma dos eventos e vale o total.
  assertEquals(custoDaExecucaoLida({ ...fechada, usageTotalUsd: 0.0052 }), 0.0052)
  // Evento sem preço conhecido: vale o total do Apify, se houver.
  assertEquals(custoDaExecucaoLida({ ...fechada, pricingInfo: porEvento({}) }), 0.004)
  assertEquals(custoDaExecucaoLida({ ...fechada, usageTotalUsd: 0, pricingInfo: porEvento({}) }), null)
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

function clienteQueLeOCusto(leituras: Record<string, unknown>[], esperaDoCustoMs: number, releiturasDoCusto = 1) {
  const linhas: Record<string, unknown>[] = []
  let lidas = 0
  const fetchFn = ((url: string) => {
    if (url.includes('/actor-runs/')) return Promise.resolve(Response.json({ data: leituras[Math.min(lidas++, leituras.length - 1)] }))
    return Promise.resolve(new Response('x', { status: 500 }))
  }) as unknown as typeof fetch
  const apify = clienteDoApify({ tokens: ['conta-a'], fetchFn, esperaDoCustoMs, releiturasDoCusto, log: (l) => linhas.push(l) })
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

Deno.test('sem espera pedida, lê uma vez só; com espera, o actor que cobra por evento é lido de novo mesmo com eventos', async () => {
  const semEventos = { status: 'SUCCEEDED', usageTotalUsd: 0, pricingInfo: PRECOS }
  const semEspera = clienteQueLeOCusto([semEventos], 0)
  assertEquals(await semEspera.apify.custoDaExecucao!('run-2'), null)
  assertEquals(semEspera.lidas(), 1)
  assertEquals(semEspera.linhas.length, 1)
  const comEventos = clienteQueLeOCusto([{ ...semEventos, chargedEventCounts: { profile: 1 } }], 1)
  assertEquals(await comEventos.apify.custoDaExecucao!('run-3'), 0.004)
  assertEquals(comEventos.lidas(), 2)
})

// Execução real de 01/10/2026 na Meta: 30 anúncios, e a primeira leitura trouxe só o evento de início.
const DOS_ANUNCIOS = porEvento({ 'apify-actor-start': { eventPriceUsd: 0.00005 }, 'apify-default-dataset-item': { eventPriceUsd: 0.00075 } })
const SO_O_INICIO = { status: 'SUCCEEDED', usageTotalUsd: 0.00005, chargedEventCounts: { 'apify-actor-start': 1 }, pricingInfo: DOS_ANUNCIOS }
const COM_OS_ANUNCIOS = { ...SO_O_INICIO, usageTotalUsd: 0.02255, chargedEventCounts: { 'apify-actor-start': 1, 'apify-default-dataset-item': 30 } }

Deno.test('só o evento de início na primeira leitura: relê até a cobrança parar de mudar', async () => {
  const c = clienteQueLeOCusto([SO_O_INICIO, COM_OS_ANUNCIOS, COM_OS_ANUNCIOS], 1, 2)
  assertEquals(await c.apify.custoDaExecucao!('run-4'), 0.02255)
  assertEquals(c.lidas(), 3)
  assertEquals(c.linhas.map((l) => l.tentativa), [1, 2, 3])
})

Deno.test('o número de releituras tem teto, e uma releitura que falha não perde a primeira leitura', async () => {
  const limitada = clienteQueLeOCusto([SO_O_INICIO, COM_OS_ANUNCIOS, COM_OS_ANUNCIOS], 1, 1)
  assertEquals(await limitada.apify.custoDaExecucao!('run-5'), 0.02255)
  assertEquals(limitada.lidas(), 2)
  const fetchFn = ((url: string) => {
    if (url.includes('/actor-runs/') && !(fetchFn as unknown as { primeira?: boolean }).primeira) {
      ;(fetchFn as unknown as { primeira?: boolean }).primeira = true
      return Promise.resolve(Response.json({ data: SO_O_INICIO }))
    }
    return Promise.resolve(new Response('x', { status: 500 }))
  }) as unknown as typeof fetch
  const apify = clienteDoApify({ tokens: ['conta-a'], fetchFn, esperaDoCustoMs: 1, releiturasDoCusto: 2, log: () => {} })
  assertEquals(await apify.custoDaExecucao!('run-6'), 0.00005)
})
