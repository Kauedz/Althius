import { assertEquals } from 'jsr:@std/assert@1'
import { createMailWebhookHandler } from './unipile-mail-webhook.ts'
import { createSequenceEmailStepsHandler } from './sequence-email-steps.ts'
import { RpcError } from './rpc.ts'
import { simulatedUnipile } from './simulated-unipile.ts'
import { createUnipileEmail } from './unipile-email.ts'
import { BETO, EVA, seedSequence, type TestDatabase, withTestDatabase } from './test-db.ts'

const SECRET = 'segredo-do-webhook-de-email'

function webhook(db: TestDatabase) {
  const pending: Array<() => Promise<unknown>> = []
  const handler = createMailWebhookHandler({
    secret: SECRET,
    rpc: db.serviceRpc,
    // O runtime continua o trabalho depois da resposta; no teste, ele roda quando o teste pede.
    background: (task) => { pending.push(task) },
  })
  return {
    deliver: (body: unknown, secret: string | null = SECRET) => handler(new Request('http://localhost/functions/v1/unipile-mail-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret ? { 'Unipile-Auth': secret } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })),
    async runBackground() {
      while (pending.length) await pending.shift()!()
    },
  }
}

/** O responsável confirma e envia o passo `a1` pela Unipile simulada. */
async function sendFirstStep(db: TestDatabase, sequenceId: string) {
  const unipile = simulatedUnipile()
  unipile.onSend(() => Response.json({ object: 'EmailSent', tracking_id: 'trk-a1' }))
  const steps = createSequenceEmailStepsHandler({
    authenticate: () => Promise.resolve({ userId: BETO, rpc: db.userRpc(BETO) }),
    serviceRpc: db.serviceRpc,
    unipile: createUnipileEmail({ apiOrigin: 'https://api1.unipile.com:13111', apiKey: 'chave' }, unipile.fetch),
    corsHeaders: {},
  })
  const call = (body: unknown) => steps(new Request('http://localhost/', { method: 'POST', body: JSON.stringify(body) }))
  const confirmed = await (await call({ action: 'confirm', sequenceId, stepId: 'a1' })).json()
  await call({ action: 'send', sendId: confirmed.sendId })
}

const replyFromMaria = {
  event: 'mail_received', account_id: 'acc-beto-email', email_id: 'email-r1', message_id: '<r1@alfa.com.br>',
  webhook_name: 'Althius e-mail', role: 'inbox', origin: 'external', date: '2026-09-28T15:30:00.000Z',
  from_attendee: { identifier: 'maria@alfa.com.br', display_name: 'Maria Souza' },
  to_attendees: [{ identifier: 'beto@cliente.com.br' }],
  subject: 'Re: Proposta para a Alfa', body: '<p>Tenho interesse.</p>', body_plain: 'Tenho interesse.',
  has_attachments: false, attachments: [],
}

function sequenceStatus(db: TestDatabase, sequenceId: string) {
  return db.value<string>(`select status as value from public.sequences where id = '${sequenceId}'`)
}

Deno.test('webhook sem o segredo do header Unipile-Auth é recusado e nada é persistido', () =>
  withTestDatabase(async (db) => {
    await seedSequence(db)
    const { deliver } = webhook(db)

    assertEquals((await deliver(replyFromMaria, null)).status, 401)
    assertEquals((await deliver(replyFromMaria, 'segredo-errado')).status, 401)
    assertEquals(await db.value<number>('select count(*)::int as value from private.unipile_mail_events'), 0)
  }))

Deno.test('a resposta do Contato é persistida e confirmada antes do processamento, que pausa a Sequência depois', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    await sendFirstStep(db, sequenceId)
    const { deliver, runBackground } = webhook(db)

    const response = await deliver(replyFromMaria)
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { received: true })
    assertEquals(await db.value<number>('select count(*)::int as value from private.unipile_mail_events'), 1)
    assertEquals(await sequenceStatus(db, sequenceId), 'ativa')

    await runBackground()
    assertEquals(await sequenceStatus(db, sequenceId), 'pausada')
    assertEquals(await db.valueAs<string>(BETO,
      `select body_plain as value from public.list_owned_sequence_messages('${sequenceId}')`), 'Tenho interesse.')
    assertEquals(await db.valueAs<string>(EVA,
      `select string_agg(kind, ',') as value from public.sequence_events where sequence_id = '${sequenceId}'`),
      'contato-respondeu')
  }))

Deno.test('entrega repetida e eco do próprio envio não duplicam nem pausam de novo', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    await sendFirstStep(db, sequenceId)
    const { deliver, runBackground } = webhook(db)

    const echo = {
      event: 'mail_sent', account_id: 'acc-beto-email', email_id: 'email-a1', message_id: '<a1@mail.beto>',
      tracking_id: 'trk-a1', role: 'sent', origin: 'unipile', date: '2026-09-28T12:00:00.000Z',
      from_attendee: { identifier: 'beto@cliente.com.br' }, to_attendees: [{ identifier: 'maria@alfa.com.br' }],
      subject: 'Proposta para a Alfa', body: '<p>Olá, Maria.</p>',
    }
    assertEquals((await deliver(echo)).status, 200)
    await runBackground()
    assertEquals(await sequenceStatus(db, sequenceId), 'ativa')

    assertEquals((await deliver(replyFromMaria)).status, 200)
    assertEquals((await deliver(replyFromMaria)).status, 200)
    await runBackground()
    assertEquals((await deliver({ ...replyFromMaria, email_id: 'email-r1-resync' })).status, 200)
    await runBackground()

    assertEquals(await db.valueAs<number>(EVA,
      `select count(*)::int as value from public.sequence_events where sequence_id = '${sequenceId}'`), 1)
    assertEquals(await db.valueAs<number>(EVA,
      `select count(*)::int as value from public.account_interactions where kind = 'email-recebido'`), 1)
  }))

Deno.test('eventos que não são de e-mail são confirmados sem registro; corpo inválido é recusado', () =>
  withTestDatabase(async (db) => {
    await seedSequence(db)
    const { deliver } = webhook(db)

    assertEquals((await deliver({ event: 'message_received', account_id: 'acc-beto-whatsapp', message_id: 'x' })).status, 200)
    assertEquals((await deliver('{não é json')).status, 400)
    assertEquals((await deliver({ event: 'mail_received', account_id: 'acc-beto-email' })).status, 400)
    assertEquals(await db.value<number>('select count(*)::int as value from private.unipile_mail_events'), 0)
  }))

Deno.test('se o evento não pôde ser persistido, a Unipile recebe erro e tenta de novo', async () => {
  const handler = createMailWebhookHandler({
    secret: SECRET,
    rpc: () => Promise.reject(new RpcError('connection refused', '08006')),
    background: () => {},
  })
  const response = await handler(new Request('http://localhost/', {
    method: 'POST', headers: { 'Unipile-Auth': SECRET }, body: JSON.stringify(replyFromMaria),
  }))
  assertEquals(response.status, 500)
})
