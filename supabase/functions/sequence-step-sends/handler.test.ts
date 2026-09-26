import { assertEquals } from 'jsr:@std/assert@1'
import {
  type Conversation,
  createHandler,
  type Db,
  type Deps,
  type EmailSent,
  type OutgoingEmail,
  type ReleaseResult,
  type UnipileMail,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from './handler.ts'

const WORKSPACE = '51000000-0000-0000-0000-000000000001'
const SEND = '60000000-0000-0000-0000-000000000001'
const TITULAR = '50000000-0000-0000-0000-000000000001'

const RELEASED: ReleaseResult = {
  outcome: 'released',
  send_id: SEND,
  unipile_account_id: 'unipile-google-1',
  destination: 'maria@empresa-alvo.test',
  contact_name: 'Maria Souza',
  subject: 'Apresentação da Althius',
  body: 'Olá, Maria.',
  reply_to_message_id: null,
  tracking_header_name: 'X-Althius-Envio',
  tracking_header_value: SEND,
}

interface DbOptions {
  member?: boolean
  user?: boolean
  conversation?: Conversation | null
  /** O desfecho da ingestão por e-mail da conversa, pelo id do e-mail. */
  ingest?: Record<string, string>
}

function fakeDb(release: ReleaseResult | Error, options: DbOptions = {}) {
  const recorded: Parameters<Db['recordStepSendResult']>[0][] = []
  const ingested: Parameters<Db['ingestEmailEvent']>[0][] = []
  let releases = 0
  const db: Db = {
    userFromJwt: async () => (options.user ?? true) ? { userId: TITULAR } : null,
    hasActiveMembership: async () => options.member ?? true,
    conversationForSend: async () => options.conversation ?? null,
    ingestEmailEvent: async (input) => {
      ingested.push(input)
      return {
        outcome: options.ingest?.[String(input.email.id)] ?? 'unrelated',
        interaction_id: null,
        send_id: null,
        attachments: [],
      }
    },
    releaseStepSend: async () => {
      releases++
      if (release instanceof Error) throw release
      return release
    },
    recordStepSendResult: async (input) => {
      recorded.push(input)
    },
  }
  return { db, recorded, ingested, releases: () => releases }
}

function handlerWith(db: Db, unipile: UnipileMail, options: Partial<Deps> = {}) {
  return createHandler({ db, unipile, appOrigin: 'https://app.test', ...options })
}

interface UnipileOptions {
  thread?: Record<string, unknown>[] | Error
  sentEmail?: Record<string, unknown> | Error
  senders?: string[]
}

function fakeUnipile(
  behaviour: EmailSent | UnipileRequestError | UnipileUnreadableResponse | 'hang',
  options: UnipileOptions = {},
) {
  const sent: { accountId: string; email: OutgoingEmail }[] = []
  const threads: string[] = []
  const unipile: UnipileMail = {
    getEmail: async (_accountId, emailId) => {
      if (options.sentEmail instanceof Error) throw options.sentEmail
      return options.sentEmail ?? { id: emailId }
    },
    listThreadEmails: async (_accountId, threadId) => {
      threads.push(threadId)
      if (options.thread instanceof Error) throw options.thread
      return options.thread ?? []
    },
    listEmailSenders: async () => options.senders ?? ['althius.relacionamento@gmail.com'],
    sendEmail: (accountId, email, { signal }) => {
      sent.push({ accountId, email })
      if (behaviour === 'hang') {
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        )
      }
      if (behaviour instanceof Error) return Promise.reject(behaviour)
      return Promise.resolve(behaviour)
    },
  }
  return { unipile, sent, threads }
}

function request(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer jwt', apikey: 'anon' }) {
  return new Request('https://functions.test/sequence-step-sends', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const sendBody = { action: 'send', workspaceId: WORKSPACE, sendId: SEND }

Deno.test('sem JWT do titular, nada é liberado', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody, {}))
  assertEquals(res.status, 401)
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
})

Deno.test('sem Participação ativa no Workspace, o envio é recusado', async () => {
  const { db } = fakeDb(RELEASED, { member: false })
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 403)
  assertEquals(sent.length, 0)
})

Deno.test('um envio sem id válido é recusado antes de tocar o banco', async () => {
  const { db } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request({ ...sendBody, sendId: 'abc' }))
  assertEquals(res.status, 400)
})

Deno.test('passo liberado sai pela Conta remetente do titular, com o cabeçalho da Althius, e fica como sent', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile, sent } = fakeUnipile({ id: 'email-abc', message_id: '<msg-1@mail.gmail.com>' })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { outcome: 'sent', sendId: SEND })
  assertEquals(sent, [{
    accountId: 'unipile-google-1',
    email: {
      to: [{ email: 'maria@empresa-alvo.test', display_name: 'Maria Souza' }],
      subject: 'Apresentação da Althius',
      plain_text: 'Olá, Maria.',
      custom_headers: [{ name: 'X-Althius-Envio', value: SEND }],
    },
  }])
  assertEquals(recorded, [{
    sendId: SEND,
    outcome: 'sent',
    providerEmailId: 'email-abc',
    providerMessageId: '<msg-1@mail.gmail.com>',
    error: null,
  }])
})

Deno.test('um passo "Re:" continua a conversa pelo reply_to_message_id', async () => {
  const { db } = fakeDb({
    ...RELEASED,
    subject: 'Re: Apresentação da Althius',
    reply_to_message_id: '<msg-1@mail.gmail.com>',
  })
  const { unipile, sent } = fakeUnipile({ id: 'email-def', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 200)
  assertEquals(sent[0].email.reply_to_message_id, '<msg-1@mail.gmail.com>')
})

Deno.test('envio bloqueado pelo banco não chama a Unipile e explica o motivo', async () => {
  const { db, recorded } = fakeDb({ outcome: 'destination_changed', send_id: SEND })
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 409)
  const body = await res.json()
  assertEquals(body.outcome, 'destination_changed')
  assertEquals(
    body.message,
    'O e-mail do Contato mudou depois da confirmação. Reconfirme o passo para enviar ao novo Destino.',
  )
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
})

Deno.test('recusa da Unipile fica gravada como failed, nunca como enviado', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile(new UnipileRequestError(500))
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 502)
  assertEquals((await res.json()).outcome, 'failed')
  assertEquals(recorded, [{
    sendId: SEND,
    outcome: 'failed',
    providerEmailId: null,
    providerMessageId: null,
    error: 'HTTP 500',
  }])
})

Deno.test('sem resposta da Unipile no prazo, o resultado fica incerto para reconciliar', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile('hang')
  const handle = handlerWith(db, unipile, { sendTimeoutMs: 10 })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 504)
  assertEquals((await res.json()).outcome, 'uncertain')
  assertEquals(recorded, [{
    sendId: SEND,
    outcome: 'uncertain',
    providerEmailId: null,
    providerMessageId: null,
    error: 'timeout',
  }])
})

Deno.test('2xx sem o id do e-mail fica incerto: o provedor pode ter aceitado', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile(new UnipileUnreadableResponse())
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 504)
  assertEquals(recorded, [{
    sendId: SEND,
    outcome: 'uncertain',
    providerEmailId: null,
    providerMessageId: null,
    error: 'unreadable_response',
  }])
})

Deno.test('envio inexistente devolve 404', async () => {
  const { db } = fakeDb(Object.assign(new Error('send not found'), { code: 'P0002' }))
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 404)
})

const CONVERSATION: Conversation = {
  unipile_account_id: 'unipile-google-1',
  provider_thread_id: 'thread-1',
  provider_email_id: 'email-abc',
}
const OWN_ECHO = { id: 'email-abc', from: [{ email: 'althius.relacionamento@gmail.com' }] }
const CONTACT_REPLY = { id: 'email-r1', from: [{ email: 'maria@empresa-alvo.test' }] }

Deno.test('um passo "Re:" confere a conversa antes de sair: resposta ainda não gravada bloqueia o envio', async () => {
  const { db, ingested, releases } = fakeDb(RELEASED, {
    conversation: CONVERSATION,
    ingest: { 'email-abc': 'echo', 'email-r1': 'reply' },
  })
  const { unipile, sent } = fakeUnipile({ id: 'e2', message_id: null }, { thread: [OWN_ECHO, CONTACT_REPLY] })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 409)
  assertEquals((await res.json()).outcome, 'reply_found')
  assertEquals(sent.length, 0)
  assertEquals(releases(), 0)
  assertEquals(ingested.map((i) => [i.eventId, i.ownerAddresses]), [
    ['thread-check:unipile-google-1:email-abc', ['althius.relacionamento@gmail.com']],
    ['thread-check:unipile-google-1:email-r1', ['althius.relacionamento@gmail.com']],
  ])
})

Deno.test('conversa só com os próprios e-mails deixa o passo "Re:" sair', async () => {
  const { db } = fakeDb(RELEASED, { conversation: CONVERSATION, ingest: { 'email-abc': 'echo' } })
  const { unipile, sent } = fakeUnipile({ id: 'e2', message_id: null }, { thread: [OWN_ECHO] })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 200)
  assertEquals(sent.length, 1)
})

Deno.test('falha ao conferir a conversa bloqueia o envio em vez de arriscar', async () => {
  const { db, releases } = fakeDb(RELEASED, { conversation: CONVERSATION })
  const { unipile, sent } = fakeUnipile({ id: 'e2', message_id: null }, { thread: new UnipileRequestError(500) })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 409)
  assertEquals((await res.json()).outcome, 'thread_check_failed')
  assertEquals(sent.length, 0)
  assertEquals(releases(), 0)
})

Deno.test('o primeiro passo de uma conversa não tem nada a conferir', async () => {
  const { db, ingested } = fakeDb(RELEASED, {
    conversation: { unipile_account_id: 'unipile-google-1', provider_thread_id: null, provider_email_id: null },
  })
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 200)
  assertEquals(ingested.length, 0)
  assertEquals(sent.length, 1)
})

Deno.test('sem o eco do webhook, a conversa é descoberta pelo e-mail enviado e conferida mesmo assim', async () => {
  const { db, ingested } = fakeDb(RELEASED, {
    conversation: { unipile_account_id: 'unipile-google-1', provider_thread_id: null, provider_email_id: 'email-abc' },
    ingest: { 'email-abc': 'echo', 'email-r1': 'reply' },
  })
  const { unipile, sent, threads } = fakeUnipile({ id: 'e2', message_id: null }, {
    sentEmail: { ...OWN_ECHO, thread_id: 'thread-1' },
    thread: [OWN_ECHO, CONTACT_REPLY],
  })
  const handle = handlerWith(db, unipile)
  const res = await handle(request(sendBody))
  assertEquals(res.status, 409)
  assertEquals((await res.json()).outcome, 'reply_found')
  assertEquals(threads, ['thread-1'])
  assertEquals(ingested.map((i) => i.eventId), [
    'thread-check:unipile-google-1:email-abc',
    'thread-check:unipile-google-1:email-abc',
    'thread-check:unipile-google-1:email-r1',
  ])
  assertEquals(sent.length, 0)
})
