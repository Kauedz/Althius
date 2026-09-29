// Os adaptadores reais do envio contra uma rede falsa: o que vai para a Unipile (caminho, corpo, cabeçalhos) e o que
// vai para o banco (RPCs), sem rede nem banco de verdade.
import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1'
import { UnipileRequestError } from './send-step.ts'
import { sendStepDbVia, unipileChatVia, whatsappDbVia } from './send-step-adapters.ts'

const CHAVE = 'chave-secreta-da-api-9f8e7d'
const CONTA = 'acc_dono'
const DESTINATARIO = '5511987654321@s.whatsapp.net'

interface Chamada {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  signal: AbortSignal | undefined
}

function redeFalsa(respostas: (chamada: Chamada) => Response) {
  const chamadas: Chamada[] = []
  const fetchFalso: typeof fetch = (input, init) => {
    const chamada: Chamada = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init?.signal ?? undefined,
    }
    chamadas.push(chamada)
    return Promise.resolve(respostas(chamada))
  }
  return { fetchFalso, chamadas }
}

const sinal = () => ({ signal: new AbortController().signal })

Deno.test('a chave da Unipile vai só no cabeçalho, nunca na URL', async () => {
  const { fetchFalso, chamadas } = redeFalsa(() => new Response('{}', { status: 200 }))
  const chat = unipileChatVia(CHAVE, fetchFalso)
  await chat.userExists(CONTA, DESTINATARIO, sinal())
  await chat.startChat(CONTA, DESTINATARIO, 'Olá', sinal())
  await chat.sendInChat(CONTA, DESTINATARIO, 'Olá de novo', sinal())
  assertEquals(chamadas.length, 3)
  for (const chamada of chamadas) {
    assertFalse(chamada.url.includes(CHAVE), `a chave apareceu na URL ${chamada.url}`)
    assertFalse(chamada.url.includes('api_key') || chamada.url.includes('apikey') || chamada.url.includes('?'))
    assertEquals(chamada.headers['X-API-KEY'], CHAVE)
    assert(chamada.url.startsWith('https://api.unipile.com/v2/'))
    assert(chamada.signal, 'toda chamada leva o sinal de tempo esgotado')
  }
})

Deno.test('conferir o número: GET no usuário do destinatário; 200 existe, 404 não tem WhatsApp', async () => {
  const { fetchFalso, chamadas } = redeFalsa((c) =>
    c.url.includes('5511000000000')
      ? new Response('{}', { status: 404 })
      : new Response('{"name":"Fulano"}', { status: 200 })
  )
  const chat = unipileChatVia(CHAVE, fetchFalso)
  assertEquals(await chat.userExists(CONTA, DESTINATARIO, sinal()), true)
  assertEquals(await chat.userExists(CONTA, '5511000000000@s.whatsapp.net', sinal()), false)
  assertEquals(chamadas[0].method, 'GET')
  assertEquals(chamadas[0].url, `https://api.unipile.com/v2/acc_dono/users/${encodeURIComponent(DESTINATARIO)}`)
})

Deno.test('conferir o número: 5xx, 401 e 429 são falha da conferência, com o Retry-After', async () => {
  for (const [status, retry, esperado] of [[503, null, null], [401, null, null], [429, '30', 30]] as const) {
    const { fetchFalso } = redeFalsa(() =>
      new Response('erro', { status, headers: retry ? { 'retry-after': retry } : {} })
    )
    const erro = await assertRejects(
      () => unipileChatVia(CHAVE, fetchFalso).userExists(CONTA, DESTINATARIO, sinal()),
      UnipileRequestError,
    )
    assertEquals(erro.status, status)
    assertEquals(erro.retryAfterSeconds, esperado)
  }
})

Deno.test('abrir a conversa: POST /chats/send com user_ids e text, e nada mais', async () => {
  const { fetchFalso, chamadas } = redeFalsa(() =>
    new Response(JSON.stringify({ chat_id: DESTINATARIO, message_id: 'msg-1', outro: 'x' }), { status: 200 })
  )
  const enviado = await unipileChatVia(CHAVE, fetchFalso).startChat(CONTA, DESTINATARIO, 'Olá, Maria.', sinal())
  assertEquals(enviado, { chatId: DESTINATARIO, messageId: 'msg-1' })
  assertEquals(chamadas[0].method, 'POST')
  assertEquals(chamadas[0].url, 'https://api.unipile.com/v2/acc_dono/chats/send')
  assertEquals(chamadas[0].body, { user_ids: [DESTINATARIO], text: 'Olá, Maria.' })
  assertEquals(chamadas[0].headers['content-type'], 'application/json')
})

Deno.test('enviar na conversa: POST /chats/{chat_id}/messages/send só com o texto (sem anexos)', async () => {
  const { fetchFalso, chamadas } = redeFalsa(() => new Response('{}', { status: 200 }))
  await unipileChatVia(CHAVE, fetchFalso).sendInChat(CONTA, DESTINATARIO, 'Seguindo.', sinal())
  assertEquals(chamadas[0].method, 'POST')
  assertEquals(
    chamadas[0].url,
    `https://api.unipile.com/v2/acc_dono/chats/${encodeURIComponent(DESTINATARIO)}/messages/send`,
  )
  assertEquals(chamadas[0].body, { text: 'Seguindo.' })
})

Deno.test('qualquer 2xx é aceito, mesmo com o corpo vazio, ilegível ou com campos que não conhecemos', async () => {
  for (
    const corpo of ['', 'não é json', '<html>ok</html>', '[]', 'null', '{"id": 42, "chat_id": 7, "message_id": ""}']
  ) {
    const { fetchFalso } = redeFalsa(() => new Response(corpo, { status: 200 }))
    const enviado = await unipileChatVia(CHAVE, fetchFalso).startChat(CONTA, DESTINATARIO, 'Oi', sinal())
    assertEquals(enviado, { chatId: null, messageId: null }, `corpo ${JSON.stringify(corpo)}`)
  }
  const { fetchFalso } = redeFalsa(() => new Response('', { status: 201 }))
  assertEquals(
    await unipileChatVia(CHAVE, fetchFalso).sendInChat(CONTA, DESTINATARIO, 'Oi', sinal()),
    { chatId: null, messageId: null },
  )
})

Deno.test('fora de 2xx o envio é recusa: o status e o Retry-After voltam', async () => {
  const { fetchFalso } = redeFalsa((c) =>
    c.url.endsWith('/chats/send')
      ? new Response('{"error":"x"}', { status: 429, headers: { 'retry-after': '90' } })
      : new Response('ruim', { status: 502 })
  )
  const chat = unipileChatVia(CHAVE, fetchFalso)
  const limite = await assertRejects(() => chat.startChat(CONTA, DESTINATARIO, 'Oi', sinal()), UnipileRequestError)
  assertEquals([limite.status, limite.retryAfterSeconds], [429, 90])
  const gateway = await assertRejects(() => chat.sendInChat(CONTA, DESTINATARIO, 'Oi', sinal()), UnipileRequestError)
  assertEquals([gateway.status, gateway.retryAfterSeconds], [502, null])
})

function bancoFalso(resultado: { data?: unknown; error?: unknown } = {}) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = []
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args })
      return Promise.resolve({ data: resultado.data ?? null, error: resultado.error ?? null })
    },
  }
  return { admin, chamadas }
}

Deno.test('gravar o resultado: o E-mail chama a RPC como antes; o WhatsApp acrescenta a conversa', async () => {
  const { admin, chamadas } = bancoFalso()
  const db = sendStepDbVia(admin)
  await db.recordStepSendResult({ sendId: 's1', outcome: 'sent', providerEmailId: 'e1', providerMessageId: '<m>' })
  await db.recordStepSendResult({
    sendId: 's2',
    outcome: 'sent',
    providerMessageId: null,
    providerChatId: DESTINATARIO,
  })
  assertEquals(Object.keys(chamadas[0].args).sort(), [
    'p_error',
    'p_outcome',
    'p_provider_email_id',
    'p_provider_message_id',
    'p_retry_after_seconds',
    'p_send_id',
  ])
  assertEquals(chamadas[1].args.p_provider_chat_id, DESTINATARIO)
  assertEquals(chamadas[1].args.p_provider_message_id, null)
})

Deno.test('o banco do WhatsApp: liberações, bloqueio e canal chamam as RPCs certas', async () => {
  const liberado = { outcome: 'released', send_id: 's1', unipile_account_id: CONTA, destination: '+5511987654321' }
  const { admin, chamadas } = bancoFalso({ data: [liberado] })
  const db = whatsappDbVia(admin)
  assertEquals(await db.releaseSend('s1', 'u1') as unknown, liberado)
  assertEquals(await db.releaseDueSend('s1') as unknown, liberado)
  await db.blockStep('s1', 'destination_no_whatsapp')
  assertEquals(chamadas.map((c) => c.fn), [
    'release_whatsapp_step_send',
    'release_due_whatsapp_step_send',
    'block_whatsapp_step_send',
  ])
  assertEquals(chamadas[0].args, { p_send_id: 's1', p_user_id: 'u1' })
  assertEquals(chamadas[1].args, { p_send_id: 's1' })
  assertEquals(chamadas[2].args, { p_send_id: 's1', p_reason: 'destination_no_whatsapp' })
})

Deno.test('o banco do WhatsApp: sem linha é envio inexistente (P0002); erro da RPC sobe; canal desconhecido é null', async () => {
  const vazio = whatsappDbVia(bancoFalso({ data: [] }).admin)
  const erro = await assertRejects(() => vazio.releaseSend('s1', 'u1'))
  assertEquals((erro as { code?: string }).code, 'P0002')
  const quebrado = whatsappDbVia(bancoFalso({ error: new Error('boom') }).admin)
  await assertRejects(() => quebrado.releaseDueSend('s1'), Error, 'boom')
  await assertRejects(() => quebrado.blockStep('s1', 'destination_no_whatsapp'), Error, 'boom')
  assertEquals(await whatsappDbVia(bancoFalso({ data: 'whatsapp' }).admin).stepSendChannel('s1', 'u1'), 'whatsapp')
  assertEquals(await whatsappDbVia(bancoFalso({ data: null }).admin).stepSendChannel('s1', 'u1'), null)
})
