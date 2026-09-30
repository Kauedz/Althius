import { assertEquals } from 'jsr:@std/assert@1'
import { apifyPhotoActor } from './apify.ts'
import { type Actor, createHandler, type Db, type Reserva } from './handler.ts'

const LOOKUP = 'd0000000-0000-0000-0000-000000000001'
const RESERVADA: Reserva = { kind: 'reserved', lookupId: LOOKUP, linkedinUrl: 'https://www.linkedin.com/in/maria' }
const FOTO = 'https://media.licdn.com/dms/image/maria.jpg'

function montar({ custo = 0.004 as number | null | Error, gravar = undefined as Error | undefined } = {}) {
  const custos: { lookupId: string; costUsd: number | null }[] = []
  const logs: Record<string, unknown>[] = []
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'ana' }),
    beginLookup: () => Promise.resolve(RESERVADA),
    finishLookup: () => Promise.resolve(),
    recordCost: (args) => (gravar ? Promise.reject(gravar) : (custos.push(args), Promise.resolve())),
  }
  const actor: Actor = {
    actorId: 'harvestapi~linkedin-profile-scraper',
    fetchPhoto: () => Promise.resolve({ photoUrl: FOTO, runId: 'run-1' }),
    custoDaExecucao: (runId) => {
      assertEquals(runId, 'run-1')
      return custo instanceof Error ? Promise.reject(custo) : Promise.resolve(custo)
    },
  }
  const handler = createHandler({ db, actor, appOrigin: 'https://app.althius.com.br', log: (c) => logs.push(c) })
  const pedido = () =>
    handler(
      new Request('https://fn.test/contact-photo-lookup', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.com.br' },
        body: JSON.stringify({ contactId: 'c0000000-0000-0000-0000-000000000001' }),
      }),
    )
  return { pedido, custos, logs }
}

Deno.test('o custo que o Apify informa é gravado junto da busca, sem mudar a resposta', async () => {
  const { pedido, custos } = montar()
  const resposta = await pedido()
  assertEquals([resposta.status, await resposta.json()], [200, { status: 'found' }])
  assertEquals(custos, [{ lookupId: LOOKUP, costUsd: 0.004 }])
})

Deno.test('sem custo informado, a busca é registrada com o valor em branco', async () => {
  const { pedido, custos } = montar({ custo: null })
  await pedido()
  assertEquals(custos, [{ lookupId: LOOKUP, costUsd: null }])
})

Deno.test('se não der para medir ou gravar o custo, a foto já foi entregue e a falha vai ao log', async () => {
  for (const problema of [{ custo: new Error('rede') }, { gravar: new Error('banco') }]) {
    const { pedido, logs } = montar(problema)
    const resposta = await pedido()
    assertEquals([resposta.status, await resposta.json()], [200, { status: 'found' }])
    assertEquals(logs.at(-1)?.outcome, 'cost_failed')
  }
})

Deno.test('o cliente do Apify lê data.usageTotalUsd da execução, e só aceita um número', async () => {
  const pedidos: Request[] = []
  const responder = (corpo: unknown, status = 200) => (entrada: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push(new Request(entrada, init))
    return Promise.resolve(new Response(JSON.stringify(corpo), { status }))
  }
  const com = (fetchFn: typeof fetch) => apifyPhotoActor({ token: 't', fetchFn }).custoDaExecucao!('run 1')

  assertEquals(await com(responder({ data: { usageTotalUsd: 0.0123 } })), 0.0123)
  assertEquals(new URL(pedidos[0].url).pathname, '/v2/actor-runs/run%201')
  assertEquals(pedidos[0].headers.get('Authorization'), 'Bearer t')
  assertEquals(await com(responder({ data: { usageTotalUsd: '0.01' } })), null)
  assertEquals(await com(responder({ data: {} })), null)
  assertEquals(await com(responder({ data: { usageTotalUsd: -1 } })), null)
  assertEquals(await com(responder({ error: {} }, 404)), null)
  assertEquals(await com(() => Promise.reject(new Error('rede'))), null)
})
