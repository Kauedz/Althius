// Bug C (fix-v1-email-whatsapp): um passo de WhatsApp cujo Destino é o número da própria Conta remetente não sai. A Unipile v1
// aceita a mensagem e ela cai no chat "Você": fica `sent` sem ninguém ter recebido nada. O núcleo recusa ANTES de chamar a
// Unipile, com um motivo claro. O número da conta vem do banco (own_provider_id); sem ele, o envio segue como sempre.
import { assertEquals } from 'jsr:@std/assert@1'
import { type ChatSendDb, type ReleasedChatSend, sendChatStep, type UnipileChat } from './send-chat-step.ts'

const SEND = '60000000-0000-0000-0000-000000000001'
const TITULAR = '50000000-0000-0000-0000-000000000001'

const released = (overrides: Partial<ReleasedChatSend> = {}): ReleasedChatSend => ({
  outcome: 'released',
  send_id: SEND,
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
  ...overrides,
})

function setup(own: string | null | Error | 'sem-leitura') {
  const calls: string[] = []
  const recorded: Parameters<ChatSendDb['recordChatStepSendResult']>[0][] = []
  const db: ChatSendDb = {
    chatConversationForSend: () => Promise.resolve(null),
    ingestChatEvent: () => Promise.resolve({ outcome: 'unrelated', interaction_id: null, send_id: null }),
    recordChatStepSendResult: (input) => {
      recorded.push(input)
      return Promise.resolve()
    },
    ...(own === 'sem-leitura' ? {} : {
      ownProviderId: (account: string) => {
        calls.push(`ownProviderId:${account}`)
        return own instanceof Error ? Promise.reject(own) : Promise.resolve(own)
      },
    }),
  }
  const unipile: UnipileChat = {
    startChat: () => {
      calls.push('startChat')
      return Promise.resolve({ chat_id: 'chat-1', message_id: 'msg-1' })
    },
    sendChatMessage: () => {
      calls.push('sendChatMessage')
      return Promise.resolve({ chat_id: 'chat-1', message_id: 'msg-2' })
    },
    sendInvitation: () => Promise.resolve({ id: 'inv' }),
    getLinkedInProfile: () => Promise.resolve({ providerId: 'x', firstDegree: false }),
    listChatMessages: () => Promise.resolve([]),
  }
  const send = (release: ReleasedChatSend) =>
    sendChatStep({ db, unipile, sendTimeoutMs: 1000 }, { sendId: SEND, userId: TITULAR, release: () => Promise.resolve(release) })
  return { send, calls, recorded }
}

Deno.test('WhatsApp: o Destino igual ao número da própria conta é impedimento, sem falar com a Unipile', async () => {
  const t = setup('5511988887777@s.whatsapp.net')
  const result = await t.send(released())
  assertEquals(result, { kind: 'attempted', outcome: 'blocked', recorded: true, reason: 'destination_is_sender_account' })
  assertEquals(t.recorded[0].outcome, 'blocked')
  assertEquals(t.recorded[0].error, 'destination_is_sender_account')
  assertEquals(t.calls.includes('startChat') || t.calls.includes('sendChatMessage'), false)
})

Deno.test('WhatsApp: compara só os dígitos, com ou sem + e formatação, e também numa conversa já aberta', async () => {
  const t = setup('5511988887777@s.whatsapp.net')
  await t.send(released({ destination: '+55 (11) 98888-7777', provider_chat_id: 'chat-9' }))
  assertEquals(t.recorded[0].error, 'destination_is_sender_account')
  assertEquals(t.calls.includes('sendChatMessage'), false)
})

Deno.test('WhatsApp: outro número, número desconhecido ou leitura que falha não impedem o envio', async () => {
  for (const own of ['5511900000000@s.whatsapp.net', null, new Error('banco fora'), 'sem-leitura'] as const) {
    const t = setup(own)
    const result = await t.send(released())
    assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
    assertEquals(t.calls.includes('startChat'), true)
  }
})

Deno.test('LinkedIn não passa por essa regra', async () => {
  const t = setup('5511988887777@s.whatsapp.net')
  await t.send(released({
    channel: 'linkedin',
    unipile_account_id: 'unipile-li-1',
    destination: 'https://www.linkedin.com/in/maria-souza',
    linkedin_subtype: 'mensagem',
  }))
  assertEquals(t.calls.some((call) => call.startsWith('ownProviderId')), false)
})
