import { assertEquals } from 'jsr:@std/assert@1'
import {
  createHandler, UnipileRequestError,
  type Db, type EmailSent, type OutgoingEmail, type ReleaseResult, type UnipileMail,
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

function fakeDb(release: ReleaseResult | Error, options: { member?: boolean; user?: boolean } = {}) {
  const recorded: Parameters<Db['recordStepSendResult']>[0][] = []
  const db: Db = {
    userFromJwt: async () => (options.user ?? true) ? { userId: TITULAR } : null,
    hasActiveMembership: async () => options.member ?? true,
    releaseStepSend: async () => {
      if (release instanceof Error) throw release
      return release
    },
    recordStepSendResult: async (input) => { recorded.push(input) },
  }
  return { db, recorded }
}

function fakeUnipile(behaviour: EmailSent | UnipileRequestError | 'hang') {
  const sent: { accountId: string; email: OutgoingEmail }[] = []
  const unipile: UnipileMail = {
    sendEmail: (accountId, email, { signal }) => {
      sent.push({ accountId, email })
      if (behaviour === 'hang') {
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
      }
      if (behaviour instanceof UnipileRequestError) return Promise.reject(behaviour)
      return Promise.resolve(behaviour)
    },
  }
  return { unipile, sent }
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
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request(sendBody, {}))
  assertEquals(res.status, 401)
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
})

Deno.test('sem Participação ativa no Workspace, o envio é recusado', async () => {
  const { db } = fakeDb(RELEASED, { member: false })
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 403)
  assertEquals(sent.length, 0)
})

Deno.test('um envio sem id válido é recusado antes de tocar o banco', async () => {
  const { db } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request({ ...sendBody, sendId: 'abc' }))
  assertEquals(res.status, 400)
})

Deno.test('passo liberado sai pela Conta remetente do titular, com o cabeçalho da Althius, e fica como sent', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile, sent } = fakeUnipile({ id: 'email-abc', message_id: '<msg-1@mail.gmail.com>' })
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
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
    sendId: SEND, outcome: 'sent', providerEmailId: 'email-abc', providerMessageId: '<msg-1@mail.gmail.com>', error: null,
  }])
})

Deno.test('um passo "Re:" continua a conversa pelo reply_to_message_id', async () => {
  const { db } = fakeDb({ ...RELEASED, subject: 'Re: Apresentação da Althius', reply_to_message_id: '<msg-1@mail.gmail.com>' })
  const { unipile, sent } = fakeUnipile({ id: 'email-def', message_id: null })
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 200)
  assertEquals(sent[0].email.reply_to_message_id, '<msg-1@mail.gmail.com>')
})

Deno.test('envio bloqueado pelo banco não chama a Unipile e explica o motivo', async () => {
  const { db, recorded } = fakeDb({ outcome: 'destination_changed', send_id: SEND })
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 409)
  const body = await res.json()
  assertEquals(body.outcome, 'destination_changed')
  assertEquals(typeof body.message, 'string')
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
})

Deno.test('recusa da Unipile fica gravada como failed, nunca como enviado', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile(new UnipileRequestError(500))
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 502)
  assertEquals((await res.json()).outcome, 'failed')
  assertEquals(recorded, [{ sendId: SEND, outcome: 'failed', providerEmailId: null, providerMessageId: null, error: 'HTTP 500' }])
})

Deno.test('sem resposta da Unipile no prazo, o resultado fica incerto para reconciliar', async () => {
  const { db, recorded } = fakeDb(RELEASED)
  const { unipile } = fakeUnipile('hang')
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test', sendTimeoutMs: 10 })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 504)
  assertEquals((await res.json()).outcome, 'uncertain')
  assertEquals(recorded, [{ sendId: SEND, outcome: 'uncertain', providerEmailId: null, providerMessageId: null, error: 'timeout' }])
})

Deno.test('envio inexistente devolve 404', async () => {
  const { db } = fakeDb(Object.assign(new Error('send not found'), { code: 'P0002' }))
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const handle = createHandler({ db, unipile, appOrigin: 'https://app.test' })
  const res = await handle(request(sendBody))
  assertEquals(res.status, 404)
})
