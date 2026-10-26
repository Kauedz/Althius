// O Executor com WhatsApp e LinkedIn (canais-06 e canais-07): os passos de conversa saem pelo mesmo Executor, um por vez,
// depois dos de e-mail, e a reconciliação de uma Conta remetente de conversa confere os chats dos Envios dela. Sem o
// dublê de conversa, o Executor é o de e-mail (os testes de handler.test.ts continuam valendo).
import { assertEquals } from 'jsr:@std/assert@1'
import type { IngestChatEventInput } from '../_shared/ingest-chat-event.ts'
import type { ChatReleaseResult, ChatSent, LinkedInProfile, ReleasedChatSend, UnipileChat } from '../_shared/send-chat-step.ts'
import { UnipileRequestError } from '../_shared/send-step.ts'
import type { UnipileMail } from '../_shared/send-step.ts'
import {
  type ChatRunnerDb,
  type ChatToReconcile,
  createHandler,
  type Deps,
  type DueSend,
  type RunnerDb,
  type SenderToReconcile,
} from './handler.ts'

const TOKEN = 'a'.repeat(64)
const TITULAR = '50000000-0000-0000-0000-000000000001'
const CHAT_1 = '60000000-0000-0000-0000-0000000000c1'
const CHAT_2 = '60000000-0000-0000-0000-0000000000c2'
const EMAIL_1 = '60000000-0000-0000-0000-0000000000e1'

function whatsapp(sendId: string): ReleasedChatSend {
  return {
    outcome: 'released',
    send_id: sendId,
    channel: 'whatsapp',
    unipile_account_id: 'unipile-wa-1',
    destination: '+5511988887777',
    contact_name: 'Maria Souza',
    body: 'Olá, Maria.',
    linkedin_subtype: null,
    provider_chat_id: null,
    provider_user_id: null,
    invite_sent: false,
    invite_note_limit: 300,
  }
}

interface Options {
  dueChats?: DueSend[]
  dueEmails?: DueSend[]
  releases?: Record<string, ChatReleaseResult | Error>
  accounts?: SenderToReconcile[]
  chats?: Record<string, ChatToReconcile[]>
  messages?: Record<string, Record<string, unknown>[]>
  ingest?: Record<string, string>
  claimFails?: boolean
}

function setup(options: Options = {}) {
  const order: string[] = []
  const recorded: Parameters<ChatRunnerDb['recordChatStepSendResult']>[0][] = []
  const ingested: IngestChatEventInput[] = []
  const progress: string[] = []
  const finished: string[] = []
  const sent: { accountId: string; userId: string; text: string }[] = []
  const progressCursor = new Map<string, string>()

  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claimDueSends: async () => {
      order.push('claim-email')
      return options.dueEmails ?? []
    },
    releaseDueSend: async (sendId) => {
      order.push(`release-email:${sendId}`)
      return { outcome: 'not_due', send_id: sendId }
    },
    conversationForSend: async () => null,
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    recordStepSendResult: async () => {},
    claimSenderReconciliations: async () => options.accounts ?? [],
    conversationsToReconcile: async () => [],
    recordReconciliationProgress: async (_account, _claimedAt, checked) => {
      progress.push(checked.send_id)
      progressCursor.set(_account, checked.send_id)
      return true
    },
    finishSenderReconciliation: async (senderAccountId) => {
      finished.push(senderAccountId)
      return true
    },
  }
  const chatDb: ChatRunnerDb = {
    chatConversationForSend: async () => null,
    ingestChatEvent: async (input) => {
      ingested.push(input)
      return { outcome: options.ingest?.[String(input.payload.id)] ?? 'unrelated', interaction_id: null, send_id: null }
    },
    recordChatStepSendResult: async (input) => {
      recorded.push(input)
    },
    claimDueChatSends: async () => {
      order.push('claim-chat')
      if (options.claimFails) throw new Error('banco fora')
      return options.dueChats ?? []
    },
    releaseDueChatSend: async (sendId) => {
      order.push(`release-chat:${sendId}`)
      const result = options.releases?.[sendId] ?? whatsapp(sendId)
      if (result instanceof Error) throw result
      return result
    },
    chatsToReconcile: async (senderAccountId) => {
      const found = options.chats?.[senderAccountId] ?? []
      const after = progressCursor.get(senderAccountId)
      return found.slice(after ? found.findIndex((c) => c.send_id === after) + 1 : 0)
    },
  }
  const mail: UnipileMail = {
    getEmail: async () => ({}),
    listThreadEmails: async () => [],
    listEmailSenders: async () => [],
    sendEmail: async () => ({ id: 'x', message_id: null }),
  }
  const chat: UnipileChat = {
    startChat: async (accountId, input): Promise<ChatSent> => {
      sent.push({ accountId, userId: input.userId, text: input.text })
      return { chat_id: 'chat-1', message_id: 'msg-1' }
    },
    sendChatMessage: async (accountId, chatId, text): Promise<ChatSent> => {
      sent.push({ accountId, userId: chatId, text })
      return { chat_id: chatId, message_id: 'msg-2' }
    },
    sendInvitation: async () => ({ id: 'inv-1' }),
    getLinkedInProfile: async (): Promise<LinkedInProfile> => ({ providerId: 'ACoAA', firstDegree: false }),
    listChatMessages: async (_account, chatId) => options.messages?.[chatId] ?? [],
  }
  return { db, chatDb, mail, chat, order, recorded, ingested, progress, finished, sent }
}

function runner(parts: ReturnType<typeof setup>, options: Partial<Deps> = {}, withChat = true) {
  const work: Promise<unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    db: parts.db,
    unipile: parts.mail,
    ...(withChat ? { chat: { db: parts.chatDb, unipile: parts.chat } } : {}),
    waitUntil: (promise) => work.push(promise),
    log: (fields) => logs.push(fields),
    ...options,
  })
  const call = () =>
    handle(new Request('https://functions.test/sequence-runner', { method: 'POST', headers: { 'x-runner-token': TOKEN } }))
  return { call, finished: () => Promise.all(work), logs }
}

Deno.test('com o navegador fechado, o passo de WhatsApp vencido sai em nome do titular e o resultado fica gravado', async () => {
  const parts = setup({ dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }] })
  const { call, finished, logs } = runner(parts)
  const res = await call()
  assertEquals(res.status, 202)
  await finished()

  assertEquals(parts.sent, [{ accountId: 'unipile-wa-1', userId: '5511988887777@s.whatsapp.net', text: 'Olá, Maria.' }])
  assertEquals(parts.recorded.map((r) => [r.sendId, r.outcome, r.providerChatId, r.providerMessageId]), [
    [CHAT_1, 'sent', 'chat-1', 'msg-1'],
  ])
  assertEquals(logs, [{ type: 'runner-chat', sendId: CHAT_1, outcome: 'sent' }])
})

Deno.test('os passos de e-mail saem antes dos de conversa, e cada um sai uma vez', async () => {
  const parts = setup({
    dueEmails: [{ send_id: EMAIL_1, owner_user_id: TITULAR }],
    dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }, { send_id: CHAT_2, owner_user_id: TITULAR }],
  })
  const { call, finished } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.order, [
    'claim-email',
    `release-email:${EMAIL_1}`,
    'claim-chat',
    `release-chat:${CHAT_1}`,
    `release-chat:${CHAT_2}`,
  ])
  assertEquals(parts.sent.length, 2)
})

Deno.test('sem o dublê de conversa o Executor é só de e-mail, como antes', async () => {
  const parts = setup({ dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }] })
  const { call, finished } = runner(parts, {}, false)
  await call()
  await finished()
  assertEquals(parts.order, ['claim-email'])
  assertEquals(parts.sent.length, 0)
})

Deno.test('um passo de conversa barrado pelo banco (pausa, janela, canal desligado) não chama a Unipile', async () => {
  const parts = setup({
    dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }, { send_id: CHAT_2, owner_user_id: TITULAR }],
    releases: {
      [CHAT_1]: { outcome: 'sequence_not_active', send_id: CHAT_1 },
      [CHAT_2]: { outcome: 'channel_not_enabled', send_id: CHAT_2 },
    },
  })
  const { call, finished, logs } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.sent.length, 0)
  assertEquals(parts.recorded.length, 0)
  assertEquals(logs.map((l) => l.outcome), ['sequence_not_active', 'channel_not_enabled'])
})

Deno.test('uma falha num passo de conversa não impede os outros, e a falha do banco ao reservar não derruba o e-mail', async () => {
  const some = setup({
    dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }, { send_id: CHAT_2, owner_user_id: TITULAR }],
    releases: { [CHAT_1]: new Error('conexão caiu') },
  })
  const first = runner(some)
  await first.call()
  await first.finished()
  assertEquals(some.recorded.map((r) => r.sendId), [CHAT_2])
  assertEquals(first.logs.map((l) => l.outcome), ['release_error', 'sent'])

  const down = setup({ claimFails: true, dueEmails: [{ send_id: EMAIL_1, owner_user_id: TITULAR }] })
  const second = runner(down)
  await second.call()
  await second.finished()
  assertEquals(down.order, ['claim-email', `release-email:${EMAIL_1}`, 'claim-chat'])
  assertEquals(second.logs.at(-1)?.outcome, 'claim_failed')
})

Deno.test('o motivo de um impedimento do provedor vai para o log e para o banco, sem nova tentativa cega', async () => {
  const parts = setup({ dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }] })
  parts.chat.startChat = () => Promise.reject(new UnipileRequestError(403))
  const { call, finished, logs } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.recorded[0].outcome, 'blocked')
  assertEquals(parts.recorded[0].error, 'http_403')
  assertEquals(logs[0], { type: 'runner-chat', sendId: CHAT_1, outcome: 'blocked', reason: 'http_403' })
})

Deno.test('Contato não selecionado na retomada não chama a Unipile de chat', async () => {
  const parts = setup({
    dueChats: [{ send_id: CHAT_1, owner_user_id: TITULAR }],
    releases: { [CHAT_1]: { outcome: 'contact_paused', send_id: CHAT_1 } },
  })
  const { call, finished, logs } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.sent.length, 0)
  assertEquals(parts.recorded.length, 0)
  assertEquals(logs.map((entry) => entry.outcome), ['contact_paused'])
})

// ---------- Reconciliação depois de uma queda ----------

const ACCOUNT: SenderToReconcile = {
  sender_account_id: 'sender-wa',
  unipile_account_id: 'unipile-wa-1',
  claimed_at: '2026-10-01T12:00:00Z',
}

Deno.test('a Conta de WhatsApp que voltou só é liberada depois de conferidos os chats dos Envios dela', async () => {
  const parts = setup({
    accounts: [ACCOUNT],
    chats: {
      'sender-wa': [
        { send_id: 's1', provider_chat_id: 'chat-a', sent_at: '2026-09-30T10:00:00Z' },
        { send_id: 's2', provider_chat_id: 'chat-b', sent_at: '2026-09-30T11:00:00Z' },
      ],
    },
    messages: { 'chat-a': [{ id: 'm1' }, { id: 'm2' }], 'chat-b': [{ id: 'm3' }] },
    ingest: { m2: 'reply' },
  })
  const { call, finished, logs } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.ingested.map((i) => i.eventId), [
    'chat-check:unipile-wa-1:chat-a:m1',
    'chat-check:unipile-wa-1:chat-a:m2',
    'chat-check:unipile-wa-1:chat-b:m3',
  ])
  assertEquals(parts.progress, ['s2'])
  assertEquals(parts.finished, ['sender-wa'])
  assertEquals(logs.find((l) => l.type === 'reconcile'), {
    type: 'reconcile',
    senderAccountId: 'sender-wa',
    checked: 2,
    replies: 1,
    outcome: 'ready',
  })
})

Deno.test('se um chat não pôde ser conferido, a Conta continua bloqueada para a próxima rodada', async () => {
  const parts = setup({
    accounts: [ACCOUNT],
    chats: { 'sender-wa': [{ send_id: 's1', provider_chat_id: 'chat-a', sent_at: '2026-09-30T10:00:00Z' }] },
  })
  parts.chat.listChatMessages = () => Promise.reject(new UnipileRequestError(500))
  const { call, finished, logs } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.finished, [])
  assertEquals(logs.find((l) => l.type === 'reconcile')?.outcome, 'check_failed')
})

Deno.test('uma Conta sem chats a conferir é liberada, como a de e-mail', async () => {
  const parts = setup({ accounts: [ACCOUNT] })
  const { call, finished } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.finished, ['sender-wa'])
})
