import { assertEquals } from 'jsr:@std/assert@1'
import type { EmailSent, OutgoingEmail, ReleaseResult, UnipileMail } from '../_shared/send-step.ts'
import { UnipileRequestError } from '../_shared/send-step.ts'
import { retryAfterSeconds } from '../_shared/send-step-adapters.ts'
import { createHandler, type Deps, type DueSend, type RunnerDb } from './handler.ts'

const TOKEN = 'a'.repeat(64)
const TITULAR = '50000000-0000-0000-0000-000000000001'
const SEND_1 = '60000000-0000-0000-0000-000000000001'
const SEND_2 = '60000000-0000-0000-0000-000000000002'

function released(sendId: string): ReleaseResult {
  return {
    outcome: 'released',
    send_id: sendId,
    unipile_account_id: 'unipile-google-1',
    destination: 'maria@empresa-alvo.test',
    contact_name: 'Maria Souza',
    subject: 'Apresentação',
    body: 'Olá, Maria.',
    reply_to_message_id: null,
    tracking_header_name: 'X-Althius-Envio',
    tracking_header_value: sendId,
  }
}

function fakeDb(due: DueSend[], releases: Record<string, ReleaseResult | Error> = {}) {
  const recorded: Parameters<RunnerDb['recordStepSendResult']>[0][] = []
  const released: string[] = []
  const conversations: string[] = []
  let claims = 0
  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claimDueSends: async (limit) => {
      claims++
      return due.slice(0, limit)
    },
    releaseDueSend: async (sendId) => {
      released.push(sendId)
      const result = releases[sendId] ?? { outcome: 'not_due', send_id: sendId }
      if (result instanceof Error) throw result
      return result
    },
    conversationForSend: async (sendId, userId) => {
      conversations.push(`${sendId}:${userId}`)
      return null
    },
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    recordStepSendResult: async (input) => {
      recorded.push(input)
    },
  }
  return { db, recorded, released, conversations, claims: () => claims }
}

function fakeUnipile(behaviour: EmailSent | Error) {
  const sent: { accountId: string; email: OutgoingEmail }[] = []
  const unipile: UnipileMail = {
    getEmail: async (_accountId, emailId) => ({ id: emailId }),
    listThreadEmails: async () => [],
    listEmailSenders: async () => [],
    sendEmail: (accountId, email) => {
      sent.push({ accountId, email })
      return behaviour instanceof Error ? Promise.reject(behaviour) : Promise.resolve(behaviour)
    },
  }
  return { unipile, sent }
}

function runner(db: RunnerDb, unipile: UnipileMail, options: Partial<Deps> = {}) {
  const work: Promise<unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    db,
    unipile,
    waitUntil: (promise) => work.push(promise),
    log: (fields) => logs.push(fields),
    ...options,
  })
  return { handle, finished: () => Promise.all(work), logs }
}

function call(token: string | null = TOKEN, method = 'POST') {
  return new Request('https://functions.test/sequence-runner', {
    method,
    headers: token === null ? {} : { 'x-runner-token': token },
  })
}

Deno.test('sem o token do banco, a chamada não reserva nem envia nada', async () => {
  const { db, claims } = fakeDb([{ send_id: SEND_1, owner_user_id: TITULAR }])
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished } = runner(db, unipile)
  assertEquals((await handle(call(null))).status, 401)
  assertEquals((await handle(call('b'.repeat(64)))).status, 401)
  assertEquals((await handle(call('curto'))).status, 401)
  assertEquals((await handle(call(TOKEN, 'GET'))).status, 405)
  await finished()
  assertEquals(claims(), 0)
  assertEquals(sent.length, 0)
})

Deno.test('com o navegador fechado, o passo vencido sai em nome do titular e o resultado fica gravado', async () => {
  const { db, recorded, released: releasedIds, conversations } = fakeDb(
    [{ send_id: SEND_1, owner_user_id: TITULAR }],
    { [SEND_1]: released(SEND_1) },
  )
  const { unipile, sent } = fakeUnipile({ id: 'email-abc', message_id: '<m1@x>' })
  const { handle, finished, logs } = runner(db, unipile)

  const res = await handle(call())
  assertEquals(res.status, 202)
  assertEquals(await res.json(), { accepted: true })
  await finished()

  assertEquals(releasedIds, [SEND_1])
  assertEquals(conversations, [`${SEND_1}:${TITULAR}`])
  assertEquals(sent[0].accountId, 'unipile-google-1')
  assertEquals(sent[0].email.custom_headers, [{ name: 'X-Althius-Envio', value: SEND_1 }])
  assertEquals(recorded, [{
    sendId: SEND_1,
    outcome: 'sent',
    providerEmailId: 'email-abc',
    providerMessageId: '<m1@x>',
    error: null,
    retryAfterSeconds: null,
  }])
  assertEquals(logs, [{ type: 'runner', sendId: SEND_1, outcome: 'sent' }])
})

Deno.test('um passo barrado pelo banco (pausa, fora da janela) não chama a Unipile', async () => {
  const { db, recorded } = fakeDb(
    [{ send_id: SEND_1, owner_user_id: TITULAR }, { send_id: SEND_2, owner_user_id: TITULAR }],
    {
      [SEND_1]: { outcome: 'sequence_not_active', send_id: SEND_1 },
      [SEND_2]: { outcome: 'outside_window', send_id: SEND_2 },
    },
  )
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished, logs } = runner(db, unipile)
  await handle(call())
  await finished()
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
  assertEquals(logs.map((l) => l.outcome), ['sequence_not_active', 'outside_window'])
})

Deno.test('a recusa da Unipile vai para o banco com o Retry-After, que decide a nova tentativa', async () => {
  const { db, recorded } = fakeDb([{ send_id: SEND_1, owner_user_id: TITULAR }], { [SEND_1]: released(SEND_1) })
  const { unipile } = fakeUnipile(new UnipileRequestError(429, 120))
  const { handle, finished } = runner(db, unipile)
  await handle(call())
  await finished()
  assertEquals(recorded[0].outcome, 'failed')
  assertEquals(recorded[0].error, 'HTTP 429')
  assertEquals(recorded[0].retryAfterSeconds, 120)
})

Deno.test('uma falha num passo não impede os outros da mesma rodada', async () => {
  const { db, recorded } = fakeDb(
    [{ send_id: SEND_1, owner_user_id: TITULAR }, { send_id: SEND_2, owner_user_id: TITULAR }],
    { [SEND_1]: new Error('conexão caiu'), [SEND_2]: released(SEND_2) },
  )
  const { unipile, sent } = fakeUnipile({ id: 'e2', message_id: null })
  const { handle, finished, logs } = runner(db, unipile)
  await handle(call())
  await finished()
  assertEquals(sent.length, 1)
  assertEquals(recorded.map((r) => r.sendId), [SEND_2])
  assertEquals(logs.map((l) => l.outcome), ['release_error', 'sent'])
})

Deno.test('a rodada respeita o limite de passos por chamada', async () => {
  const due = Array.from({ length: 8 }, (_, i) => ({ send_id: `s-${i}`, owner_user_id: TITULAR }))
  const { db, released: releasedIds } = fakeDb(due)
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished } = runner(db, unipile, { maxPerRun: 3 })
  await handle(call())
  await finished()
  assertEquals(releasedIds, ['s-0', 's-1', 's-2'])
})

Deno.test('Retry-After em segundos ou em data HTTP', () => {
  assertEquals(retryAfterSeconds('90'), 90)
  assertEquals(retryAfterSeconds('Sun, 27 Sep 2026 12:01:00 GMT', Date.parse('2026-09-27T12:00:00Z')), 60)
  assertEquals(retryAfterSeconds('amanhã'), null)
  assertEquals(retryAfterSeconds(null), null)
})
