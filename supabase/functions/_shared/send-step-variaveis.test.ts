import { assertEquals } from 'jsr:@std/assert@1'
import {
  type ChatReleaseResult,
  type ChatSendDb,
  sendChatStep,
  type UnipileChat,
} from './send-chat-step.ts'
import { type ReleasedSend, sendStep, type SendStepDb, type UnipileMail } from './send-step.ts'

const SEND = '60000000-0000-0000-0000-000000000106'
const TITULAR = '50000000-0000-0000-0000-000000000106'

function liberado(body: string, subject = 'Assunto'): ReleasedSend {
  return {
    outcome: 'released',
    send_id: SEND,
    unipile_account_id: 'unipile-google-106',
    destination: 'maria@empresa.test',
    contact_name: 'Maria',
    subject,
    body,
    reply_to_message_id: null,
    tracking_header_name: 'X-Althius-Envio',
    tracking_header_value: SEND,
  }
}

function liberadoChat(body: string): ChatReleaseResult {
  return {
    outcome: 'released',
    send_id: SEND,
    channel: 'linkedin',
    unipile_account_id: 'unipile-li-106',
    destination: 'https://linkedin.com/in/maria',
    contact_name: 'Maria',
    body,
    linkedin_subtype: 'mensagem',
    provider_chat_id: 'chat-106',
    provider_user_id: 'user-106',
    invite_sent: false,
    invite_note_limit: 300,
  }
}

function email() {
  const gravados: Parameters<SendStepDb['recordStepSendResult']>[0][] = []
  const enviados: Parameters<UnipileMail['sendEmail']>[1][] = []
  const db: SendStepDb = {
    conversationForSend: () => Promise.resolve(null),
    ingestEmailEvent: () => Promise.reject(new Error('não usado')),
    recordStepSendResult: (input) => {
      gravados.push(input)
      return Promise.resolve()
    },
  }
  const unipile: UnipileMail = {
    sendEmail: (_account, mail) => {
      enviados.push(mail)
      return Promise.resolve({ id: 'em-106', message_id: '<m@x>' })
    },
    getEmail: () => Promise.reject(new Error('não usado')),
    listThreadEmails: () => Promise.resolve([]),
    listEmailSenders: () => Promise.resolve([]),
  }
  return { db, unipile, gravados, enviados }
}

function chat() {
  const gravados: Parameters<ChatSendDb['recordChatStepSendResult']>[0][] = []
  const enviados: { accountId: string; chatId: string; text: string }[] = []
  const db: ChatSendDb = {
    chatConversationForSend: () => Promise.resolve(null),
    ingestChatEvent: () => Promise.reject(new Error('não usado')),
    recordChatStepSendResult: (input: Parameters<ChatSendDb['recordChatStepSendResult']>[0]) => {
      gravados.push(input)
      return Promise.resolve()
    },
  }
  const unipile: UnipileChat = {
    startChat: () => Promise.resolve({ chat_id: 'c-1', message_id: '<m-1>' }),
    sendChatMessage: (accountId, chatId, text) => {
      enviados.push({ accountId, chatId, text })
      return Promise.resolve({ chat_id: 'chat-106', message_id: '<m-106>' })
    },
    sendInvitation: () => Promise.reject(new Error('não usado')),
    getLinkedInProfile: () => Promise.reject(new Error('não usado')),
    listChatMessages: () => Promise.resolve([]),
  }
  return { db, unipile, gravados, enviados }
}

Deno.test('não envia passo de e-mail com variável aberta ou vazia', async () => {
  const { db, unipile, gravados, enviados } = email()
  const result = await sendStep({ db, unipile }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberado('Oi {{primeiro_nome}}, vi a {{empresa}}.')),
  })
  assertEquals(result, { kind: 'blocked', outcome: 'missing_variable' })
  assertEquals(enviados, [])
  assertEquals(gravados, [{ sendId: SEND, outcome: 'failed', error: 'missing_variable' }])
})

Deno.test('não envia passo de chat com variável aberta', async () => {
  const { db, unipile, gravados, enviados } = chat()
  const result = await sendChatStep({ db, unipile }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberadoChat('Olá {{primeiro_nome}}, tudo bem?')),
  })
  assertEquals(result, { kind: 'blocked', outcome: 'missing_variable' })
  assertEquals(enviados, [])
  assertEquals(gravados, [{ sendId: SEND, outcome: 'failed', error: 'missing_variable' }])
})

Deno.test('mensagem já resolvida segue para o provedor', async () => {
  const { db, unipile, enviados } = email()
  const result = await sendStep({ db, unipile }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberado('Oi Maria, vi a Empresa Alvo.')),
  })
  assertEquals(result.kind, 'attempted')
  assertEquals(enviados.length, 1)
  assertEquals(enviados[0].plain_text, 'Oi Maria, vi a Empresa Alvo.')
})
