import { assertEquals } from 'jsr:@std/assert@1'
import { clienteDoApify } from './apify.ts'
import {
  type Apify,
  ApifyRequestError,
  ApifyTimeoutError,
  createHandler,
  type ActorDoRegistro,
  type Db,
} from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const ACTOR = 'apify~linkedin-posts'

function montar(opcoes: {
  actor?: ActorDoRegistro | null
  run?: Apify['run']
  custo?: number | null
  recordCost?: Db['recordCost']
  registroFalha?: boolean
} = {}) {
  const chamadas: { run: unknown[]; custo: unknown[] } = { run: [], custo: [] }
  const contas: unknown[] = []
  const actor = opcoes.actor === undefined
    ? { actorId: ACTOR, signalType: 'posts', state: 'available' as const, version: 'v1', maxCostUsd: 0.5 }
    : opcoes.actor
  const db: Db = {
    actorForScan: () => opcoes.registroFalha ? Promise.reject(new Error('boom')) : Promise.resolve(actor),
    recordCost: opcoes.recordCost ?? ((args) => {
      contas.push(args)
      return Promise.resolve()
    }),
  }
  const apify: Apify = {
    run: opcoes.run ?? ((args) => {
      chamadas.run.push(args)
      return Promise.resolve({ runId: 'run-1', items: [{ a: 1 }, { a: 2 }] })
    }),
    custoDaExecucao: (id) => {
      chamadas.custo.push(id)
      return Promise.resolve(opcoes.custo === undefined ? 0.12 : opcoes.custo)
    },
  }
  const handler = createHandler({ db, apify, autorizado: (a) => a === 'Bearer chave', log: () => {} })
  return { handler, chamadas, contas }
}

function pedir(corpo: unknown, cabecalhos: Record<string, string> = { Authorization: 'Bearer chave' }, method = 'POST') {
  return new Request('http://x/signal-scan', {
    method,
    headers: cabecalhos,
    body: method === 'POST' ? (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) : undefined,
  })
}

const valido = { workspaceId: WS, actorId: ACTOR, input: { q: 'x' } }

Deno.test('só POST, e só com a chave de serviço', async () => {
  const { handler, chamadas } = montar()
  assertEquals((await handler(pedir(null, {}, 'GET'))).status, 405)
  assertEquals((await handler(pedir(valido, {}))).status, 401)
  assertEquals((await handler(pedir(valido, { Authorization: 'Bearer outra' }))).status, 401)
  assertEquals(chamadas.run.length, 0)
})

Deno.test('entradas inválidas voltam 400 sem rodar nada', async () => {
  const { handler, chamadas } = montar()
  const ruins = [
    'não é json',
    { ...valido, workspaceId: 'x' },
    { ...valido, actorId: 'sem-til' },
    { ...valido, maxItems: 0 },
    { ...valido, maxItems: 5000 },
    { ...valido, maxItems: 1.5 },
    { ...valido, maxTotalChargeUsd: 0 },
    { ...valido, input: null },
    { ...valido, input: [1] },
    { ...valido, input: { q: 'x'.repeat(30_000) } },
  ]
  for (const corpo of ruins) assertEquals((await handler(pedir(corpo))).status, 400, JSON.stringify(corpo).slice(0, 60))
  assertEquals(chamadas.run.length, 0)
})

Deno.test('actor fora do registro nunca roda', async () => {
  const { handler, chamadas } = montar({ actor: null })
  const r = await handler(pedir(valido))
  assertEquals(r.status, 404)
  assertEquals((await r.json()).code, 'actor_not_registered')
  assertEquals(chamadas.run.length, 0)
})

Deno.test('actor marcado fora nunca roda, nem com allowTesting', async () => {
  const { handler, chamadas } = montar({
    actor: { actorId: ACTOR, signalType: 'posts', state: 'out', version: null, maxCostUsd: 0.5 },
  })
  const r = await handler(pedir({ ...valido, allowTesting: true }))
  assertEquals(r.status, 403)
  assertEquals((await r.json()).code, 'actor_out')
  assertEquals(chamadas.run.length, 0)
})

Deno.test('actor em teste só roda com allowTesting', async () => {
  const actor = { actorId: ACTOR, signalType: 'posts', state: 'testing' as const, version: null, maxCostUsd: 0.5 }
  const a = montar({ actor })
  const negado = await a.handler(pedir(valido))
  assertEquals(negado.status, 403)
  assertEquals((await negado.json()).code, 'actor_testing')
  assertEquals(a.chamadas.run.length, 0)
  const b = montar({ actor })
  assertEquals((await b.handler(pedir({ ...valido, allowTesting: true }))).status, 200)
  assertEquals(b.chamadas.run.length, 1)
})

Deno.test('o teto é o menor entre o registro e o pedido', async () => {
  const a = montar()
  await a.handler(pedir({ ...valido, maxTotalChargeUsd: 5 }))
  assertEquals((a.chamadas.run[0] as { maxTotalChargeUsd: number }).maxTotalChargeUsd, 0.5)
  const b = montar()
  await b.handler(pedir({ ...valido, maxTotalChargeUsd: 0.1 }))
  assertEquals((b.chamadas.run[0] as { maxTotalChargeUsd: number }).maxTotalChargeUsd, 0.1)
})

Deno.test('devolve os itens, a versão e grava o custo real', async () => {
  const { handler, contas, chamadas } = montar()
  const r = await handler(pedir(valido))
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { runId: 'run-1', actorVersion: 'v1', items: [{ a: 1 }, { a: 2 }] })
  assertEquals(chamadas.custo, ['run-1'])
  assertEquals(contas, [{ workspaceId: WS, actorId: ACTOR, runId: 'run-1', items: 2, costUsd: 0.12 }])
})

Deno.test('aceita o actor com barra e troca por til', async () => {
  const { handler, chamadas } = montar()
  await handler(pedir({ ...valido, actorId: 'apify/linkedin-posts' }))
  assertEquals((chamadas.run[0] as { actorId: string }).actorId, ACTOR)
})

Deno.test('custo ilegível ou que falha ao gravar não derruba a resposta', async () => {
  const a = montar({ custo: null })
  assertEquals((await a.handler(pedir(valido))).status, 200)
  assertEquals((a.contas[0] as { costUsd: number | null }).costUsd, null)
  const b = montar({ recordCost: () => Promise.reject(new Error('banco fora')) })
  const r = await b.handler(pedir(valido))
  assertEquals(r.status, 200)
  assertEquals((await r.json()).items.length, 2)
})

Deno.test('sem runId do Apify, grava com um id próprio e custo nulo', async () => {
  const { handler, contas, chamadas } = montar({ run: () => Promise.resolve({ runId: null, items: [] }) })
  const r = await handler(pedir(valido))
  assertEquals(r.status, 200)
  assertEquals(chamadas.custo.length, 0)
  const conta = contas[0] as { runId: string; costUsd: number | null }
  assertEquals(conta.runId.startsWith('signal-scan:'), true)
  assertEquals(conta.costUsd, null)
})

Deno.test('erros do Apify: 504 no prazo, 502 nos outros', async () => {
  const t = montar({ run: () => Promise.reject(new ApifyTimeoutError()) })
  const rt = await t.handler(pedir(valido))
  assertEquals(rt.status, 504)
  assertEquals((await rt.json()).code, 'timeout')
  const h = montar({ run: () => Promise.reject(new ApifyRequestError(402)) })
  const rh = await h.handler(pedir(valido))
  assertEquals(rh.status, 502)
  assertEquals((await rh.json()).code, 'apify_http_402')
  const u = montar({ run: () => Promise.reject(new TypeError('rede')) })
  assertEquals((await (await u.handler(pedir(valido))).json()).code, 'apify_unreachable')
})

Deno.test('registro fora do ar: 500 e nada roda', async () => {
  const { handler, chamadas } = montar({ registroFalha: true })
  assertEquals((await handler(pedir(valido))).status, 500)
  assertEquals(chamadas.run.length, 0)
})

Deno.test('cliente do Apify: chamada, cabeçalho, runId e custo', async () => {
  const vistos: { url: string; init?: RequestInit }[] = []
  const fetchFn = ((url: string, init?: RequestInit) => {
    vistos.push({ url, init })
    if (url.includes('actor-runs')) return Promise.resolve(Response.json({ data: { usageTotalUsd: 0.03 } }))
    return Promise.resolve(Response.json([{ x: 1 }], { headers: { 'x-apify-run-id': 'r9' } }))
  }) as unknown as typeof fetch
  const apify = clienteDoApify({ tokens: ['segredo'], fetchFn })
  const exec = await apify.run({ actorId: ACTOR, input: { q: 1 }, maxItems: 10, maxTotalChargeUsd: 0.4 })
  assertEquals(exec, { runId: 'r9', items: [{ x: 1 }] })
  assertEquals(vistos[0].url.includes('segredo'), false)
  assertEquals((vistos[0].init!.headers as Record<string, string>).Authorization, 'Bearer segredo')
  assertEquals(vistos[0].url.includes('maxTotalChargeUsd=0.4'), true)
  assertEquals(await apify.custoDaExecucao!('r9'), 0.03)
})

Deno.test('cliente do Apify: 408, erro HTTP e custo inválido', async () => {
  const com = (r: () => Response) => clienteDoApify({ tokens: ['t'], fetchFn: (() => Promise.resolve(r())) as unknown as typeof fetch })
  let erro: unknown
  try {
    await com(() => new Response(null, { status: 408 })).run({ actorId: ACTOR, input: {}, maxItems: 1, maxTotalChargeUsd: 1 })
  } catch (e) {
    erro = e
  }
  assertEquals(erro instanceof ApifyTimeoutError, true)
  try {
    await com(() => new Response('x', { status: 500 })).run({ actorId: ACTOR, input: {}, maxItems: 1, maxTotalChargeUsd: 1 })
  } catch (e) {
    erro = e
  }
  assertEquals((erro as ApifyRequestError).status, 500)
  assertEquals(await com(() => Response.json({ data: { usageTotalUsd: 'x' } })).custoDaExecucao!('r'), null)
  assertEquals(await com(() => new Response(null, { status: 404 })).custoDaExecucao!('r'), null)
})

Deno.test('cliente do Apify: sem crédito numa conta, a próxima assume e o custo lê na conta que rodou', async () => {
  const usados: string[] = []
  const fetchFn = ((url: string, init?: RequestInit) => {
    const auth = (init!.headers as Record<string, string>).Authorization
    usados.push(`${url.includes('actor-runs') ? 'custo' : 'run'}:${auth}`)
    if (auth === 'Bearer a' && !url.includes('actor-runs')) return Promise.resolve(new Response('x', { status: 402 }))
    if (url.includes('actor-runs')) return Promise.resolve(Response.json({ data: { usageTotalUsd: 0.5 } }))
    return Promise.resolve(Response.json([], { headers: { 'x-apify-run-id': 'r1' } }))
  }) as unknown as typeof fetch
  const apify = clienteDoApify({ tokens: ['a', 'b'], fetchFn })
  const exec = await apify.run({ actorId: ACTOR, input: {}, maxItems: 1, maxTotalChargeUsd: 1 })
  assertEquals(await apify.custoDaExecucao!(exec.runId!), 0.5)
  await apify.run({ actorId: ACTOR, input: {}, maxItems: 1, maxTotalChargeUsd: 1 })
  // a conta "a" esgotada é pulada na segunda execução
  assertEquals(usados, ['run:Bearer a', 'run:Bearer b', 'custo:Bearer b', 'run:Bearer b'])
})

Deno.test('cliente do Apify: todas sem crédito devolve 402; 429 troca de conta', async () => {
  const semCredito = clienteDoApify({
    tokens: ['a', 'b'],
    fetchFn: (() => Promise.resolve(new Response('x', { status: 402 }))) as unknown as typeof fetch,
  })
  let erro: unknown
  try {
    await semCredito.run({ actorId: ACTOR, input: {}, maxItems: 1, maxTotalChargeUsd: 1 })
  } catch (e) {
    erro = e
  }
  assertEquals((erro as ApifyRequestError).status, 402)
  let chamadas = 0
  const limitada = clienteDoApify({
    tokens: ['a', 'b'],
    fetchFn: ((_url: string, init?: RequestInit) => {
      chamadas++
      const auth = (init?.headers as Record<string, string>).Authorization
      if (auth === 'Bearer a') return Promise.resolve(new Response('x', { status: 429 }))
      return Promise.resolve(Response.json([], { headers: { 'x-apify-run-id': 'r429' } }))
    }) as unknown as typeof fetch,
  })
  const exec = await limitada.run({ actorId: ACTOR, input: {}, maxItems: 1, maxTotalChargeUsd: 1 })
  assertEquals(exec.runId, 'r429')
  assertEquals(chamadas, 2)
})
