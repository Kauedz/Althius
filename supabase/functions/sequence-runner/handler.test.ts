import { assertEquals } from 'jsr:@std/assert@1'
import type { EmailSent, OutgoingEmail, ReleaseResult, UnipileMail } from '../_shared/send-step.ts'
import { UnipileRequestError } from '../_shared/send-step.ts'
import { retryAfterSeconds } from '../_shared/send-step-adapters.ts'
import {
  type ConversationToReconcile,
  createHandler,
  type Deps,
  type DueSend,
  type RunnerDb,
  type SenderToReconcile,
} from './handler.ts'

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

interface ReconciliationOptions {
  accounts?: SenderToReconcile[]
  conversations?: Record<string, ConversationToReconcile[] | Error>
  /** Quantas conversas cada página traz (o banco usa 25). */
  pageSize?: number
  /** O desfecho de guardar o progresso: false quando a conta caiu de novo. */
  progressHolds?: boolean
  /** O desfecho da ingestão por id do e-mail da conversa. */
  ingest?: Record<string, string>
}

function fakeDb(
  due: DueSend[],
  releases: Record<string, ReleaseResult | Error> = {},
  reconciliation: ReconciliationOptions = {},
) {
  const recorded: Parameters<RunnerDb['recordStepSendResult']>[0][] = []
  const released: string[] = []
  const conversations: string[] = []
  const finished: { senderAccountId: string; claimedAt: string }[] = []
  const progress = new Map<string, string>()
  const pages: string[] = []
  const ingested: string[] = []
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
    ingestEmailEvent: async (input) => {
      ingested.push(String(input.email.id))
      return {
        outcome: reconciliation.ingest?.[String(input.email.id)] ?? 'unrelated',
        interaction_id: null,
        send_id: null,
        attachments: [],
      }
    },
    recordStepSendResult: async (input) => {
      recorded.push(input)
    },
    claimSenderReconciliations: async () => reconciliation.accounts ?? [],
    // Como o banco: a próxima página começa depois da última conversa guardada no progresso.
    conversationsToReconcile: async (senderAccountId) => {
      const found = reconciliation.conversations?.[senderAccountId] ?? []
      if (found instanceof Error) throw found
      const after = progress.get(senderAccountId)
      const start = after ? found.findIndex((c) => c.send_id === after) + 1 : 0
      return found.slice(start, start + (reconciliation.pageSize ?? 25))
    },
    recordReconciliationProgress: async (senderAccountId, _claimedAt, checked) => {
      pages.push(checked.send_id)
      if (reconciliation.progressHolds === false) return false
      progress.set(senderAccountId, checked.send_id)
      return true
    },
    finishSenderReconciliation: async (senderAccountId, claimedAt) => {
      finished.push({ senderAccountId, claimedAt })
      return true
    },
  }
  return { db, recorded, released, conversations, finished, ingested, pages, claims: () => claims }
}

function fakeUnipile(behaviour: EmailSent | Error, threads: Record<string, Record<string, unknown>[] | Error> = {}) {
  const sent: { accountId: string; email: OutgoingEmail }[] = []
  const unipile: UnipileMail = {
    getEmail: async (_accountId, emailId) => ({ id: emailId }),
    listThreadEmails: async (_accountId, threadId) => {
      const found = threads[threadId] ?? []
      if (found instanceof Error) throw found
      return found
    },
    listEmailSenders: async () => ['titular@cliente.com.br'],
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

Deno.test('retenção da Conta e envio em trânsito não chamam a Unipile de novo', async () => {
  const { db, recorded } = fakeDb(
    [{ send_id: SEND_1, owner_user_id: TITULAR }, { send_id: SEND_2, owner_user_id: TITULAR }],
    {
      [SEND_1]: { outcome: 'account_retained', send_id: SEND_1 },
      [SEND_2]: { outcome: 'in_flight', send_id: SEND_2 },
    },
  )
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished, logs } = runner(db, unipile)
  await handle(call())
  await finished()
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
  assertEquals(logs.map((l) => l.outcome), ['account_retained', 'in_flight'])
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

const CONTA = '70000000-0000-0000-0000-000000000009'
const RESERVA = '2026-09-28T12:00:00Z'
const contaParaReconciliar: SenderToReconcile = {
  sender_account_id: CONTA,
  unipile_account_id: 'unipile-google-1',
  claimed_at: RESERVA,
}
const conversa = (thread: string): ConversationToReconcile => ({
  send_id: `envio-${thread}`,
  provider_thread_id: thread,
  provider_email_id: null,
  sent_at: '2026-09-25T12:00:00Z',
})

Deno.test('depois da reconexão, as conversas são conferidas e a conta volta a enviar', async () => {
  const { db, finished, ingested } = fakeDb([], {}, {
    accounts: [contaParaReconciliar],
    conversations: { [CONTA]: [conversa('t-1'), conversa('t-2')] },
    ingest: { 'resposta-perdida': 'reply' },
  })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null }, {
    't-1': [{ id: 'enviado-1' }],
    't-2': [{ id: 'enviado-2' }, { id: 'resposta-perdida' }],
  })
  const { handle, finished: done, logs } = runner(db, unipile)
  await handle(call())
  await done()
  // A resposta que chegou com a conta fora do ar é gravada pela mesma ingestão (que pausa a Sequência).
  assertEquals(ingested, ['enviado-1', 'enviado-2', 'resposta-perdida'])
  assertEquals(finished, [{ senderAccountId: CONTA, claimedAt: RESERVA }])
  assertEquals(logs, [{ type: 'reconcile', senderAccountId: CONTA, checked: 2, replies: 1, outcome: 'ready' }])
})

Deno.test('sem conseguir conferir uma conversa, a conta continua bloqueada para tentar de novo', async () => {
  const { db, finished } = fakeDb([], {}, {
    accounts: [contaParaReconciliar],
    conversations: { [CONTA]: [conversa('t-1'), conversa('t-2')] },
  })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null }, { 't-1': [], 't-2': new Error('Unipile fora') })
  const { handle, finished: done, logs } = runner(db, unipile)
  await handle(call())
  await done()
  assertEquals(finished, [])
  assertEquals(logs, [{
    type: 'reconcile',
    senderAccountId: CONTA,
    checked: 1,
    replies: 0,
    outcome: 'check_failed',
  }])
})

Deno.test('uma conta sem conversas a conferir volta a enviar sem chamar a Unipile', async () => {
  const { db, finished } = fakeDb([], {}, { accounts: [contaParaReconciliar], conversations: {} })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  unipile.listEmailSenders = () => Promise.reject(new Error('não deveria chamar'))
  const { handle, finished: done } = runner(db, unipile)
  await handle(call())
  await done()
  assertEquals(finished, [{ senderAccountId: CONTA, claimedAt: RESERVA }])
})

Deno.test('a reconciliação vem antes dos envios da mesma rodada', async () => {
  const order: string[] = []
  const { db } = fakeDb([{ send_id: SEND_1, owner_user_id: TITULAR }], { [SEND_1]: released(SEND_1) }, {
    accounts: [contaParaReconciliar],
  })
  const finish = db.finishSenderReconciliation
  db.finishSenderReconciliation = (id, at) => {
    order.push('reconcile')
    return finish(id, at)
  }
  const release = db.releaseDueSend
  db.releaseDueSend = (id) => {
    order.push('send')
    return release(id)
  }
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished: done } = runner(db, unipile)
  await handle(call())
  await done()
  assertEquals(order, ['reconcile', 'send'])
})

Deno.test('muitas conversas vão em páginas, guardando até onde foi, até todas serem conferidas', async () => {
  const conversas = Array.from({ length: 5 }, (_, i) => conversa(`t-${i}`))
  const { db, finished, pages } = fakeDb([], {}, {
    accounts: [contaParaReconciliar],
    conversations: { [CONTA]: conversas },
    pageSize: 2,
  })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished: done } = runner(db, unipile)
  await handle(call())
  await done()
  assertEquals(pages, ['envio-t-1', 'envio-t-3', 'envio-t-4'])
  assertEquals(finished, [{ senderAccountId: CONTA, claimedAt: RESERVA }])
})

Deno.test('sem tempo na rodada, a reconciliação para onde está e continua na próxima', async () => {
  const conversas = Array.from({ length: 4 }, (_, i) => conversa(`t-${i}`))
  const { db, finished, pages } = fakeDb([], {}, {
    accounts: [contaParaReconciliar],
    conversations: { [CONTA]: conversas },
    pageSize: 2,
  })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  let relogio = 0
  const { handle, finished: done, logs } = runner(db, unipile, {
    reconcileBudgetMs: 1_000,
    now: () => {
      relogio += 600
      return relogio
    },
  })
  await handle(call())
  await done()
  assertEquals(pages, ['envio-t-1'])
  assertEquals(finished, [])
  assertEquals(logs[0].outcome, 'continues_next_round')
})

Deno.test('uma conversa que não existe mais na Unipile conta como conferida', async () => {
  const { db, finished } = fakeDb([], {}, {
    accounts: [contaParaReconciliar],
    conversations: { [CONTA]: [conversa('apagada'), conversa('t-2')] },
  })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null }, { apagada: new UnipileRequestError(404) })
  const { handle, finished: done } = runner(db, unipile)
  await handle(call())
  await done()
  assertEquals(finished, [{ senderAccountId: CONTA, claimedAt: RESERVA }])
})

Deno.test('se a conta caiu de novo durante a reconciliação, ela não é liberada', async () => {
  const { db, finished } = fakeDb([], {}, {
    accounts: [contaParaReconciliar],
    conversations: { [CONTA]: [conversa('t-1')] },
    progressHolds: false,
  })
  const { unipile } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished: done, logs } = runner(db, unipile)
  await handle(call())
  await done()
  assertEquals(finished, [])
  assertEquals(logs[0].outcome, 'dropped_again')
})

Deno.test('o passo sai com o rodapé de descadastro no corpo e o List-Unsubscribe de um clique no cabeçalho', async () => {
  const { db } = fakeDb(
    [{ send_id: SEND_1, owner_user_id: TITULAR }],
    { [SEND_1]: { ...released(SEND_1), unsubscribe_token: 'tok123' } as ReleaseResult },
  )
  const { unipile, sent } = fakeUnipile({ id: 'email-abc', message_id: null })
  const { handle, finished } = runner(db, unipile, {
    unsubscribeLinks: {
      page: (token) => `https://app.test/descadastro?t=${token}`,
      oneClick: (token) => `https://fn.test/functions/v1/descadastro?t=${token}`,
    },
  })
  await handle(call())
  await finished()

  const email = sent[0].email
  assertEquals(email.plain_text.startsWith('Olá, Maria.'), true)
  assertEquals(email.plain_text.includes('https://app.test/descadastro?t=tok123'), true)
  assertEquals(email.plain_text.includes(SEND_1), false)
  assertEquals(email.custom_headers, [
    { name: 'X-Althius-Envio', value: SEND_1 },
    { name: 'List-Unsubscribe', value: '<https://fn.test/functions/v1/descadastro?t=tok123>' },
    { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
  ])
})

Deno.test('Contato descadastrado ou variável sem valor: o banco barra e a Unipile nem é chamada', async () => {
  const { db, recorded } = fakeDb(
    [{ send_id: SEND_1, owner_user_id: TITULAR }, { send_id: SEND_2, owner_user_id: TITULAR }],
    {
      [SEND_1]: { outcome: 'contact_suppressed', send_id: SEND_1 },
      [SEND_2]: { outcome: 'missing_variable', send_id: SEND_2 },
    },
  )
  const { unipile, sent } = fakeUnipile({ id: 'e1', message_id: null })
  const { handle, finished } = runner(db, unipile)
  await handle(call())
  await finished()
  assertEquals(sent.length, 0)
  assertEquals(recorded.length, 0)
})
