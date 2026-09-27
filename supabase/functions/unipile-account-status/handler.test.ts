import { assertEquals } from 'jsr:@std/assert@1'
import {
  attachmentContentType,
  attachmentPath,
  type AttachmentStore,
  createHandler,
  type Deps,
  type IngestedEmail,
  signWebhookBody,
  type WebhookDb,
  type WebhookUnipile,
} from './handler.ts'

const SECRET = 'segredo-de-teste'
const NOW = Date.UTC(2026, 8, 26, 15, 0, 0)

function fakeDb(
  ingested: IngestedEmail | Error = { outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] },
) {
  const calls: Record<string, unknown[]> = { complete: [], apply: [], ingest: [], attachment: [] }
  const db: WebhookDb = {
    completeSenderConnectionAttempt: async (input) => {
      calls.complete.push(input)
      return 'completed'
    },
    applyUnipileSenderStatus: async (accountId, status) => {
      calls.apply.push({ accountId, status })
      return true
    },
    ingestEmailEvent: async (input) => {
      calls.ingest.push(input)
      if (ingested instanceof Error) throw ingested
      return ingested
    },
    recordReceivedEmailAttachment: async (input) => {
      calls.attachment.push(input)
    },
  }
  return { db, calls }
}

function fakeUnipile(behaviour: 'ok' | 'fail' = 'ok') {
  const downloads: unknown[] = []
  const unipile: WebhookUnipile = {
    downloadEmailAttachment: async (accountId, emailId, attachment) => {
      downloads.push({ accountId, emailId, attachmentId: attachment.id, url: attachment.url })
      if (behaviour === 'fail') throw new Error('HTTP 500')
      return { bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }
    },
  }
  return { unipile, downloads }
}

function fakeStorage() {
  const uploads: { path: string; size: number; contentType: string | null }[] = []
  const storage: AttachmentStore = {
    upload: async (path, bytes, contentType) => {
      uploads.push({ path, size: bytes.length, contentType })
    },
  }
  return { storage, uploads }
}

function handlerWith(overrides: Partial<Deps> & Pick<Deps, 'db'>) {
  const background: Promise<unknown>[] = []
  const handle = createHandler({
    secret: SECRET,
    unipile: fakeUnipile().unipile,
    storage: fakeStorage().storage,
    now: () => NOW,
    waitUntil: (work) => {
      background.push(work)
    },
    log: () => {},
    ...overrides,
  })
  return { handle, background }
}

async function signedRequest(event: unknown, options: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(event)
  const timestamp = String(Math.floor((options.timestamp ?? NOW) / 1000))
  const signature = await signWebhookBody(body, timestamp, options.secret ?? SECRET)
  return new Request('https://functions.test/unipile-account-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'unipile-signature': `t=${timestamp},v0=${signature}` },
    body,
  })
}

const replyEmail = {
  id: 'email-r1',
  message_id: '<r1@empresa-alvo.test>',
  thread_id: 'thread-1',
  subject: 'Re: Apresentação',
  body: 'Podemos falar amanhã?',
  from: [{ email: 'maria@empresa-alvo.test', display_name: 'Maria Souza' }],
  headers: [{ name: 'In-Reply-To', value: '<msg-1@mail.gmail.com>' }],
  attachments: [{ id: 'att-1', name: 'proposta assinada.pdf', mime: 'application/pdf', size: 1234 }],
}

Deno.test('sem assinatura, a entrega é recusada', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(new Request('https://functions.test/x', { method: 'POST', body: '{}' }))
  assertEquals(res.status, 401)
  assertEquals(calls.ingest.length, 0)
})

Deno.test('assinatura com outro segredo é recusada', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(
    await signedRequest({ id: 'evt-1', type: 'email.new', account_id: 'acc-1', payload: { email: replyEmail } }, {
      secret: 'outro',
    }),
  )
  assertEquals(res.status, 401)
  assertEquals(calls.ingest.length, 0)
})

Deno.test('assinatura fora da janela de 5 minutos é recusada', async () => {
  const { db } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(
    await signedRequest({ type: 'account.status.running', account_id: 'acc-1' }, { timestamp: NOW - 6 * 60 * 1000 }),
  )
  assertEquals(res.status, 401)
})

Deno.test('evento de estado da conta continua indo para apply_unipile_sender_status', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(await signedRequest({ type: 'account.status.disconnected', account_id: 'acc-1' }))
  assertEquals(res.status, 200)
  assertEquals(calls.apply, [{ accountId: 'acc-1', status: 'CREDENTIALS' }])
})

Deno.test('account.add de um provedor sem sincronização inicial completa a tentativa e já marca a conta pronta', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const attempt = '7a1b2c3d-0000-4000-8000-000000000001'
  const res = await handle(
    await signedRequest({
      type: 'account.add',
      account_id: 'acc-1',
      payload: { state: attempt, account: { provider: 'google' } },
    }),
  )
  assertEquals(res.status, 200)
  assertEquals(calls.complete, [{
    attemptId: attempt,
    unipileAccountId: 'acc-1',
    provider: 'GOOGLE',
    initialStatus: 'CREATION_SUCCESS',
  }])
  assertEquals(calls.apply, [{ accountId: 'acc-1', status: 'SYNC_SUCCESS' }])
})

Deno.test('email.new vai para a ingestão com o id do evento, o Email e o endereço do titular; anexos baixam depois do 2xx', async () => {
  const ingested: IngestedEmail = {
    outcome: 'reply',
    interaction_id: 'inter-1',
    send_id: 'envio-1',
    attachments: [{
      id: 'att-1',
      url: 'https://api.unipile.com/v2/acc-1/emails/email-r1/attachments/att-1',
      name: 'proposta assinada.pdf',
      mime: 'application/pdf',
      status: 'pending',
    }],
  }
  const { db, calls } = fakeDb(ingested)
  const { unipile, downloads } = fakeUnipile()
  const { storage, uploads } = fakeStorage()
  const { handle, background } = handlerWith({ db, unipile, storage })
  const res = await handle(
    await signedRequest({
      id: 'evt-5',
      type: 'email.new',
      account_id: 'acc-1',
      account_name: 'Althius.Relacionamento@gmail.com',
      payload: { folder_id: 'INBOX', email: replyEmail },
    }),
  )
  assertEquals(res.status, 200)
  assertEquals(calls.ingest, [{
    eventId: 'evt-5',
    eventType: 'email.new',
    unipileAccountId: 'acc-1',
    email: replyEmail,
    ownerAddresses: ['althius.relacionamento@gmail.com'],
  }])
  assertEquals(background.length, 1)
  await Promise.all(background)
  assertEquals(downloads, [{
    accountId: 'acc-1',
    emailId: 'email-r1',
    attachmentId: 'att-1',
    url: 'https://api.unipile.com/v2/acc-1/emails/email-r1/attachments/att-1',
  }])
  assertEquals(uploads, [{
    path: 'recebidos/inter-1/att-1/proposta_assinada.pdf',
    size: 3,
    contentType: 'application/pdf',
  }])
  assertEquals(calls.attachment, [{
    interactionId: 'inter-1',
    attachmentId: 'att-1',
    storagePath: 'recebidos/inter-1/att-1/proposta_assinada.pdf',
    status: 'stored',
  }])
})

Deno.test('eco não baixa nada', async () => {
  const { db } = fakeDb({ outcome: 'echo', interaction_id: null, send_id: 'envio-1', attachments: [] })
  const { handle, background } = handlerWith({ db })
  const res = await handle(
    await signedRequest({ id: 'evt-1', type: 'email.new', account_id: 'acc-1', payload: { email: replyEmail } }),
  )
  assertEquals(res.status, 200)
  assertEquals(background.length, 0)
})

Deno.test('anexo que falha no download fica registrado como failed, sem derrubar a entrega', async () => {
  const { db, calls } = fakeDb({
    outcome: 'reply',
    interaction_id: 'inter-1',
    send_id: 'envio-1',
    attachments: [{ id: 'att-1', name: 'x.pdf' }],
  })
  const { unipile } = fakeUnipile('fail')
  const { handle, background } = handlerWith({ db, unipile })
  const res = await handle(
    await signedRequest({ id: 'evt-5', type: 'email.new', account_id: 'acc-1', payload: { email: replyEmail } }),
  )
  assertEquals(res.status, 200)
  await Promise.all(background)
  assertEquals(calls.attachment, [{
    interactionId: 'inter-1',
    attachmentId: 'att-1',
    storagePath: null,
    status: 'failed',
  }])
})

Deno.test('email.new.bounce vai para a ingestão como bounce', async () => {
  const { db, calls } = fakeDb({ outcome: 'bounce', interaction_id: null, send_id: 'envio-1', attachments: [] })
  const { handle } = handlerWith({ db })
  const res = await handle(
    await signedRequest({ id: 'evt-9', type: 'email.new.bounce', account_id: 'acc-1', payload: { email: replyEmail } }),
  )
  assertEquals(res.status, 200)
  assertEquals((calls.ingest[0] as { eventType: string }).eventType, 'email.new.bounce')
})

Deno.test('email.new sem o objeto Email é inválido', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(
    await signedRequest({ id: 'evt-1', type: 'email.new', account_id: 'acc-1', payload: { folder_id: 'INBOX' } }),
  )
  assertEquals(res.status, 400)
  assertEquals(calls.ingest.length, 0)
})

Deno.test('erro na ingestão devolve 500 para a Unipile tentar de novo', async () => {
  const { db } = fakeDb(new Error('db down'))
  const { handle } = handlerWith({ db })
  const res = await handle(
    await signedRequest({ id: 'evt-1', type: 'email.new', account_id: 'acc-1', payload: { email: replyEmail } }),
  )
  assertEquals(res.status, 500)
})

Deno.test('evento v2 sem equivalente é reconhecido e ignorado', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(await signedRequest({ type: 'account.status.degraded', account_id: 'acc-1' }))
  assertEquals(res.status, 200)
  assertEquals(calls.apply.length, 0)
})

Deno.test('o caminho do anexo não deixa passar nomes nem ids perigosos', async () => {
  assertEquals(await attachmentPath('i', 'a', '../../etc/passwd'), 'recebidos/i/a/.._.._etc_passwd')
  assertEquals(await attachmentPath('i', '../x', '..'), 'recebidos/i/.._x/anexo')
})

Deno.test('ids longos do Outlook com o mesmo começo não dividem o caminho', async () => {
  const prefix = 'AAMkAGI2' + 'x'.repeat(200)
  const a = await attachmentPath('i', prefix + 'A=', 'image.png')
  const b = await attachmentPath('i', prefix + 'B=', 'image.png')
  assertEquals(a === b, false)
  assertEquals(/^recebidos\/i\/[0-9a-f]{64}\/image\.png$/.test(a), true)
})

Deno.test('o anexo guarda um tipo útil mesmo quando o download chega genérico', () => {
  assertEquals(attachmentContentType('image/png', { name: 'x.bin' }), 'image/png')
  assertEquals(attachmentContentType('application/octet-stream', { name: 'image.png', mime: 'image/png' }), 'image/png')
  assertEquals(attachmentContentType('application/octet-stream', { name: 'image.PNG' }), 'image/png')
  assertEquals(attachmentContentType(null, { name: 'proposta.pdf' }), 'application/pdf')
  assertEquals(attachmentContentType(null, { name: 'planilha.xlsx' }), null)
})
