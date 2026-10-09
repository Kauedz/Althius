// O endereço de aviso do link de conexão da v1 (canais-17): leva a chave ?k= do pedido, derivada do segredo da conexão.
import { assertEquals } from 'jsr:@std/assert@1'
import { createBridge } from './bridge.ts'
import { connectionNoticeKey } from './webhook-auth.ts'

const SECRET = 'segredo-v1-de-teste-com-mais-de-16'
const NOTIFY = 'https://projeto.supabase.co/functions/v1/unipile-account-status'

function fakeFetch() {
  const bodies: Array<Record<string, unknown>> = []
  const impl = ((_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return Promise.resolve(new Response(JSON.stringify({ url: 'https://account.unipile.com/x', link: 'https://account.unipile.com/x' }), { status: 200 }))
  }) as typeof fetch
  return { impl, bodies }
}

const request = {
  type: 'create' as const,
  providers: ['linkedin' as const],
  attemptId: 'f6000000-0000-0000-0000-000000000001',
  redirectUrl: 'https://app.althius.com.br/conexoes',
  expiresAt: new Date('2026-10-10T12:00:00.000Z'),
  notifyUrl: NOTIFY,
}

Deno.test('v1: o notify_url do link leva ?k= do pedido (HMAC do segredo da conexão), e o segredo nunca vai no pedido', async () => {
  const f = fakeFetch()
  const bridge = createBridge(
    { version: 'v1', baseUrl: 'https://api68.unipile.com:19840', apiKey: 'chave', webhookSecret: SECRET },
    { fetch: f.impl },
  )
  await bridge.createAuthLink(request)
  assertEquals(f.bodies[0].notify_url, `${NOTIFY}?k=${await connectionNoticeKey(SECRET, request.attemptId)}`)
  assertEquals(f.bodies[0].name, request.attemptId)
  assertEquals(JSON.stringify(f.bodies[0]).includes(SECRET), false)
})

Deno.test('v1: sem segredo da conexão o notify_url segue como veio (o aviso receberia 401: o canal exige o segredo)', async () => {
  const f = fakeFetch()
  const bridge = createBridge({ version: 'v1', baseUrl: 'https://api68.unipile.com:19840', apiKey: 'chave' }, { fetch: f.impl })
  await bridge.createAuthLink(request)
  assertEquals(f.bodies[0].notify_url, NOTIFY)
})

Deno.test('v2 não usa notify_url nem a chave: o state é o pedido', async () => {
  const f = fakeFetch()
  const bridge = createBridge({ version: 'v2', baseUrl: 'https://api.example.test', apiKey: 'chave', webhookSecret: SECRET }, { fetch: f.impl })
  await bridge.createAuthLink(request)
  assertEquals(JSON.stringify(f.bodies[0]).includes(SECRET), false)
  assertEquals(f.bodies[0].state, request.attemptId)
})
