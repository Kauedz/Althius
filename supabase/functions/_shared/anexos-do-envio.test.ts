import { assertEquals } from 'jsr:@std/assert@1'
import { type StepAttachment, type StepAttachmentSource, toBase64 } from './anexos-do-envio.ts'
import { type ReleasedSend, sendStep, type SendStepDb, type UnipileMail } from './send-step.ts'
import { type ChatSendDb, type ReleasedChatSend, sendChatStep, type UnipileChat } from './send-chat-step.ts'

const SEND = '60000000-0000-0000-0000-000000000009'
const TITULAR = '50000000-0000-0000-0000-000000000009'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const ARQUIVO: StepAttachment = {
  attachment_id: '71000000-0000-0000-0000-000000000001',
  storage_path: 'anexos/s/a/arquivo',
  file_name: 'print.png',
  mime_type: 'image/png',
  size_bytes: PNG.length,
}

function fonteDeAnexos(resposta: { problem: string } | { files: StepAttachment[] } | Error, baixar: Uint8Array | Error = PNG) {
  const falhas: { sendId: string; problem: string }[] = []
  const baixados: string[] = []
  const source: StepAttachmentSource = {
    forSend: () => resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta),
    download: (path) => {
      baixados.push(path)
      return baixar instanceof Error ? Promise.reject(baixar) : Promise.resolve(baixar)
    },
    failSend: (sendId, problem) => {
      falhas.push({ sendId, problem })
      return Promise.resolve()
    },
  }
  return { source, falhas, baixados }
}

// ---------- E-mail ----------

const LIBERADO: ReleasedSend = {
  outcome: 'released',
  send_id: SEND,
  unipile_account_id: 'unipile-google-9',
  destination: 'maria@empresa.test',
  contact_name: 'Maria',
  subject: 'Oi',
  body: 'Olá, Maria.',
  reply_to_message_id: null,
  tracking_header_name: 'X-Althius-Envio',
  tracking_header_value: SEND,
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
      return Promise.resolve({ id: 'em-1', message_id: '<m@x>' })
    },
    getEmail: () => Promise.reject(new Error('não usado')),
    listThreadEmails: () => Promise.resolve([]),
    listEmailSenders: () => Promise.resolve([]),
  }
  return { db, unipile, gravados, enviados }
}

Deno.test('o e-mail sai com o anexo do passo, em base64, baixado do bucket privado', async () => {
  const { db, unipile, gravados, enviados } = email()
  const { source, baixados } = fonteDeAnexos({ files: [ARQUIVO] })
  const result = await sendStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(LIBERADO),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
  assertEquals(baixados, ['anexos/s/a/arquivo'])
  assertEquals(enviados[0].attachments, [{ filename: 'print.png', content_type: 'image/png', content: toBase64(PNG) }])
  assertEquals(gravados.map((g) => g.outcome), ['sent'])
})

Deno.test('sem anexo, o corpo do e-mail não ganha a lista vazia', async () => {
  const { db, unipile, enviados } = email()
  const { source } = fonteDeAnexos({ files: [] })
  await sendStep({ db, unipile, attachments: source }, { sendId: SEND, userId: TITULAR, release: () => Promise.resolve(LIBERADO) })
  assertEquals('attachments' in enviados[0], false)
})

Deno.test('um anexo que não serve ao canal não sai: o Envio falha com o motivo e a Unipile não é chamada', async () => {
  const { db, unipile, gravados, enviados } = email()
  const { source, falhas } = fonteDeAnexos({ problem: 'attachment_too_large' })
  const result = await sendStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(LIBERADO),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'failed', recorded: true, reason: 'attachment_too_large' })
  assertEquals(falhas, [{ sendId: SEND, problem: 'attachment_too_large' }])
  assertEquals(enviados.length, 0)
  assertEquals(gravados.length, 0)
})

Deno.test('um arquivo do bucket com outro tamanho que o registrado é tratado como trocado, e não sai', async () => {
  const { db, unipile, enviados } = email()
  const { source, falhas } = fonteDeAnexos({ files: [ARQUIVO] }, new Uint8Array([1, 2]))
  await sendStep({ db, unipile, attachments: source }, { sendId: SEND, userId: TITULAR, release: () => Promise.resolve(LIBERADO) })
  assertEquals(falhas.map((f) => f.problem), ['attachment_not_stored'])
  assertEquals(enviados.length, 0)
})

Deno.test('o anexo que não deu para baixar falha como recusa passageira (nova tentativa), sem chamar a Unipile', async () => {
  const { db, unipile, gravados, enviados } = email()
  const { source, falhas } = fonteDeAnexos({ files: [ARQUIVO] }, new Error('storage fora'))
  const result = await sendStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(LIBERADO),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'failed', recorded: true, reason: 'attachment_download_failed' })
  assertEquals(gravados.map((g) => [g.outcome, g.error]), [['failed', 'attachment_download_failed']])
  assertEquals(falhas.length + enviados.length, 0)
})

Deno.test('um passo bloqueado pelo banco nem pede os anexos', async () => {
  const { db, unipile } = email()
  let pedidos = 0
  const source: StepAttachmentSource = {
    forSend: () => {
      pedidos++
      return Promise.resolve({ files: [] })
    },
    download: () => Promise.resolve(PNG),
    failSend: () => Promise.resolve(),
  }
  const result = await sendStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve({ outcome: 'sender_not_ready', send_id: SEND }),
  })
  assertEquals(result, { kind: 'blocked', outcome: 'sender_not_ready' })
  assertEquals(pedidos, 0)
})

// ---------- WhatsApp e LinkedIn ----------

function liberadoDeConversa(overrides: Partial<ReleasedChatSend> = {}): ReleasedChatSend {
  return {
    outcome: 'released',
    send_id: SEND,
    channel: 'whatsapp',
    unipile_account_id: 'unipile-wa-1',
    destination: '+5511988887777',
    contact_name: 'Maria',
    body: 'Olá, Maria.',
    linkedin_subtype: null,
    provider_chat_id: null,
    provider_user_id: null,
    invite_sent: false,
    invite_note_limit: 300,
    ...overrides,
  }
}

function conversa(firstDegree: boolean | null = null) {
  const gravados: Parameters<ChatSendDb['recordChatStepSendResult']>[0][] = []
  const chamadas: { metodo: string; anexos: unknown }[] = []
  const db: ChatSendDb = {
    chatConversationForSend: () => Promise.resolve(null),
    ingestChatEvent: () => Promise.reject(new Error('não usado')),
    recordChatStepSendResult: (input) => {
      gravados.push(input)
      return Promise.resolve()
    },
  }
  const unipile: UnipileChat = {
    startChat: (_a, input) => {
      chamadas.push({ metodo: 'startChat', anexos: input.attachments })
      return Promise.resolve({ chat_id: 'chat-1', message_id: 'msg-1' })
    },
    sendChatMessage: (_a, _c, _t, options) => {
      chamadas.push({ metodo: 'sendChatMessage', anexos: options.attachments })
      return Promise.resolve({ chat_id: 'chat-1', message_id: 'msg-2' })
    },
    sendInvitation: () => {
      chamadas.push({ metodo: 'sendInvitation', anexos: undefined })
      return Promise.resolve({ id: 'inv-1' })
    },
    getLinkedInProfile: () => Promise.resolve({ providerId: 'li-native', firstDegree }),
    listChatMessages: () => Promise.resolve([]),
  }
  return { db, unipile, gravados, chamadas }
}

Deno.test('o WhatsApp abre a conversa levando o anexo', async () => {
  const { db, unipile, gravados, chamadas } = conversa()
  const { source } = fonteDeAnexos({ files: [ARQUIVO] })
  const result = await sendChatStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberadoDeConversa()),
  })
  assertEquals(result.kind === 'attempted' && result.outcome, 'sent')
  assertEquals(chamadas, [{
    metodo: 'startChat',
    anexos: [{ filename: 'print.png', content_type: 'image/png', content: toBase64(PNG) }],
  }])
  assertEquals(gravados.map((g) => g.outcome), ['sent'])
})

Deno.test('a mensagem que continua uma conversa também leva o anexo', async () => {
  const { db, unipile, chamadas } = conversa()
  const { source } = fonteDeAnexos({ files: [ARQUIVO] })
  await sendChatStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberadoDeConversa({ provider_chat_id: 'chat-1' })),
  })
  assertEquals(chamadas.map((c) => [c.metodo, Array.isArray(c.anexos) ? c.anexos.length : 0]), [['sendChatMessage', 1]])
})

Deno.test('um convite do LinkedIn com anexo não sai: fica bloqueado com o motivo', async () => {
  const { db, unipile, gravados, chamadas } = conversa(false)
  const { source } = fonteDeAnexos({ files: [ARQUIVO] })
  const result = await sendChatStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () =>
      Promise.resolve(liberadoDeConversa({
        channel: 'linkedin',
        unipile_account_id: 'unipile-li-1',
        destination: 'https://www.linkedin.com/in/maria-souza',
        linkedin_subtype: 'convite',
      })),
  })
  assertEquals(result.kind === 'attempted' && [result.outcome, result.reason], ['blocked', 'attachment_not_supported_on_invite'])
  assertEquals(chamadas.length, 0)
  assertEquals(gravados.map((g) => [g.outcome, g.error]), [['blocked', 'attachment_not_supported_on_invite']])
})

Deno.test('a mensagem a uma conexão do LinkedIn leva o anexo', async () => {
  const { db, unipile, chamadas } = conversa(true)
  const { source } = fonteDeAnexos({ files: [ARQUIVO] })
  await sendChatStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () =>
      Promise.resolve(liberadoDeConversa({
        channel: 'linkedin',
        unipile_account_id: 'unipile-li-1',
        destination: 'https://www.linkedin.com/in/maria-souza',
        linkedin_subtype: 'mensagem',
      })),
  })
  assertEquals(chamadas.map((c) => [c.metodo, Array.isArray(c.anexos) ? c.anexos.length : 0]), [['startChat', 1]])
})

Deno.test('no WhatsApp, o anexo inválido também não sai e o motivo fica no Envio', async () => {
  const { db, unipile, gravados, chamadas } = conversa()
  const { source, falhas } = fonteDeAnexos({ problem: 'attachment_type_not_supported' })
  const result = await sendChatStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberadoDeConversa()),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'failed', recorded: true, reason: 'attachment_type_not_supported' })
  assertEquals(falhas, [{ sendId: SEND, problem: 'attachment_type_not_supported' }])
  assertEquals(chamadas.length + gravados.length, 0)
})

Deno.test('no WhatsApp, o anexo que não deu para baixar falha como passageiro, sem chamar a Unipile', async () => {
  const { db, unipile, gravados, chamadas } = conversa()
  const { source } = fonteDeAnexos(new Error('banco fora'))
  await sendChatStep({ db, unipile, attachments: source }, {
    sendId: SEND,
    userId: TITULAR,
    release: () => Promise.resolve(liberadoDeConversa()),
  })
  assertEquals(gravados.map((g) => [g.outcome, g.error]), [['failed', 'attachment_download_failed']])
  assertEquals(chamadas.length, 0)
})
