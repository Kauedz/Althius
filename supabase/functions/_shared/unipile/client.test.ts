// O cliente HTTP único da Unipile (canais-16): cabeçalhos, JSON e multipart, tempo limite e a classificação do erro.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { createUnipileClient, retryAfterSeconds } from './client.ts'
import { failureKind, UnipileChatRequestError, UnipileRequestError, UnipileUnreadableResponse } from './errors.ts'

interface Call {
  url: string
  init: RequestInit
}

function fakeFetch(...responses: Array<Response | (() => Promise<Response>)>) {
  const calls: Call[] = []
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('sem resposta combinada')
    return typeof next === 'function' ? next() : Promise.resolve(next)
  }) as typeof fetch
  return { impl, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

Deno.test('cliente: a chave, o accept e o JSON vão como a Unipile espera, na base da conexão', async () => {
  const f = fakeFetch(json({ ok: true }))
  const client = createUnipileClient({ baseUrl: 'https://api68.unipile.com:19840/', apiKey: 'chave-1', fetch: f.impl })
  await client.request('/api/v1/emails', { method: 'POST', json: { a: 1 } })
  assertEquals(f.calls[0].url, 'https://api68.unipile.com:19840/api/v1/emails')
  assertEquals(f.calls[0].init.method, 'POST')
  assertEquals(f.calls[0].init.headers, {
    'X-API-KEY': 'chave-1',
    accept: 'application/json',
    'content-type': 'application/json',
  })
  assertEquals(f.calls[0].init.body, '{"a":1}')
})

Deno.test('cliente: multipart leva FormData e deixa o fetch pôr o content-type; a consulta vira query string', async () => {
  const f = fakeFetch(json({}), json({}))
  const client = createUnipileClient({ baseUrl: 'https://api.unipile.com', apiKey: 'k', fetch: f.impl })
  await client.request('/api/v1/chats', { method: 'POST', form: { account_id: 'a 1', text: 'Oi' } })
  const headers = f.calls[0].init.headers as Record<string, string>
  assertEquals('content-type' in headers, false)
  const form = f.calls[0].init.body as FormData
  assert(form instanceof FormData)
  assertEquals(Object.fromEntries(form.entries()), { account_id: 'a 1', text: 'Oi' })

  await client.request('/v2/accounts/', { query: { limit: 100, vazio: undefined } })
  assertEquals(f.calls[1].url, 'https://api.unipile.com/v2/accounts/?limit=100')
  assertEquals(f.calls[1].init.method, 'GET')
})

Deno.test('cliente: fora de 2xx a recusa definitiva leva o motivo; 5xx, 408 e 429 ficam incertos e sem motivo', async () => {
  const client = (response: Response) =>
    createUnipileClient({ baseUrl: 'https://api.unipile.com', apiKey: 'k', fetch: fakeFetch(response).impl })

  const credit = await assertRejects(
    () => client(json({ title: 'Not enough credits' }, 402)).request('/x'),
    UnipileChatRequestError,
  )
  assertEquals([credit.status, credit.reason, failureKind(credit)], [402, 'insufficient_credits', 'definite_refusal'])

  const limited = await assertRejects(
    () => client(json({}, 429, { 'retry-after': '90' })).request('/x'),
    UnipileRequestError,
  )
  assertEquals([limited.status, limited.retryAfterSeconds, failureKind(limited)], [429, 90, 'uncertain'])
  assertEquals((limited as UnipileChatRequestError).reason ?? null, null)

  const down = await assertRejects(() => client(json({}, 502)).request('/x'), UnipileRequestError)
  assertEquals([down.status, failureKind(down)], [502, 'uncertain'])
})

Deno.test('cliente: json() devolve o corpo; corpo ilegível ou que não bate no schema é resposta ilegível, incerta', async () => {
  const ok = createUnipileClient({ baseUrl: 'https://api.unipile.com', apiKey: 'k', fetch: fakeFetch(json({ id: 'x' })).impl })
  assertEquals(await ok.json('/x'), { id: 'x' })

  const html = createUnipileClient({
    baseUrl: 'https://api.unipile.com',
    apiKey: 'k',
    fetch: fakeFetch(new Response('<html>', { status: 200 })).impl,
  })
  const error = await assertRejects(() => html.json('/x'), UnipileUnreadableResponse)
  assertEquals(failureKind(error), 'uncertain')
})

Deno.test('cliente: o tempo limite do próprio cliente aborta a chamada, e o sinal de quem chama também', async () => {
  const hang = () =>
    new Promise<Response>(() => {
      /* nunca responde */
    })
  const slow = ((_: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('abortado', 'AbortError')))
      hang()
    })) as typeof fetch
  const client = createUnipileClient({ baseUrl: 'https://api.unipile.com', apiKey: 'k', fetch: slow, timeoutMs: 20 })
  await assertRejects(() => client.request('/x'), DOMException)

  const controller = new AbortController()
  const pending = createUnipileClient({ baseUrl: 'https://api.unipile.com', apiKey: 'k', fetch: slow, timeoutMs: 60_000 })
    .request('/x', { signal: controller.signal })
  controller.abort()
  await assertRejects(() => pending, DOMException)
})

Deno.test('Retry-After: segundos ou data HTTP; ausente ou ilegível é nulo', () => {
  assertEquals(retryAfterSeconds('30'), 30)
  assertEquals(retryAfterSeconds(null), null)
  assertEquals(retryAfterSeconds('amanhã'), null)
  assertEquals(retryAfterSeconds('Wed, 21 Oct 2026 07:28:30 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')), 30)
})
