// Eventos message.* no receptor do webhook (canais-06, parte 1): reconhecidos com 200, sem criar Interação, pausa nem
// nada compartilhado, e com a captura de formato desligada por padrão. A parte 2 (receber respostas) espera o JSON real.
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import { createHandler, type Deps, type WebhookDb } from './handler.ts'
import { signWebhookBody } from './handler.ts'

const SECRET = 'segredo-de-teste'
const NOW = Date.UTC(2026, 8, 29, 15, 0, 0)

function fakeDb() {
  const calls: string[] = []
  const db: WebhookDb = {
    completeSenderConnectionAttempt: async () => {
      calls.push('complete')
      return 'completed'
    },
    applyUnipileSenderStatus: async () => {
      calls.push('apply')
      return true
    },
    ingestEmailEvent: async () => {
      calls.push('ingest')
      return { outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }
    },
    recordReceivedEmailAttachment: async () => {
      calls.push('attachment')
    },
  }
  return { db, calls }
}

function handlerWith(overrides: Partial<Deps> = {}) {
  const logs: Record<string, unknown>[] = []
  const { db, calls } = fakeDb()
  const handle = createHandler({
    secret: SECRET,
    db,
    unipile: { downloadEmailAttachment: () => Promise.reject(new Error('não deveria baixar')) },
    storage: { upload: () => Promise.reject(new Error('não deveria gravar')) },
    now: () => NOW,
    waitUntil: () => {},
    log: (fields) => logs.push(fields),
    ...overrides,
  })
  return { handle, calls, logs }
}

async function signedRequest(event: unknown, secret = SECRET) {
  const body = JSON.stringify(event)
  const timestamp = String(Math.floor(NOW / 1000))
  const signature = await signWebhookBody(body, timestamp, secret)
  return new Request('https://functions.test/unipile-account-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'unipile-signature': `t=${timestamp},v0=${signature}` },
    body,
  })
}

const MENSAGEM = {
  id: 'evt_msg_1',
  type: 'message.new',
  account_id: 'acc_conta_secreta',
  payload: {
    id: 'msg_1',
    chat_id: '5511987654321@s.whatsapp.net',
    direction: 'inbound',
    text: 'Oi, aqui é o João da Silva, meu telefone é 11 98765-4321',
    sender: { name: 'João da Silva', phone: '+5511987654321' },
  },
}

Deno.test('message.new é reconhecido com 200 e não cria nem pausa nada', async () => {
  const { handle, calls, logs } = handlerWith()
  const res = await handle(await signedRequest(MENSAGEM))
  assertEquals(res.status, 200)
  assertEquals(calls, [], 'nenhuma RPC: nem ingestão, nem estado da conta, nem conexão')
  assertEquals(logs.length, 1)
  assertEquals(logs[0].outcome, 'message_event_acknowledged')
  assertEquals(logs[0].shape, 'not_stored')
})

Deno.test('cada tipo message.* é reconhecido do mesmo jeito', async () => {
  for (
    const type of [
      'message.update',
      'message.delete',
      'message.delivery',
      'message.receipt.read',
      'message.reaction.new',
    ]
  ) {
    const { handle, calls } = handlerWith()
    const res = await handle(await signedRequest({ ...MENSAGEM, type }))
    assertEquals(res.status, 200, type)
    assertEquals(calls, [], type)
  }
})

Deno.test('um evento de mensagem sem account_id também é reconhecido (nada depende dele)', async () => {
  const { handle, calls } = handlerWith()
  const res = await handle(await signedRequest({ id: 'evt_2', type: 'message.receipt.read', payload: {} }))
  assertEquals(res.status, 200)
  assertEquals(calls, [])
})

Deno.test('a assinatura continua obrigatória para os eventos de mensagem', async () => {
  const captured: unknown[] = []
  const { handle, calls } = handlerWith({ captureShape: (...args) => Promise.resolve(captured.push(args) > 0) })
  const semAssinatura = await handle(
    new Request('https://functions.test/x', { method: 'POST', body: JSON.stringify(MENSAGEM) }),
  )
  assertEquals(semAssinatura.status, 401)
  const outroSegredo = await handle(await signedRequest(MENSAGEM, 'outro'))
  assertEquals(outroSegredo.status, 401)
  assertEquals(captured, [], 'sem assinatura válida nada é guardado')
  assertEquals(calls, [])
})

Deno.test('sem a captura ligada, nada do corpo é guardado', async () => {
  const { handle } = handlerWith({ captureShape: undefined })
  const res = await handle(await signedRequest(MENSAGEM))
  assertEquals(res.status, 200)
})

Deno.test('com a captura ligada, só o formato censurado é entregue para guardar, com o tipo do evento', async () => {
  const captured: { type: string; shape: Record<string, unknown> }[] = []
  const { handle, calls, logs } = handlerWith({
    captureShape: (type, shape) => {
      captured.push({ type, shape })
      return Promise.resolve(true)
    },
  })
  const res = await handle(await signedRequest(MENSAGEM))
  assertEquals(res.status, 200)
  assertEquals(calls, [], 'guardar o formato não cria Interação, pausa nem nada compartilhado')
  assertEquals(captured.length, 1)
  assertEquals(captured[0].type, 'message.new')
  const guardado = JSON.stringify(captured[0].shape)
  for (
    const pessoal of [
      'João',
      'Silva',
      '5511987654321',
      '98765',
      's.whatsapp.net',
      'acc_conta_secreta',
      'msg_1',
      'Oi, aqui',
    ]
  ) {
    assertFalse(guardado.includes(pessoal), `"${pessoal}" chegou ao banco: ${guardado}`)
  }
  assert(guardado.includes('"direction":"inbound"'), 'o token de enumeração fica')
  assert(guardado.includes('"type":"message.new"'))
  assertEquals(logs[0].shape, 'stored')
  assertFalse(JSON.stringify(logs).includes('João'), 'o log também não carrega conteúdo')
})

Deno.test('uma falha ao guardar o formato não derruba a entrega: a Unipile não precisa reentregar', async () => {
  const { handle, logs } = handlerWith({ captureShape: () => Promise.reject(new Error('banco fora do ar')) })
  const res = await handle(await signedRequest(MENSAGEM))
  assertEquals(res.status, 200)
  assertEquals(logs[0].shape, 'error')
  assertFalse(JSON.stringify(logs).includes('banco fora do ar'))
})

Deno.test('captura desligada ou cheia (devolve false) só fica registrada como não guardada', async () => {
  const { handle, logs } = handlerWith({ captureShape: () => Promise.resolve(false) })
  const res = await handle(await signedRequest(MENSAGEM))
  assertEquals(res.status, 200)
  assertEquals(logs[0].shape, 'not_stored')
})

Deno.test('um formato grande demais não é guardado', async () => {
  let chamadas = 0
  const { handle, logs } = handlerWith({
    captureShape: () => {
      chamadas++
      return Promise.resolve(true)
    },
  })
  const enorme: Record<string, unknown> = {}
  for (let i = 0; i < 4000; i++) enorme[`campo_${i}`] = { a: 1, b: true }
  const res = await handle(await signedRequest({ ...MENSAGEM, payload: enorme }))
  assertEquals(res.status, 200)
  assertEquals(chamadas, 0)
  assertEquals(logs[0].shape, 'not_stored')
})

Deno.test('o tipo do evento tem de ter o formato esperado para ser guardado', async () => {
  let chamadas = 0
  const { handle } = handlerWith({
    captureShape: () => {
      chamadas++
      return Promise.resolve(true)
    },
  })
  const res = await handle(await signedRequest({ ...MENSAGEM, type: 'message.NOVA; drop' }))
  assertEquals(res.status, 200)
  assertEquals(chamadas, 0)
})

Deno.test('os eventos de e-mail e de conta seguem como antes, com a captura ligada', async () => {
  const captured: unknown[] = []
  const { handle, calls } = handlerWith({ captureShape: (...args) => Promise.resolve(captured.push(args) > 0) })
  const conta = await handle(await signedRequest({ type: 'account.status.disconnected', account_id: 'acc-1' }))
  assertEquals(conta.status, 200)
  const email = await handle(
    await signedRequest({
      id: 'evt-1',
      type: 'email.new',
      account_id: 'acc-1',
      payload: { email: { id: 'email-1', subject: 'Oi' } },
    }),
  )
  assertEquals(email.status, 200)
  assertEquals(calls, ['apply', 'ingest'])
  assertEquals(captured, [], 'só eventos de mensagem passam pela captura')
})
