// A conferência por conta (canais-16): só leitura, nas duas versões, e nunca imprime a chave.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { createBridge } from './bridge.ts'
import { conferir } from './conferir.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; method: string }[] = []
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })
    return Promise.resolve(handler(String(input), init))
  }) as typeof fetch
  return { impl, calls }
}

Deno.test('conferir v2: lista as contas e os 3 últimos chats de cada uma, sem escrever nada e sem a chave', async () => {
  const f = fakeFetch((url) =>
    url.endsWith('/v2/accounts/?limit=100')
      ? json({ data: [{ id: 'acc-1', provider: 'linkedin', status: 'running' }, { id: 'acc-2', provider: 'google', status: 'errored' }], has_more: false })
      : url.includes('/v2/acc-1/chats') ? json({ items: [{ id: 'c1' }, { id: 'c2' }] }) : json({ title: 'segredo-do-corpo' }, 500)
  )
  const bridge = createBridge({ version: 'v2', baseUrl: 'https://api.unipile.com', apiKey: 'CHAVE-SECRETA' }, { fetch: f.impl })
  const lines = await conferir(bridge, { name: 'teste-1', version: 'v2', baseUrl: 'https://api.unipile.com' })
  const text = lines.join('\n')
  assertStringIncludes(text, 'Conexão: teste-1 (v2) em api.unipile.com')
  assertStringIncludes(text, 'acc-1 linkedin connected')
  assertStringIncludes(text, 'acc-2 google attention')
  assertStringIncludes(text, 'chats recentes: c1, c2')
  // Um chat que falha não derruba a conferência, e o corpo da falha nunca aparece.
  assertStringIncludes(text, 'não foi possível listar os chats (HTTP 500)')
  assertEquals(text.includes('CHAVE-SECRETA') || text.includes('segredo-do-corpo'), false)
  assertEquals(f.calls.every((call) => call.method === 'GET'), true)
})

Deno.test('conferir v1: usa o endereço da conta e avisa quando a lista é parcial', async () => {
  const f = fakeFetch((url) =>
    url.includes('/api/v1/accounts') ? json({ items: [{ id: 'acc-9', type: 'WHATSAPP', sources: [{ status: 'OK' }] }], cursor: 'mais' }) : json({ items: [] })
  )
  const bridge = createBridge({ version: 'v1', baseUrl: 'https://api68.unipile.com:19840', apiKey: 'k' }, { fetch: f.impl })
  const text = (await conferir(bridge, { name: 'teste-2', version: 'v1', baseUrl: 'https://api68.unipile.com:19840' })).join('\n')
  assertStringIncludes(text, 'Conexão: teste-2 (v1) em api68.unipile.com:19840')
  assertStringIncludes(text, 'acc-9 WHATSAPP connected')
  assertStringIncludes(text, 'há mais contas')
  assertStringIncludes(text, '(sem chats)')
})

Deno.test('conferir --link: gera o link de conexão pela ponte e mostra só o link', async () => {
  const f = fakeFetch((url) =>
    url.endsWith('/auth/link') ? json({ link: 'https://account.unipile.com/abc' }) : json({ data: [], has_more: false })
  )
  const bridge = createBridge({ version: 'v2', baseUrl: 'https://api.unipile.com', apiKey: 'k' }, { fetch: f.impl })
  const text = (await conferir(bridge, { name: 'n', version: 'v2', baseUrl: 'https://api.unipile.com' }, {
    link: { provider: 'google', redirectUrl: 'https://app.althius.com/conexoes' },
  })).join('\n')
  assertStringIncludes(text, 'Link de conexão (google): https://account.unipile.com/abc')
})
