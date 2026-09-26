import { assertEquals } from 'jsr:@std/assert@1'
import { createSequenceEmailStepsHandler } from './sequence-email-steps.ts'
import { simulatedUnipile } from './simulated-unipile.ts'
import { createUnipileEmail } from './unipile-email.ts'
import { BETO, EVA, seedSequence, type TestDatabase, withTestDatabase } from './test-db.ts'

const config = { apiOrigin: 'https://api1.unipile.com:13111', apiKey: 'chave-privada' }

function stepsHandler(db: TestDatabase, unipile: ReturnType<typeof simulatedUnipile> | null, timeoutMs = 20_000) {
  return createSequenceEmailStepsHandler({
    // O Supabase Auth fica de fora: o teste diz quem é o usuário autenticado.
    authenticate: (request) => {
      const userId = request.headers.get('x-test-user')
      return Promise.resolve(userId ? { userId, rpc: db.userRpc(userId) } : null)
    },
    serviceRpc: db.serviceRpc,
    unipile: unipile ? createUnipileEmail(config, unipile.fetch, timeoutMs) : null,
    corsHeaders: {},
  })
}

async function post(handler: (request: Request) => Promise<Response>, userId: string | null, body: unknown) {
  const response = await handler(new Request('http://localhost/functions/v1/sequence-email-steps', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(userId ? { 'x-test-user': userId } : {}) },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() }
}

function stepStatus(db: TestDatabase, sequenceId: string) {
  return db.valueAs<string>(BETO, `select status as value from public.list_owned_step_sends('${sequenceId}')`)
}

Deno.test('o responsável confirma o passo e a Althius envia pela Conta remetente de E-mail dele', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    const unipile = simulatedUnipile()
    unipile.onSend(() => Response.json({ object: 'EmailSent', tracking_id: 'trk-a1' }))
    const handler = stepsHandler(db, unipile)

    const confirmed = await post(handler, BETO, { action: 'confirm', sequenceId, stepId: 'a1' })
    assertEquals(confirmed.status, 200)
    assertEquals(confirmed.body.destination, 'maria@alfa.com.br')

    const sent = await post(handler, BETO, { action: 'send', sendId: confirmed.body.sendId })
    assertEquals(sent, { status: 200, body: { status: 'accepted' } })
    assertEquals(unipile.sends.length, 1)
    assertEquals(unipile.sends[0].form.get('account_id'), 'acc-beto-email')
    assertEquals(JSON.parse(String(unipile.sends[0].form.get('to'))), [
      { display_name: 'Maria Souza', identifier: 'maria@alfa.com.br' },
    ])
    assertEquals(await stepStatus(db, sequenceId), 'accepted')
  }))

Deno.test('outro participante não confirma nem dispara o passo do responsável', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    const unipile = simulatedUnipile()
    const handler = stepsHandler(db, unipile)

    assertEquals((await post(handler, EVA, { action: 'confirm', sequenceId, stepId: 'a1' })).status, 403)
    const confirmed = await post(handler, BETO, { action: 'confirm', sequenceId, stepId: 'a1' })
    assertEquals((await post(handler, EVA, { action: 'send', sendId: confirmed.body.sendId })).status, 403)
    assertEquals((await post(handler, null, { action: 'send', sendId: confirmed.body.sendId })).status, 401)
    assertEquals(unipile.sends.length, 0)
  }))

Deno.test('Destino mudado depois da confirmação: nada sai e o passo aguarda reconfirmação', () =>
  withTestDatabase(async (db) => {
    const { sequenceId, contactId } = await seedSequence(db)
    const unipile = simulatedUnipile()
    const handler = stepsHandler(db, unipile)

    const confirmed = await post(handler, BETO, { action: 'confirm', sequenceId, stepId: 'a1' })
    await db.run(`update public.contacts set email = 'maria@enriquecido.com.br' where id = '${contactId}'`)

    assertEquals(await post(handler, BETO, { action: 'send', sendId: confirmed.body.sendId }),
      { status: 200, body: { status: 'awaiting_reconfirmation' } })
    assertEquals(unipile.sends.length, 0)
  }))

Deno.test('tempo esgotado deixa o envio incerto, e a Althius reconcilia antes de qualquer reenvio', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    const unipile = simulatedUnipile()
    unipile.onSend(() => new Promise<Response>(() => {}))
    const handler = stepsHandler(db, unipile, 20)

    const confirmed = await post(handler, BETO, { action: 'confirm', sequenceId, stepId: 'a1' })
    assertEquals((await post(handler, BETO, { action: 'send', sendId: confirmed.body.sendId })).body, { status: 'uncertain' })

    // O e-mail tinha saído: a busca entre os enviados comprova a aceitação sem novo envio.
    unipile.onSearch(() => Response.json({ object: 'EmailList', items: [
      { id: 'email-a1', subject: 'Proposta para a Alfa', message_id: '<a1@mail.beto>', tracking_id: 'trk-a1' },
    ] }))
    assertEquals((await post(handler, BETO, { action: 'send', sendId: confirmed.body.sendId })).body, { status: 'accepted' })
    assertEquals(unipile.sends.length, 1)
  }))

Deno.test('sem prova no provedor, só a decisão do titular reenvia, com a mesma chave de idempotência', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    const unipile = simulatedUnipile()
    unipile.onSend(() => new Response('Bad gateway', { status: 502 }))
    const handler = stepsHandler(db, unipile)

    const confirmed = await post(handler, BETO, { action: 'confirm', sequenceId, stepId: 'a1' })
    const sendId = confirmed.body.sendId
    assertEquals((await post(handler, BETO, { action: 'send', sendId })).body, { status: 'uncertain' })
    assertEquals((await post(handler, BETO, { action: 'send', sendId })).body, { status: 'uncertain', decision: 'owner' })
    assertEquals(unipile.sends.length, 1)
    assertEquals((await post(handler, EVA, { action: 'resend', sendId })).status, 403)

    unipile.onSend(() => Response.json({ object: 'EmailSent', tracking_id: 'trk-a1' }))
    assertEquals((await post(handler, BETO, { action: 'resend', sendId })).body, { status: 'accepted' })
    assertEquals(unipile.sends.length, 2)
    assertEquals(unipile.sends[1].headers.get('Idempotency-Key'), unipile.sends[0].headers.get('Idempotency-Key'))
  }))

Deno.test('sem a Unipile configurada o passo não é reservado', () =>
  withTestDatabase(async (db) => {
    const { sequenceId } = await seedSequence(db)
    const handler = stepsHandler(db, null)

    const confirmed = await post(handler, BETO, { action: 'confirm', sequenceId, stepId: 'a1' })
    assertEquals((await post(handler, BETO, { action: 'send', sendId: confirmed.body.sendId })).status, 503)
    assertEquals(await stepStatus(db, sequenceId), 'confirmed')
  }))
