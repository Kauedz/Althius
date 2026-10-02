import { assertEquals } from 'jsr:@std/assert@1'
import type { ReleaseResult, UnipileMail } from '../_shared/send-step.ts'
import type { ChatReleaseResult, UnipileChat } from '../_shared/send-chat-step.ts'
import { type ChatRunnerDb, createHandler, type RunnerDb } from './handler.ts'

// canais-11: o Executor pausa a Sequência quando um passo vencido é barrado porque a Conta remetente caiu.

const TOKEN = 'b'.repeat(64)
const TITULAR = '50000000-0000-0000-0000-000000000011'
const SEND_EMAIL = '60000000-0000-0000-0000-000000000011'
const SEND_CHAT = '60000000-0000-0000-0000-000000000012'

function setup(emailRelease: ReleaseResult, chatRelease: ChatReleaseResult, hold: boolean | Error = true) {
  const held: string[] = []
  const sent: string[] = []
  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claimDueSends: async () => [{ send_id: SEND_EMAIL, owner_user_id: TITULAR }],
    releaseDueSend: async () => emailRelease,
    conversationForSend: async () => null,
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    recordStepSendResult: async () => {},
    claimSenderReconciliations: async () => [],
    conversationsToReconcile: async () => [],
    recordReconciliationProgress: async () => true,
    finishSenderReconciliation: async () => true,
  }
  const chatDb: ChatRunnerDb = {
    claimDueChatSends: async () => [{ send_id: SEND_CHAT, owner_user_id: TITULAR }],
    releaseDueChatSend: async () => chatRelease,
    chatsToReconcile: async () => [],
    chatConversationForSend: async () => null,
    ingestChatEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null }),
    recordChatStepSendResult: async () => {},
  }
  const unipile: UnipileMail = {
    sendEmail: async () => {
      sent.push('email')
      return { id: 'e', message_id: null }
    },
    getEmail: async () => ({}),
    listThreadEmails: async () => [],
    listEmailSenders: async () => [],
  }
  const chat: UnipileChat = {
    startChat: async () => {
      sent.push('chat')
      return { chat_id: 'c', message_id: 'm' }
    },
    sendChatMessage: async () => ({ chat_id: 'c', message_id: 'm' }),
    sendInvitation: async () => ({ id: 'i' }),
    getLinkedInProfile: async () => ({ providerId: 'p', firstDegree: null }),
    listChatMessages: async () => [],
  }
  const logs: Record<string, unknown>[] = []
  const work: Promise<unknown>[] = []
  const handle = createHandler({
    db,
    unipile,
    chat: { db: chatDb, unipile: chat },
    holdForUnreadySend: async (sendId) => {
      held.push(sendId)
      if (hold instanceof Error) throw hold
      return hold
    },
    waitUntil: (w) => work.push(w),
    log: (fields) => logs.push(fields),
  })
  async function run() {
    const res = await handle(new Request('https://functions.test/sequence-runner', {
      method: 'POST',
      headers: { 'x-runner-token': TOKEN },
    }))
    await Promise.all(work)
    return res
  }
  return { run, held, sent, logs }
}

Deno.test('passo de e-mail e de conversa barrados por falta de Conta remetente pedem a pausa da Sequência', async () => {
  const { run, held, sent, logs } = setup(
    { outcome: 'sender_not_ready', send_id: SEND_EMAIL },
    { outcome: 'sender_not_ready', send_id: SEND_CHAT },
  )
  assertEquals((await run()).status, 202)
  assertEquals(held, [SEND_EMAIL, SEND_CHAT])
  assertEquals(sent, [])
  assertEquals(logs.filter((l) => l.outcome === 'sequence_held').length, 2)
})

Deno.test('outros bloqueios não pausam nada', async () => {
  const { run, held } = setup(
    { outcome: 'outside_window', send_id: SEND_EMAIL },
    { outcome: 'owner_not_responsible', send_id: SEND_CHAT },
  )
  await run()
  assertEquals(held, [])
})

Deno.test('uma falha ao pausar só fica no log; a rodada segue', async () => {
  const { run, held, logs } = setup(
    { outcome: 'sender_not_ready', send_id: SEND_EMAIL },
    { outcome: 'sender_not_ready', send_id: SEND_CHAT },
    new Error('banco fora'),
  )
  await run()
  assertEquals(held, [SEND_EMAIL, SEND_CHAT])
  assertEquals(logs.filter((l) => l.outcome === 'hold_failed').length, 2)
})
