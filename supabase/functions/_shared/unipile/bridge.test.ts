// O mesmo conjunto de testes do contrato roda contra os dois adaptadores (canais-16), com servidores simulados: o que a
// ponte manda bate com o schema de pedido da versão, e o que a Unipile devolve vira o que o núcleo do envio espera.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { createBridge } from './bridge.ts'
import { failureKind, UnipileUnsupportedOperationError } from './errors.ts'
import { v1 } from './v1.ts'
import { v2 } from './v2.ts'

type Version = 'v1' | 'v2'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  json?: Record<string, unknown>
  form?: Record<string, string>
}

function fakeFetch(...responses: Response[]) {
  const calls: Call[] = []
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      json: typeof body === 'string' ? JSON.parse(body) : undefined,
      form: body instanceof FormData ? Object.fromEntries([...body.entries()].map(([k, v]) => [k, String(v)])) : undefined,
    })
    const next = responses.shift()
    if (!next) throw new Error('sem resposta combinada')
    return Promise.resolve(next)
  }) as typeof fetch
  return { impl, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const BASE: Record<Version, string> = { v2: 'https://api.unipile.com', v1: 'https://api68.unipile.com:19840' }
const bridge = (version: Version, f: ReturnType<typeof fakeFetch>) =>
  createBridge({ version, baseUrl: BASE[version], apiKey: 'chave' }, { fetch: f.impl })
const signal = () => ({ signal: new AbortController().signal })
const email = {
  to: [{ email: 'maria@empresa.com.br' }],
  subject: 'Olá',
  plain_text: 'Linha 1\nA & B <c>',
  custom_headers: [{ name: 'X-Althius-Envio', value: '5b0e4b3e-6d0b-4c89-8f0f-0d5f0b7a9e11' }],
}

for (const version of ['v2', 'v1'] as const) {
  Deno.test(`[${version}] ponte: informa a versão, e todo pedido leva a chave e a base da conexão`, async () => {
    const f = fakeFetch(json({ id: 'em-1', message_id: '<a@b>' }))
    const b = bridge(version, f)
    assertEquals(b.version, version)
    await b.sendEmail('conta-1', email, signal())
    assert(f.calls[0].url.startsWith(BASE[version]))
    assertEquals(f.calls[0].headers['X-API-KEY'], 'chave')
  })

  Deno.test(`[${version}] e-mail: o pedido bate com o schema da versão e a resposta vira { id, message_id }`, async () => {
    const f = fakeFetch(json({ id: 'em-1', message_id: '<a@b>' }), json({ message_id: '<sem-id@b>' }))
    const b = bridge(version, f)
    assertEquals(await b.sendEmail('conta-1', email, signal()), { id: 'em-1', message_id: '<a@b>' })
    const call = f.calls[0]
    if (version === 'v2') {
      assertEquals(call.url, 'https://api.unipile.com/v2/conta-1/emails/send')
      assert(v2.sendEmail.request.safeParse(call.json).success)
      assertEquals(call.json?.plain_text, email.plain_text)
    } else {
      assertEquals(call.url, 'https://api68.unipile.com:19840/api/v1/emails')
      assert(v1.sendEmail.request.safeParse(call.json).success)
      // O corpo da v1 é HTML: escapado e com <br> nas quebras de linha.
      assertEquals(call.json?.body, 'Linha 1<br>A &amp; B &lt;c&gt;')
      assertEquals(call.json?.account_id, 'conta-1')
      assertEquals(call.json?.to, [{ identifier: 'maria@empresa.com.br' }])
      assert(v1.sendEmailIdempotencyKey.safeParse(call.headers['Idempotency-Key']).success)
    }
    assertEquals(call.json?.custom_headers, email.custom_headers)
    // Sem o id do e-mail, o envio provavelmente saiu: a resposta é ilegível, incerta.
    const error = await assertRejects(() => b.sendEmail('conta-1', email, signal()))
    assertEquals(failureKind(error), 'uncertain')
  })

  Deno.test(`[${version}] abrir conversa e continuar: o pedido bate com o schema e a resposta vira { chat_id, message_id }`, async () => {
    const f = fakeFetch(json({ chat_id: 'chat-1', message_id: 'msg-1' }), json({ id: 'msg-2' }))
    const b = bridge(version, f)
    assertEquals(
      await b.startChat('acc', { userId: '5511988887777@s.whatsapp.net', text: 'Olá' }, signal()),
      { chat_id: 'chat-1', message_id: 'msg-1' },
    )
    assertEquals(await b.sendChatMessage('acc', 'chat/1', 'Oi de novo', signal()), { chat_id: 'chat/1', message_id: 'msg-2' })
    if (version === 'v2') {
      assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/acc/chats/send')
      assert(v2.startChat.request.safeParse(f.calls[0].json).success)
      assertEquals(f.calls[1].url, 'https://api.unipile.com/v2/acc/chats/chat%2F1/messages/send')
      assertEquals(f.calls[1].json, { text: 'Oi de novo' })
    } else {
      // A v1 manda formulário multipart, com a conta no corpo.
      assertEquals(f.calls[0].url, 'https://api68.unipile.com:19840/api/v1/chats')
      assertEquals(f.calls[0].form, { account_id: 'acc', attendees_ids: '5511988887777@s.whatsapp.net', text: 'Olá' })
      assert(v1.startChat.request.safeParse(f.calls[0].form && { ...f.calls[0].form, attendees_ids: [f.calls[0].form.attendees_ids] }).success)
      assertEquals(f.calls[1].url, 'https://api68.unipile.com:19840/api/v1/chats/chat%2F1/messages')
      assertEquals(f.calls[1].form, { account_id: 'acc', text: 'Oi de novo' })
    }
  })

  Deno.test(`[${version}] link de conexão: conexão nova e reconexão, e o link volta só se for https`, async () => {
    const link = version === 'v2' ? { link: 'https://auth.unipile.com/x' } : { url: 'https://auth.unipile.com/x' }
    const f = fakeFetch(json(link), json(link), json({ link: 'http://inseguro', url: 'http://inseguro' }))
    const b = bridge(version, f)
    const base = {
      attemptId: 'tentativa-1',
      redirectUrl: 'https://app.althius.com/conexoes',
      expiresAt: new Date('2026-10-10T12:00:00.000Z'),
      notifyUrl: 'https://projeto.supabase.co/functions/v1/unipile-account-status',
    }
    assertEquals(await b.createAuthLink({ ...base, type: 'create', providers: ['google'] }, signal()), { url: 'https://auth.unipile.com/x' })
    assertEquals(await b.createAuthLink({ ...base, type: 'reconnect', reconnectAccountId: 'acc-9' }, signal()), { url: 'https://auth.unipile.com/x' })
    if (version === 'v2') {
      assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/auth/link')
      assert(v2.createAuthLink.request.safeParse(f.calls[0].json).success)
      assertEquals(f.calls[0].json?.state, 'tentativa-1')
      assertEquals(f.calls[0].json?.providers, ['google'])
      assertEquals(f.calls[1].json?.account_id, 'acc-9')
    } else {
      assertEquals(f.calls[0].url, 'https://api68.unipile.com:19840/api/v1/hosted/accounts/link')
      assert(v1.createAuthLink.request.safeParse(f.calls[0].json).success)
      assert(v1.createAuthLink.request.safeParse(f.calls[1].json).success)
      // Na v1 o pedido volta no aviso do notify_url como `name`, e os provedores vão em MAIÚSCULAS.
      assertEquals(f.calls[0].json?.name, 'tentativa-1')
      assertEquals(f.calls[0].json?.providers, ['GOOGLE'])
      assertEquals(f.calls[0].json?.api_url, 'https://api68.unipile.com:19840')
      assertEquals(f.calls[1].json?.reconnect_account, 'acc-9')
    }
    await assertRejects(() => b.createAuthLink({ ...base, type: 'create', providers: ['google'] }, signal()))
  })

  Deno.test(`[${version}] contas: lista normalizada em conectada, atenção ou desconectada`, async () => {
    const f = fakeFetch(
      version === 'v2'
        ? json({
          data: [
            { id: 'a', provider: 'google', status: 'running', created_at: '2026-10-01T00:00:00Z' },
            { id: 'b', provider: 'linkedin', status: 'errored' },
          ],
          has_more: true,
        })
        : json({
          items: [
            { id: 'a', type: 'GOOGLE', created_at: '2026-10-01T00:00:00Z', sources: [{ status: 'OK' }] },
            { id: 'b', type: 'LINKEDIN', sources: [{ status: 'OK' }, { status: 'CREDENTIALS' }] },
          ],
          cursor: 'mais',
        }),
    )
    const result = await bridge(version, f).listAccounts(signal())
    assertEquals(result.accounts.map((a) => [a.id, a.state]), [['a', 'connected'], ['b', 'attention']])
    // A lista veio paginada: quem usa não conclui que uma conta sumiu.
    assertEquals(result.complete, false)
    assertEquals(f.calls[0].url, version === 'v2' ? 'https://api.unipile.com/v2/accounts/?limit=100' : 'https://api68.unipile.com:19840/api/v1/accounts?limit=250')
  })

  Deno.test(`[${version}] desconectar: 404 é conta que já não existe, e outro erro continua erro`, async () => {
    const f = fakeFetch(json({}), json({}, 404), json({}, 500))
    const b = bridge(version, f)
    assertEquals(await b.disconnectAccount('acc 1', signal()), 'disconnected')
    assertEquals(await b.disconnectAccount('acc 1', signal()), 'already_gone')
    await assertRejects(() => b.disconnectAccount('acc 1', signal()))
    assertEquals(f.calls[0].method, 'DELETE')
    assertEquals(f.calls[0].url, `${BASE[version]}${version === 'v2' ? '/v2' : '/api/v1'}/accounts/acc%201`)
  })

  Deno.test(`[${version}] LinkedIn: convite, perfil (id nativo e grau) e mensagens da conversa`, async () => {
    const f = fakeFetch(
      json(version === 'v2' ? { id: 'inv-1' } : { invitation_id: 'inv-1' }),
      json(version === 'v2' ? { id: 'ACoAA', network_distance: 'FIRST_DEGREE' } : { provider_id: 'ACoAA', network_distance: 'FIRST_DEGREE' }),
      json(version === 'v2' ? [{ id: 'm1' }, 'lixo'] : { items: [{ id: 'm1' }], cursor: null }),
    )
    const b = bridge(version, f)
    assertEquals(await b.sendInvitation('acc', { userId: 'ACoAA', message: 'Oi' }, signal()), { id: 'inv-1' })
    assertEquals(await b.getLinkedInProfile('acc', 'maria-souza', signal()), { providerId: 'ACoAA', firstDegree: true })
    assertEquals(await b.listChatMessages('acc', 'chat-1'), [{ id: 'm1' }])
    if (version === 'v2') {
      assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/acc/users/me/relation-requests')
      assertEquals(f.calls[1].url, 'https://api.unipile.com/v2/acc/users/maria-souza')
      assertEquals(f.calls[2].url, 'https://api.unipile.com/v2/acc/chats/chat-1/messages?limit=50')
    } else {
      assertEquals(f.calls[0].url, 'https://api68.unipile.com:19840/api/v1/users/invite')
      assertEquals(f.calls[0].json, { account_id: 'acc', provider_id: 'ACoAA', message: 'Oi' })
      assertEquals(f.calls[1].url, 'https://api68.unipile.com:19840/api/v1/users/maria-souza?account_id=acc')
      assertEquals(f.calls[2].url, 'https://api68.unipile.com:19840/api/v1/chats/chat-1/messages?account_id=acc&limit=50')
    }
  })

  Deno.test(`[${version}] chats: as conversas recentes da conta, para a conferência`, async () => {
    const f = fakeFetch(json(version === 'v2' ? [{ id: 'c1' }, 'lixo'] : { items: [{ id: 'c1' }], cursor: null }))
    assertEquals(await bridge(version, f).listChats('acc', { limit: 3 }), [{ id: 'c1' }])
    assertEquals(
      f.calls[0].url,
      version === 'v2' ? 'https://api.unipile.com/v2/acc/chats?limit=3' : 'https://api68.unipile.com:19840/api/v1/chats?account_id=acc&limit=3',
    )
  })

  Deno.test(`[${version}] a recusa da Unipile vira erro tipado: 4xx definitiva com motivo, 5xx incerta`, async () => {
    const f = fakeFetch(json({ title: 'insufficient credits' }, 402), json({}, 503))
    const b = bridge(version, f)
    const refused = await assertRejects(() => b.startChat('acc', { userId: 'u', text: 't' }, signal()))
    assertEquals([failureKind(refused), (refused as { reason?: string }).reason], ['definite_refusal', 'insufficient_credits'])
    const down = await assertRejects(() => b.startChat('acc', { userId: 'u', text: 't' }, signal()))
    assertEquals([failureKind(down), (down as { status?: number }).status], ['uncertain', 503])
  })
}

Deno.test('[v1] o que a v1 não faz ainda recusa antes de chamar a Unipile: anexo, resposta em conversa de e-mail e leituras de e-mail', async () => {
  const f = fakeFetch()
  const b = bridge('v1', f)
  const attachment = { filename: 'a.pdf', content_type: 'application/pdf', content: 'AAAA' }
  const refusals = await Promise.all([
    assertRejects(() => b.sendEmail('acc', { ...email, attachments: [attachment] }, signal()), UnipileUnsupportedOperationError),
    assertRejects(() => b.sendEmail('acc', { ...email, reply_to_message_id: 'm-1' }, signal()), UnipileUnsupportedOperationError),
    assertRejects(() => b.startChat('acc', { userId: 'u', text: 't', attachments: [attachment] }, signal()), UnipileUnsupportedOperationError),
    assertRejects(() => b.getEmail('acc', 'e1'), UnipileUnsupportedOperationError),
    assertRejects(() => b.listThreadEmails('acc', 't1'), UnipileUnsupportedOperationError),
    assertRejects(() => b.listEmailSenders('acc'), UnipileUnsupportedOperationError),
  ])
  // Nada saiu: a recusa é definitiva, e a Unipile nem foi chamada.
  for (const error of refusals) assertEquals(failureKind(error), 'definite_refusal')
  assertEquals(f.calls.length, 0)
})

Deno.test('[v2] e-mail e conversa: anexos e resposta em conversa seguem no mesmo JSON, como antes', async () => {
  const f = fakeFetch(json({ id: 'em-1' }), json({ chat_id: 'c' }))
  const b = bridge('v2', f)
  const attachment = { filename: 'a.pdf', content_type: 'application/pdf', content: 'AAAA' }
  await b.sendEmail('acc', { ...email, attachments: [attachment], reply_to_message_id: 'm-1' }, signal())
  assertEquals(f.calls[0].json?.attachments, [attachment])
  assertEquals(f.calls[0].json?.reply_to_message_id, 'm-1')
  await b.startChat('acc', { userId: 'u', text: 't', attachments: [attachment] }, signal())
  assertEquals(f.calls[1].json?.attachments, [attachment])
})

Deno.test('anexo recebido: a chave só vai à origem da conexão; uma URL de outro endereço baixa sem a chave', async () => {
  const bytes = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/pdf' } })
  for (const version of ['v2', 'v1'] as const) {
    const f = fakeFetch(bytes(), bytes(), bytes())
    const b = bridge(version, f)
    const own = await b.downloadEmailAttachment('acc', 'e1', { id: 'att 1' })
    assertEquals([...own.bytes], [1, 2, 3])
    assertEquals(own.contentType, 'application/pdf')
    assertEquals(
      f.calls[0].url,
      version === 'v2'
        ? 'https://api.unipile.com/v2/acc/emails/e1/attachments/att%201'
        : 'https://api68.unipile.com:19840/api/v1/emails/e1/attachments/att%201?account_id=acc',
    )
    assertEquals(f.calls[0].headers['X-API-KEY'], 'chave')
    await b.downloadEmailAttachment('acc', 'e1', { id: 'a', url: `${BASE[version]}/arquivos/a` })
    assertEquals(f.calls[1].headers['X-API-KEY'], 'chave')
    await b.downloadEmailAttachment('acc', 'e1', { id: 'a', url: 'https://cdn.exemplo.com/a' })
    assertEquals(f.calls[2].url, 'https://cdn.exemplo.com/a')
    assertEquals('X-API-KEY' in f.calls[2].headers, false)
  }
})
