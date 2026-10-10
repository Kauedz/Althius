// O ritmo de envio no Executor (ritmo-de-envio): uma pausa pequena e aleatória entre dois envios da mesma execução, a
// reserva renovada antes de cada passo que ainda espera a vez (um lote lento de LinkedIn passa dos 2 minutos), e os
// motivos novos de adiamento (intervalo da Conta, limite do dia e da semana), que não enviam nada. O banco decide o
// ritmo da Conta; aqui só se prova que o Executor obedece e não atropela.
import { assertEquals } from 'jsr:@std/assert@1'
import type { ChatReleaseResult, ChatSent, LinkedInProfile, ReleasedChatSend, UnipileChat } from '../_shared/send-chat-step.ts'
import type { ReleaseResult, ReleasedSend, UnipileMail } from '../_shared/send-step.ts'
import { type ChatRunnerDb, createHandler, type Deps, type DueSend, type RunnerDb } from './handler.ts'

const TOKEN = 'a'.repeat(64)
const TITULAR = '50000000-0000-0000-0000-000000000001'
const C1 = '60000000-0000-0000-0000-0000000000c1'
const C2 = '60000000-0000-0000-0000-0000000000c2'
const C3 = '60000000-0000-0000-0000-0000000000c3'
const E1 = '60000000-0000-0000-0000-0000000000e1'
const E2 = '60000000-0000-0000-0000-0000000000e2'

function linkedin(sendId: string): ReleasedChatSend {
  return {
    outcome: 'released',
    send_id: sendId,
    channel: 'linkedin',
    unipile_account_id: 'unipile-li-1',
    destination: 'https://www.linkedin.com/in/maria-souza',
    contact_name: 'Maria Souza',
    body: 'Olá, Maria.',
    linkedin_subtype: 'mensagem',
    provider_chat_id: 'chat-1',
    provider_user_id: 'ACoAA',
    invite_sent: false,
    invite_note_limit: 300,
  }
}

function email(sendId: string): ReleasedSend {
  return {
    outcome: 'released',
    send_id: sendId,
    unipile_account_id: 'unipile-em-1',
    destination: 'maria@empresa.test',
    contact_name: 'Maria Souza',
    subject: 'Oi',
    body: 'Olá, Maria.',
    reply_to_message_id: null,
    tracking_header_name: 'X-Althius-Envio',
    tracking_header_value: sendId,
  }
}

interface Options {
  dueEmails?: DueSend[]
  dueChats?: DueSend[]
  chatReleases?: Record<string, ChatReleaseResult>
  emailReleases?: Record<string, ReleaseResult>
  renewFails?: boolean
}

function setup(options: Options = {}) {
  const order: string[] = []
  const renewed: string[][] = []
  const sent: string[] = []

  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claimDueSends: async () => {
      order.push('claim-email')
      return options.dueEmails ?? []
    },
    releaseDueSend: async (sendId) => {
      order.push(`release-email:${sendId}`)
      return options.emailReleases?.[sendId] ?? email(sendId)
    },
    renewDueClaims: async (sendIds) => {
      order.push(`renew:${sendIds.join(',')}`)
      renewed.push(sendIds)
      if (options.renewFails) throw new Error('banco fora')
      return sendIds.length
    },
    conversationForSend: async () => null,
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    recordStepSendResult: async () => {},
    claimSenderReconciliations: async () => [],
    conversationsToReconcile: async () => [],
    recordReconciliationProgress: async () => true,
    finishSenderReconciliation: async () => true,
  }
  const chatDb: ChatRunnerDb = {
    chatConversationForSend: async () => null,
    ingestChatEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null }),
    recordChatStepSendResult: async () => {},
    claimDueChatSends: async () => {
      order.push('claim-chat')
      return options.dueChats ?? []
    },
    releaseDueChatSend: async (sendId) => {
      order.push(`release-chat:${sendId}`)
      return options.chatReleases?.[sendId] ?? linkedin(sendId)
    },
    chatsToReconcile: async () => [],
  }
  const mail: UnipileMail = {
    getEmail: async () => ({}),
    listThreadEmails: async () => [],
    listEmailSenders: async () => [],
    sendEmail: async () => {
      sent.push('email')
      return { id: 'x', message_id: null }
    },
  }
  const chat: UnipileChat = {
    startChat: async (): Promise<ChatSent> => ({ chat_id: 'chat-1', message_id: 'msg-1' }),
    sendChatMessage: async (): Promise<ChatSent> => {
      sent.push('chat')
      return { chat_id: 'chat-1', message_id: 'msg-2' }
    },
    sendInvitation: async () => ({ id: 'inv-1' }),
    getLinkedInProfile: async (): Promise<LinkedInProfile> => ({ providerId: 'ACoAA', firstDegree: true }),
    listChatMessages: async () => [],
  }
  return { db, chatDb, mail, chat, order, renewed, sent }
}

function runner(parts: ReturnType<typeof setup>, options: Partial<Deps> = {}) {
  const work: Promise<unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    db: parts.db,
    unipile: parts.mail,
    chat: { db: parts.chatDb, unipile: parts.chat },
    waitUntil: (promise) => work.push(promise),
    log: (fields) => logs.push(fields),
    ...options,
  })
  const call = () =>
    handle(new Request('https://functions.test/sequence-runner', { method: 'POST', headers: { 'x-runner-token': TOKEN } }))
  return { call, finished: () => Promise.all(work), logs }
}

/** Uma pausa que só anota o que lhe pediram, na ordem em que o Executor chamou o banco e a Unipile. */
function pauseInto(parts: ReturnType<typeof setup>) {
  const pauses: number[] = []
  return {
    pauses,
    pause: async (ms: number) => {
      pauses.push(ms)
      parts.order.push(`pause:${ms}`)
    },
  }
}

Deno.test('entre dois envios da mesma execução há uma pausa aleatória dentro da faixa, e nunca antes do primeiro nem depois do último', async () => {
  const parts = setup({
    dueEmails: [{ send_id: E1, owner_user_id: TITULAR }],
    dueChats: [{ send_id: C1, owner_user_id: TITULAR }, { send_id: C2, owner_user_id: TITULAR }],
  })
  const { pause, pauses } = pauseInto(parts)
  const { call, finished } = runner(parts, { pauseBetweenSendsMs: { min: 1000, max: 4000 }, pause, random: () => 0.5 })
  await call()
  await finished()
  assertEquals(pauses, [2500, 2500])
  assertEquals(parts.order, [
    'claim-email',
    `release-email:${E1}`,
    'claim-chat',
    'pause:2500',
    `release-chat:${C1}`,
    'pause:2500',
    `renew:${C2}`,
    `release-chat:${C2}`,
  ])
  assertEquals(parts.sent, ['email', 'chat', 'chat'])
})

Deno.test('a pausa vai de um extremo ao outro da faixa conforme o sorteio', async () => {
  for (const [draw, expected] of [[0, 1000], [0.999, 3997]] as const) {
    const parts = setup({ dueChats: [{ send_id: C1, owner_user_id: TITULAR }, { send_id: C2, owner_user_id: TITULAR }] })
    const { pause, pauses } = pauseInto(parts)
    const { call, finished } = runner(parts, { pauseBetweenSendsMs: { min: 1000, max: 4000 }, pause, random: () => draw })
    await call()
    await finished()
    assertEquals(pauses, [expected])
  }
})

Deno.test('um passo que o banco adiou não gasta pausa: só quem enviou faz o próximo esperar', async () => {
  const parts = setup({
    dueChats: [
      { send_id: C1, owner_user_id: TITULAR },
      { send_id: C2, owner_user_id: TITULAR },
      { send_id: C3, owner_user_id: TITULAR },
    ],
    chatReleases: { [C2]: { outcome: 'rate_limited', send_id: C2 } },
  })
  const { pause, pauses } = pauseInto(parts)
  const { call, finished } = runner(parts, { pauseBetweenSendsMs: { min: 1000, max: 4000 }, pause, random: () => 0.5 })
  await call()
  await finished()
  // Pausa depois do envio de C1; C2 foi adiado, então C3 não espera de novo.
  assertEquals(pauses, [2500])
  assertEquals(parts.sent, ['chat', 'chat'])
})

Deno.test('sem faixa configurada o Executor não pausa, como antes', async () => {
  const parts = setup({ dueChats: [{ send_id: C1, owner_user_id: TITULAR }, { send_id: C2, owner_user_id: TITULAR }] })
  const { pause, pauses } = pauseInto(parts)
  const { call, finished } = runner(parts, { pause })
  await call()
  await finished()
  assertEquals(pauses, [])
})

Deno.test('a reserva dos passos que ainda esperam a vez é renovada antes de cada envio, depois da pausa', async () => {
  const parts = setup({
    dueChats: [
      { send_id: C1, owner_user_id: TITULAR },
      { send_id: C2, owner_user_id: TITULAR },
      { send_id: C3, owner_user_id: TITULAR },
    ],
  })
  const { pause } = pauseInto(parts)
  const { call, finished } = runner(parts, { pauseBetweenSendsMs: { min: 1000, max: 1000 }, pause })
  await call()
  await finished()
  assertEquals(parts.renewed, [[C2, C3], [C3]])
  assertEquals(parts.order, [
    'claim-email',
    'claim-chat',
    `release-chat:${C1}`,
    'pause:1000',
    `renew:${C2},${C3}`,
    `release-chat:${C2}`,
    'pause:1000',
    `renew:${C3}`,
    `release-chat:${C3}`,
  ])
})

Deno.test('o e-mail também renova a reserva do que falta enviar', async () => {
  const parts = setup({ dueEmails: [{ send_id: E1, owner_user_id: TITULAR }, { send_id: E2, owner_user_id: TITULAR }] })
  const { call, finished } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.renewed, [[E2]])
})

Deno.test('se renovar a reserva falha, o envio segue e o motivo vai para o log', async () => {
  const parts = setup({
    dueChats: [{ send_id: C1, owner_user_id: TITULAR }, { send_id: C2, owner_user_id: TITULAR }],
    renewFails: true,
  })
  const { call, finished, logs } = runner(parts)
  await call()
  await finished()
  assertEquals(parts.sent, ['chat', 'chat'])
  assertEquals(logs.find((l) => l.outcome === 'renew_failed'), {
    type: 'runner-chat',
    sendId: C2,
    outcome: 'renew_failed',
    message: 'banco fora',
  })
})

Deno.test('intervalo da Conta, limite do dia e limite da semana não enviam nada e vão para o log como o motivo do adiamento', async () => {
  const parts = setup({
    dueEmails: [{ send_id: E1, owner_user_id: TITULAR }],
    dueChats: [{ send_id: C1, owner_user_id: TITULAR }, { send_id: C2, owner_user_id: TITULAR }],
    emailReleases: { [E1]: { outcome: 'daily_cap', send_id: E1 } },
    chatReleases: {
      [C1]: { outcome: 'rate_limited', send_id: C1 },
      [C2]: { outcome: 'weekly_cap', send_id: C2 },
    },
  })
  const holds: string[] = []
  const { call, finished, logs } = runner(parts, {
    holdForUnreadySend: async (sendId) => {
      holds.push(sendId)
      return true
    },
  })
  await call()
  await finished()
  assertEquals(parts.sent, [])
  assertEquals(holds, [], 'adiar por ritmo nunca pausa a Sequência')
  assertEquals(logs.map((l) => [l.type, l.outcome]), [
    ['runner', 'daily_cap'],
    ['runner-chat', 'rate_limited'],
    ['runner-chat', 'weekly_cap'],
  ])
})
