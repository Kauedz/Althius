import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  classifyProviderError,
  readChatSent,
  readLinkedInProfile,
  sendChatStepDbVia,
  START_CHAT_USERS_FIELD,
  unipileChatVia,
} from './send-chat-step-adapters.ts'
import { UnipileChatRequestError } from './send-chat-step.ts'
import { UnipileRequestError, UnipileUnreadableResponse } from './send-step.ts'

interface Captured {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function fakeFetch(responses: Response[]) {
  const calls: Captured[] = []
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const next = responses.shift()
    if (!next) throw new Error('sem resposta combinada')
    return Promise.resolve(next)
  }) as typeof fetch
  return { impl, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const signal = () => ({ signal: new AbortController().signal })

Deno.test('abrir conversa: POST /v2/{conta}/chats/send com o id do usuário e o texto', async () => {
  const f = fakeFetch([json({ chat_id: 'chat-1', message_id: 'msg-1' })])
  const result = await unipileChatVia('chave', f.impl).startChat(
    'unipile-wa-1',
    { userId: '5511988887777@s.whatsapp.net', text: 'Olá' },
    signal(),
  )
  assertEquals(result, { chat_id: 'chat-1', message_id: 'msg-1' })
  assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/unipile-wa-1/chats/send')
  assertEquals(f.calls[0].method, 'POST')
  assertEquals(f.calls[0].headers['X-API-KEY'], 'chave')
  assertEquals(f.calls[0].body, { [START_CHAT_USERS_FIELD]: ['5511988887777@s.whatsapp.net'], text: 'Olá' })
  assertEquals(START_CHAT_USERS_FIELD, 'users_ids')
})

Deno.test('continuar conversa: POST /v2/{conta}/chats/{chat}/messages/send só com o texto', async () => {
  const f = fakeFetch([json({ id: 'msg-2' })])
  const result = await unipileChatVia('chave', f.impl).sendChatMessage('conta 1', 'chat/1', 'Oi de novo', signal())
  assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/conta%201/chats/chat%2F1/messages/send')
  assertEquals(f.calls[0].body, { text: 'Oi de novo' })
  assertEquals(result, { chat_id: 'chat/1', message_id: 'msg-2' })
})

Deno.test('convite: POST /v2/{conta}/users/me/relation-requests com user_id e a nota em message', async () => {
  const f = fakeFetch([json({ id: 'inv-1' })])
  const result = await unipileChatVia('chave', f.impl).sendInvitation(
    'unipile-li-1',
    { userId: 'ACoAAMaria', message: 'Vamos nos conectar?' },
    signal(),
  )
  assertEquals(result, { id: 'inv-1' })
  assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/unipile-li-1/users/me/relation-requests')
  assertEquals(f.calls[0].body, { user_id: 'ACoAAMaria', message: 'Vamos nos conectar?' })
})

Deno.test('convite: 2xx sem id é ilegível, e a resposta que não é JSON também', async () => {
  const empty = fakeFetch([json({ object: 'RelationRequestSent' })])
  await assertRejects(
    () => unipileChatVia('chave', empty.impl).sendInvitation('a', { userId: 'u', message: 'm' }, signal()),
    UnipileUnreadableResponse,
  )
  const notJson = fakeFetch([new Response('ok', { status: 200 })])
  await assertRejects(
    () => unipileChatVia('chave', notJson.impl).startChat('a', { userId: 'u', text: 't' }, signal()),
    UnipileUnreadableResponse,
  )
})

Deno.test('perfil: GET /v2/{conta}/users/{perfil} devolve o id nativo e se já é conexão', async () => {
  const f = fakeFetch([json({ id: 'ACoAAMaria', network_distance: 'FIRST_DEGREE' })])
  const profile = await unipileChatVia('chave', f.impl).getLinkedInProfile('unipile-li-1', 'maria-souza', signal())
  assertEquals(profile, { providerId: 'ACoAAMaria', firstDegree: true })
  assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/unipile-li-1/users/maria-souza')
})

Deno.test('a distância de rede é lida em vários formatos, e o que não se entende fica desconhecido', () => {
  const distance = (value: unknown) => readLinkedInProfile({ id: 'x', network_distance: value }).firstDegree
  assertEquals(distance('FIRST_DEGREE'), true)
  assertEquals(distance('DISTANCE_1'), true)
  assertEquals(distance(1), true)
  assertEquals(distance('SECOND_DEGREE'), false)
  assertEquals(distance('THIRD_DEGREE'), false)
  assertEquals(distance('OUT_OF_NETWORK'), false)
  assertEquals(distance(3), false)
  assertEquals(distance('talvez'), null)
  assertEquals(distance(undefined), null)
  assertEquals(readLinkedInProfile({ provider_id: 'y', distance: 'FIRST_DEGREE' }), { providerId: 'y', firstDegree: true })
  assertEquals(readLinkedInProfile({ id: 'z', is_connection: true }).firstDegree, true)
  try {
    readLinkedInProfile({ network_distance: 'FIRST_DEGREE' })
    throw new Error('devia rejeitar')
  } catch (error) {
    assertEquals(error instanceof UnipileUnreadableResponse, true)
  }
})

Deno.test('os ids de um envio: chat_id e message_id valem; id sozinho depende de a conversa ser nova ou antiga', () => {
  assertEquals(readChatSent({ chat_id: 'c', message_id: 'm' }), { chat_id: 'c', message_id: 'm' })
  assertEquals(readChatSent({ id: 'c' }), { chat_id: 'c', message_id: null })
  assertEquals(readChatSent({ id: 'm' }, 'chat-9'), { chat_id: 'chat-9', message_id: 'm' })
  assertEquals(readChatSent({ message_id: 'm' }), { chat_id: null, message_id: 'm' })
  try {
    readChatSent({ object: 'ChatSent' })
    throw new Error('devia rejeitar')
  } catch (error) {
    assertEquals(error instanceof UnipileUnreadableResponse, true)
  }
})

Deno.test('conferir a conversa: GET das mensagens recentes, em lista pura ou dentro de items', async () => {
  const f = fakeFetch([json([{ id: 'm1' }, 'lixo', null]), json({ items: [{ id: 'm2' }] })])
  const unipile = unipileChatVia('chave', f.impl)
  assertEquals(await unipile.listChatMessages('conta', 'chat-1'), [{ id: 'm1' }])
  assertEquals(await unipile.listChatMessages('conta', 'chat-1'), [{ id: 'm2' }])
  assertEquals(f.calls[0].url, 'https://api.unipile.com/v2/conta/chats/chat-1/messages?limit=50')
})

Deno.test('uma recusa 4xx carrega o motivo que o corpo da resposta deu; 5xx e 429 não', async () => {
  const credit = fakeFetch([json({ title: 'Insufficient credits to send InMail' }, 403)])
  const error = await assertRejects(
    () => unipileChatVia('chave', credit.impl).startChat('a', { userId: 'u', text: 't' }, signal()),
    UnipileChatRequestError,
  )
  assertEquals(error.status, 403)
  assertEquals(error.reason, 'insufficient_credits')

  const limited = fakeFetch([json({}, 429, { 'retry-after': '90' })])
  const rate = await assertRejects(
    () => unipileChatVia('chave', limited.impl).startChat('a', { userId: 'u', text: 't' }, signal()),
    UnipileRequestError,
  )
  assertEquals(rate.status, 429)
  assertEquals(rate.retryAfterSeconds, 90)
  assertEquals((rate as UnipileChatRequestError).reason, null)
})

Deno.test('o código do motivo sai do texto da recusa', () => {
  assertEquals(classifyProviderError(403, '{"detail":"You have no credits left"}'), 'insufficient_credits')
  assertEquals(classifyProviderError(402, ''), 'insufficient_credits')
  assertEquals(classifyProviderError(422, 'Invitation note exceeds the maximum length'), 'invite_note_too_long')
  assertEquals(classifyProviderError(422, 'There is already a pending invitation for this user'), 'invite_already_pending')
  assertEquals(classifyProviderError(403, 'Requires a Sales Navigator subscription'), 'subscription_required')
  assertEquals(classifyProviderError(403, 'Recipient is not a first degree connection'), 'not_connected')
  assertEquals(classifyProviderError(404, 'User not found'), 'recipient_not_found')
  assertEquals(classifyProviderError(422, 'Weekly invitation limit reached'), 'provider_limit_reached')
  assertEquals(classifyProviderError(400, '{"title":"bad request"}'), 'http_400')
})

Deno.test('o banco: as RPCs recebem os parâmetros com os nomes do banco', async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return Promise.resolve({
        data: fn === 'chat_conversation_for_send'
          ? [{ unipile_account_id: 'conta', provider_chat_id: 'chat-1' }]
          : fn === 'ingest_unipile_chat_event'
          ? [{ outcome: 'reply', interaction_id: 'i', send_id: 's' }]
          : null,
        error: null,
      })
    },
  }
  const db = sendChatStepDbVia(admin)
  assertEquals(await db.chatConversationForSend('s1', 'u1'), { unipile_account_id: 'conta', provider_chat_id: 'chat-1' })
  assertEquals(
    await db.ingestChatEvent({ eventId: 'evt', eventType: 'message.new', unipileAccountId: 'conta', payload: { id: 'm' } }),
    { outcome: 'reply', interaction_id: 'i', send_id: 's' },
  )
  await db.recordChatStepSendResult({
    sendId: 's1',
    outcome: 'blocked',
    providerUserId: 'ACoAA',
    linkedinAction: 'convite',
    error: 'invite_note_too_long',
  })
  assertEquals(calls[0], { fn: 'chat_conversation_for_send', args: { p_send_id: 's1', p_user_id: 'u1' } })
  assertEquals(calls[1].fn, 'ingest_unipile_chat_event')
  assertEquals(calls[1].args, {
    p_event_id: 'evt',
    p_unipile_account_id: 'conta',
    p_event_type: 'message.new',
    p_payload: { id: 'm' },
  })
  assertEquals(calls[2], {
    fn: 'record_chat_step_send_result',
    args: {
      p_send_id: 's1',
      p_outcome: 'blocked',
      p_provider_chat_id: null,
      p_provider_message_id: null,
      p_provider_user_id: 'ACoAA',
      p_linkedin_action: 'convite',
      p_error: 'invite_note_too_long',
      p_retry_after_seconds: null,
    },
  })
})
