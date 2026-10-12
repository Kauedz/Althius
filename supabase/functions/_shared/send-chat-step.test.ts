import { assertEquals } from 'jsr:@std/assert@1'
import type { IngestChatEventInput } from './ingest-chat-event.ts'
import {
  characterCount,
  type ChatChannel,
  type ChatReleaseResult,
  type ChatSendDb,
  type ChatSent,
  decideLinkedInAction,
  linkedInIdentifier,
  type LinkedInProfile,
  type ReleasedChatSend,
  sendChatStep,
  toWhatsAppUserId,
  type UnipileChat,
  UnipileChatRequestError,
} from './send-chat-step.ts'
import { UnipileRequestError, UnipileUnreadableResponse } from './send-step.ts'

const SEND = '60000000-0000-0000-0000-000000000001'
const TITULAR = '50000000-0000-0000-0000-000000000001'
const TIMEOUT = Symbol('timeout')

function released(overrides: Partial<ReleasedChatSend> = {}): ReleasedChatSend {
  return {
    outcome: 'released',
    send_id: SEND,
    channel: 'whatsapp' as ChatChannel,
    unipile_account_id: 'unipile-wa-1',
    destination: '+5511988887777',
    contact_name: 'Maria Souza',
    body: 'Olá, Maria.',
    linkedin_subtype: null,
    provider_chat_id: null,
    provider_user_id: null,
    invite_sent: false,
    invite_note_limit: 300,
    ...overrides,
  }
}

function linkedin(overrides: Partial<ReleasedChatSend> = {}): ReleasedChatSend {
  return released({
    channel: 'linkedin',
    unipile_account_id: 'unipile-li-1',
    destination: 'https://www.linkedin.com/in/maria-souza',
    linkedin_subtype: 'convite',
    body: 'Oi Maria, vamos nos conectar?',
    ...overrides,
  })
}

type Recorded = Parameters<ChatSendDb['recordChatStepSendResult']>[0]

interface Options {
  conversation?: { unipile_account_id: string; provider_chat_id: string } | Error | null
  messages?: Record<string, unknown>[] | Error
  ingest?: Record<string, string>
  start?: ChatSent | Error | typeof TIMEOUT
  continueChat?: ChatSent | Error
  invite?: { id: string } | Error
  profile?: LinkedInProfile | Error | typeof TIMEOUT
  recordFails?: boolean
}

function setup(options: Options = {}) {
  const calls: string[] = []
  const recorded: Recorded[] = []
  const ingested: IngestChatEventInput[] = []
  const used: Record<string, unknown> = {}

  function result<T>(value: T | Error | typeof TIMEOUT | undefined, fallback: T, signal?: AbortSignal): Promise<T> {
    if (value === TIMEOUT) {
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }
    if (value instanceof Error) return Promise.reject(value)
    return Promise.resolve(value ?? fallback)
  }

  const db: ChatSendDb = {
    async chatConversationForSend() {
      calls.push('conversation')
      if (options.conversation instanceof Error) throw options.conversation
      return options.conversation ?? null
    },
    async ingestChatEvent(input) {
      ingested.push(input)
      return { outcome: options.ingest?.[String(input.payload.id)] ?? 'unrelated', interaction_id: null, send_id: null }
    },
    async recordChatStepSendResult(input) {
      if (options.recordFails) throw new Error('banco fora')
      recorded.push(input)
    },
  }
  const unipile: UnipileChat = {
    async startChat(account, input, { signal }) {
      calls.push('startChat')
      used.start = { account, ...input }
      return await result(options.start, { chat_id: 'chat-1', message_id: 'msg-1' }, signal)
    },
    async sendChatMessage(account, chatId, text, { signal }) {
      calls.push('sendChatMessage')
      used.continue = { account, chatId, text }
      return await result(options.continueChat, { chat_id: chatId, message_id: 'msg-2' }, signal)
    },
    async sendInvitation(account, input, { signal }) {
      calls.push('sendInvitation')
      used.invite = { account, ...input }
      return await result(options.invite, { id: 'inv-1' }, signal)
    },
    async getLinkedInProfile(account, identifier, { signal }) {
      calls.push('getLinkedInProfile')
      used.profile = { account, identifier }
      return await result(options.profile, { providerId: 'ACoAAMaria', firstDegree: false }, signal)
    },
    async listChatMessages(account, chatId) {
      calls.push('listChatMessages')
      used.list = { account, chatId }
      if (options.messages instanceof Error) throw options.messages
      return options.messages ?? []
    },
  }

  const send = (release: ChatReleaseResult | Error, sendTimeoutMs = 1000) =>
    sendChatStep({ db, unipile, sendTimeoutMs }, {
      sendId: SEND,
      userId: TITULAR,
      release: async () => {
        calls.push('release')
        if (release instanceof Error) throw release
        return release
      },
    })
  return { send, calls, recorded, ingested, used }
}

Deno.test('o telefone vira o id de usuário do WhatsApp: só dígitos e @s.whatsapp.net', () => {
  assertEquals(toWhatsAppUserId('+5511988887777'), '5511988887777@s.whatsapp.net')
  assertEquals(toWhatsAppUserId('+55 (11) 98888-7777'), '5511988887777@s.whatsapp.net')
  assertEquals(toWhatsAppUserId('123'), null)
  assertEquals(toWhatsAppUserId('+5511988887777123456'), null)
})

Deno.test('o identificador público vem do endereço do perfil /in/', () => {
  assertEquals(linkedInIdentifier('https://www.linkedin.com/in/maria-souza'), 'maria-souza')
  assertEquals(linkedInIdentifier('https://www.linkedin.com/in/maria-souza/'), 'maria-souza')
  assertEquals(linkedInIdentifier('https://www.linkedin.com/company/empresa'), null)
  assertEquals(linkedInIdentifier('maria'), null)
})

Deno.test('a cadência do Nan: convite com nota e, se já é conexão, mensagem', () => {
  assertEquals(decideLinkedInAction('convite', false), { action: 'convite' })
  assertEquals(decideLinkedInAction('convite', null), { action: 'convite' })
  assertEquals(decideLinkedInAction('convite', true), { action: 'mensagem' })
  assertEquals(decideLinkedInAction('mensagem', true), { action: 'mensagem' })
  assertEquals(decideLinkedInAction('mensagem', false), { blocked: 'linkedin_not_connected' })
  assertEquals(decideLinkedInAction('mensagem', null), { action: 'mensagem' })
  assertEquals(decideLinkedInAction('inmail', false), { blocked: 'linkedin_inmail_not_supported' })
  assertEquals(decideLinkedInAction('inmail', true), { blocked: 'linkedin_inmail_not_supported' })
})

Deno.test('a nota é medida em caracteres, não em bytes', () => {
  assertEquals(characterCount('olá 👋'), 5)
})

// ---------- WhatsApp ----------

Deno.test('WhatsApp: a primeira mensagem abre a conversa com o número do Destino e grava a conversa', async () => {
  const t = setup()
  const result = await t.send(released())
  assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
  assertEquals(t.used.start, { account: 'unipile-wa-1', userId: '5511988887777@s.whatsapp.net', text: 'Olá, Maria.' })
  assertEquals(t.recorded, [{
    sendId: SEND,
    outcome: 'sent',
    providerChatId: 'chat-1',
    providerMessageId: 'msg-1',
    providerUserId: '5511988887777@s.whatsapp.net',
    linkedinAction: null,
    error: null,
    retryAfterSeconds: null,
  }])
})

Deno.test('WhatsApp: uma conversa já aberta com o Contato é reutilizada, sem abrir outra', async () => {
  const t = setup()
  await t.send(released({ provider_chat_id: 'chat-9' }))
  assertEquals(t.calls.includes('startChat'), false)
  assertEquals(t.used.continue, { account: 'unipile-wa-1', chatId: 'chat-9', text: 'Olá, Maria.' })
  assertEquals(t.recorded[0].providerChatId, 'chat-9')
  assertEquals(t.recorded[0].providerMessageId, 'msg-2')
})

Deno.test('WhatsApp: timeout deixa o envio incerto, nunca falho', async () => {
  const t = setup({ start: TIMEOUT })
  const result = await t.send(released(), 10)
  assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true, reason: 'timeout' })
  assertEquals(t.recorded[0].outcome, 'uncertain')
  assertEquals(t.recorded[0].error, 'timeout')
})

Deno.test('WhatsApp: 2xx sem id nenhum é incerto, não enviado', async () => {
  const t = setup({ start: new UnipileUnreadableResponse() })
  const result = await t.send(released())
  assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true, reason: 'unreadable_response' })
})

Deno.test('WhatsApp: falha de rede é incerta', async () => {
  const t = setup({ start: new TypeError('fetch failed') })
  const result = await t.send(released())
  assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true, reason: 'network' })
})

Deno.test('WhatsApp: 429 e 503 dizem que nada saiu, e o prazo do provedor vai para o banco', async () => {
  const limit = setup({ start: new UnipileRequestError(429, 30) })
  assertEquals(await limit.send(released()), { kind: 'attempted', outcome: 'failed', recorded: true, reason: 'HTTP 429' })
  assertEquals(limit.recorded[0].retryAfterSeconds, 30)
  const down = setup({ start: new UnipileRequestError(503) })
  assertEquals((await down.send(released())).kind, 'attempted')
  assertEquals(down.recorded[0].outcome, 'failed')
})

Deno.test('WhatsApp: 500, 502 e 504 deixam dúvida se saiu, então ficam incertos', async () => {
  for (const status of [500, 502, 504, 408]) {
    const t = setup({ start: new UnipileRequestError(status) })
    await t.send(released())
    assertEquals(t.recorded[0].outcome, 'uncertain', `HTTP ${status}`)
  }
})

Deno.test('WhatsApp: uma recusa 4xx é impedimento com o motivo, sem nova tentativa', async () => {
  const t = setup({ start: new UnipileChatRequestError(400, null, 'recipient_not_found') })
  const result = await t.send(released())
  assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason: 'recipient_not_found' })
  assertEquals(t.recorded[0].outcome, 'blocked')
  const generic = setup({ start: new UnipileRequestError(403) })
  await generic.send(released())
  assertEquals(generic.recorded[0].error, 'http_403')
})

Deno.test('WhatsApp: um telefone fora do formato é impedimento antes de falar com a Unipile', async () => {
  const t = setup()
  await t.send(released({ destination: '123' }))
  assertEquals(t.calls.includes('startChat'), false)
  assertEquals(t.recorded[0].outcome, 'blocked')
  assertEquals(t.recorded[0].error, 'invalid_phone')
})

Deno.test('se o resultado não pôde ser gravado, a função diz que o envio precisa ser conferido', async () => {
  const t = setup({ recordFails: true })
  assertEquals(await t.send(released()), { kind: 'attempted', outcome: 'sent', recorded: false })
})

// ---------- Liberação e conferência da conversa ----------

Deno.test('o banco bloqueou: nada é enviado', async () => {
  const t = setup()
  const result = await t.send({ outcome: 'sender_not_ready', send_id: SEND })
  assertEquals(result, { kind: 'blocked', outcome: 'sender_not_ready' })
  assertEquals(t.calls, ['conversation', 'release'])
  assertEquals(t.recorded, [])
})

Deno.test('um Envio que não existe e uma falha do banco ao liberar não enviam nada', async () => {
  assertEquals(await setup().send(Object.assign(new Error('x'), { code: 'P0002' })), { kind: 'not_found' })
  assertEquals(await setup().send(new Error('banco fora')), { kind: 'release_error' })
})

Deno.test('antes de liberar, a conversa já aberta é conferida e cada mensagem passa pela ingestão', async () => {
  const t = setup({
    conversation: { unipile_account_id: 'unipile-wa-1', provider_chat_id: 'chat-1' },
    messages: [{ id: 'm1', text: 'Oi' }, { id: 'm2', chat_id: 'chat-1', text: 'Tudo bem?' }, { text: 'sem id' }],
  })
  const result = await t.send(released({ provider_chat_id: 'chat-1' }))
  assertEquals(result.kind, 'attempted')
  assertEquals(t.calls.slice(0, 2), ['conversation', 'listChatMessages'])
  assertEquals(t.ingested.map((i) => i.eventId), ['chat-check:unipile-wa-1:chat-1:m1', 'chat-check:unipile-wa-1:chat-1:m2'])
  assertEquals(t.ingested[0].payload.chat_id, 'chat-1')
  assertEquals(t.ingested[0].eventType, 'message.new')
})

Deno.test('uma resposta achada na conferência pausa tudo e o passo não sai', async () => {
  const t = setup({
    conversation: { unipile_account_id: 'unipile-wa-1', provider_chat_id: 'chat-1' },
    messages: [{ id: 'm1' }, { id: 'm2' }],
    ingest: { m2: 'reply' },
  })
  const result = await t.send(released({ provider_chat_id: 'chat-1' }))
  assertEquals(result, { kind: 'blocked', outcome: 'reply_found' })
  assertEquals(t.calls.includes('release'), false)
})

Deno.test('se a conversa não pôde ser conferida, o passo não sai', async () => {
  const listing = setup({
    conversation: { unipile_account_id: 'unipile-wa-1', provider_chat_id: 'chat-1' },
    messages: new UnipileRequestError(500),
  })
  assertEquals(await listing.send(released()), { kind: 'blocked', outcome: 'thread_check_failed' })
  const lookup = setup({ conversation: new Error('banco fora') })
  assertEquals(await lookup.send(released()), { kind: 'blocked', outcome: 'thread_check_failed' })
})

Deno.test('uma conversa que sumiu da Unipile (404) não tem resposta a conferir', async () => {
  const t = setup({
    conversation: { unipile_account_id: 'unipile-wa-1', provider_chat_id: 'chat-1' },
    messages: new UnipileRequestError(404),
  })
  assertEquals((await t.send(released())).kind, 'attempted')
})

// ---------- LinkedIn ----------

Deno.test('LinkedIn: quem ainda não é conexão recebe um convite com a nota do passo', async () => {
  const t = setup()
  const result = await t.send(linkedin())
  assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
  assertEquals(t.used.profile, { account: 'unipile-li-1', identifier: 'maria-souza' })
  assertEquals(t.used.invite, { account: 'unipile-li-1', userId: 'ACoAAMaria', message: 'Oi Maria, vamos nos conectar?' })
  assertEquals(t.calls.includes('startChat'), false)
  assertEquals(t.recorded[0].linkedinAction, 'convite')
  assertEquals(t.recorded[0].providerUserId, 'ACoAAMaria')
  assertEquals(t.recorded[0].providerMessageId, 'inv-1')
})

Deno.test('LinkedIn: quem já é conexão recebe mensagem, mesmo num passo de convite', async () => {
  const t = setup({ profile: { providerId: 'ACoAAMaria', firstDegree: true } })
  await t.send(linkedin())
  assertEquals(t.calls.includes('sendInvitation'), false)
  assertEquals(t.used.start, { account: 'unipile-li-1', userId: 'ACoAAMaria', text: 'Oi Maria, vamos nos conectar?' })
  assertEquals(t.recorded[0].linkedinAction, 'mensagem')
  assertEquals(t.recorded[0].providerChatId, 'chat-1')
})

Deno.test('LinkedIn: a conversa que já existe com a conexão é continuada', async () => {
  const t = setup({ profile: { providerId: 'ACoAAMaria', firstDegree: true } })
  await t.send(linkedin({ linkedin_subtype: 'mensagem', provider_chat_id: 'chat-li' }))
  assertEquals(t.calls.includes('startChat'), false)
  assertEquals(t.used.continue, { account: 'unipile-li-1', chatId: 'chat-li', text: 'Oi Maria, vamos nos conectar?' })
})

Deno.test('LinkedIn: mensagem a quem não é conexão é impedimento, nada é enviado', async () => {
  const t = setup({ profile: { providerId: 'ACoAAMaria', firstDegree: false } })
  const result = await t.send(linkedin({ linkedin_subtype: 'mensagem' }))
  assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason: 'linkedin_not_connected' })
  assertEquals(t.calls.includes('startChat') || t.calls.includes('sendInvitation'), false)
  assertEquals(t.recorded[0].providerUserId, 'ACoAAMaria')
})

Deno.test('LinkedIn: com a relação desconhecida, vale a intenção do passo e o provedor decide', async () => {
  const t = setup({ profile: { providerId: 'ACoAAMaria', firstDegree: null } })
  await t.send(linkedin({ linkedin_subtype: 'mensagem' }))
  assertEquals(t.calls.includes('startChat'), true)
})

Deno.test('LinkedIn: a nota maior que o limite nunca é cortada: é impedimento e nada sai', async () => {
  const t = setup()
  const result = await t.send(linkedin({ body: 'x'.repeat(301) }))
  assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason: 'invite_note_too_long' })
  assertEquals(t.calls.includes('sendInvitation'), false)
  const exact = setup()
  await exact.send(linkedin({ body: 'x'.repeat(300) }))
  assertEquals(exact.calls.includes('sendInvitation'), true)
})

Deno.test('LinkedIn: o convite com nota leva a nota no pedido à Unipile', async () => {
  const t = setup()
  await t.send(linkedin({ body: 'Oi Maria, vamos nos conectar?' }))
  assertEquals(t.used.invite, { account: 'unipile-li-1', userId: 'ACoAAMaria', message: 'Oi Maria, vamos nos conectar?' })
})

Deno.test('LinkedIn: o convite sem nota sai sem o campo message, com o corpo vazio ou só de espaços', async () => {
  for (const body of ['', '   ', ' \n\t ']) {
    const t = setup()
    const result = await t.send(linkedin({ body }))
    assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
    assertEquals(t.used.invite, { account: 'unipile-li-1', userId: 'ACoAAMaria' })
    assertEquals(Object.hasOwn(t.used.invite as object, 'message'), false)
    assertEquals(t.recorded[0].linkedinAction, 'convite')
    assertEquals(t.recorded[0].providerMessageId, 'inv-1')
  }
})

Deno.test('LinkedIn: o convite sem nota continua barrado quando um convite já saiu para o mesmo perfil', async () => {
  const t = setup()
  const result = await t.send(linkedin({ body: '', invite_sent: true }))
  assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason: 'invite_already_sent' })
  assertEquals(t.calls.includes('sendInvitation'), false)
})

Deno.test('LinkedIn: um segundo convite ao mesmo perfil não sai, mas uma conexão nova recebe mensagem', async () => {
  const again = setup()
  const result = await again.send(linkedin({ invite_sent: true }))
  assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason: 'invite_already_sent' })
  assertEquals(again.calls.includes('sendInvitation'), false)
  const accepted = setup({ profile: { providerId: 'ACoAAMaria', firstDegree: true } })
  await accepted.send(linkedin({ linkedin_subtype: 'mensagem', invite_sent: true }))
  assertEquals(accepted.calls.includes('startChat'), true)
})

Deno.test('LinkedIn: InMail é recusado para conexão e para quem não é, sem falar com a Unipile', async () => {
  for (const [relacao, firstDegree] of [['quem não é conexão', false], ['conexão', true]] as const) {
    const envio = setup({ profile: { providerId: 'ACoAAMaria', firstDegree } })
    const result = await envio.send(linkedin({ linkedin_subtype: 'inmail' }))
    assertEquals(result, {
      kind: 'attempted',
      outcome: 'blocked',
      recorded: true,
      reason: 'linkedin_inmail_not_supported',
    }, relacao)
    assertEquals(envio.calls.includes('getLinkedInProfile'), false)
    assertEquals(envio.calls.includes('startChat'), false)
    assertEquals(envio.calls.includes('sendInvitation'), false)
    assertEquals(envio.recorded[0].outcome, 'blocked')
    assertEquals(envio.recorded[0].error, 'linkedin_inmail_not_supported')
  }
})

Deno.test('LinkedIn: sem crédito, assinatura ou elegibilidade o convite vira impedimento com o motivo', async () => {
  for (const reason of ['insufficient_credits', 'subscription_required', 'provider_limit_reached']) {
    const t = setup({ invite: new UnipileChatRequestError(403, null, reason) })
    const result = await t.send(linkedin())
    assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason })
    assertEquals(t.recorded[0].linkedinAction, 'convite')
  }
})

Deno.test('LinkedIn: o convite com timeout ou resposta ilegível fica incerto', async () => {
  const slow = setup({ invite: new TypeError('fetch failed') })
  await slow.send(linkedin())
  assertEquals(slow.recorded[0].outcome, 'uncertain')
  assertEquals(slow.recorded[0].linkedinAction, 'convite')
  const unreadable = setup({ invite: new UnipileUnreadableResponse() })
  await unreadable.send(linkedin())
  assertEquals(unreadable.recorded[0].error, 'unreadable_response')
})

Deno.test('LinkedIn: perfil que não existe é impedimento; falha ao achar o perfil não gasta nada e pode repetir', async () => {
  const missing = setup({ profile: new UnipileRequestError(404) })
  assertEquals((await missing.send(linkedin())).kind, 'attempted')
  assertEquals(missing.recorded[0].outcome, 'blocked')
  assertEquals(missing.recorded[0].error, 'linkedin_profile_not_found')

  const down = setup({ profile: new UnipileRequestError(500) })
  await down.send(linkedin())
  assertEquals(down.recorded[0].outcome, 'failed')
  assertEquals(down.calls.includes('sendInvitation'), false)

  const slow = setup({ profile: TIMEOUT })
  await slow.send(linkedin(), 10)
  assertEquals(slow.recorded[0].outcome, 'failed')
  assertEquals(slow.recorded[0].error, 'profile_lookup_timeout')

  const refused = setup({ profile: new UnipileChatRequestError(403, null, 'subscription_required') })
  await refused.send(linkedin())
  assertEquals(refused.recorded[0].outcome, 'blocked')
  assertEquals(refused.recorded[0].error, 'subscription_required')
})

Deno.test('LinkedIn: um endereço que não é perfil /in/ é impedimento antes de falar com a Unipile', async () => {
  const t = setup()
  await t.send(linkedin({ destination: 'https://www.linkedin.com/company/x' }))
  assertEquals(t.calls.includes('getLinkedInProfile'), false)
  assertEquals(t.recorded[0].error, 'linkedin_profile_invalid')
})
