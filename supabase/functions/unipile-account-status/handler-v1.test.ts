// O webhook com a conexão ativa em v1 (canais-17): autenticação pelo contrato da v1, tradução para a forma canônica e só então
// as operações do banco, que não mudam. Também a regra que vale nas duas versões: evento de conta que não é da conexão
// ativa devolve 200 e não toca o banco.
import { assertEquals } from 'jsr:@std/assert@1'
import type { IngestChatEventInput } from '../_shared/ingest-chat-event.ts'
import type { IngestEmailEventInput } from '../_shared/ingest-email-event.ts'
import type { AccountDirectory, AccountLookup } from '../_shared/unipile/account-directory.ts'
import { connectionNoticeKey } from '../_shared/unipile/webhook-auth.ts'
import { createHandler, signWebhookBody, type Deps, type WebhookDb } from './handler.ts'

const SECRET = 'segredo-v1-de-teste-com-mais-de-16'
const PEDIDO = 'f6000000-0000-0000-0000-000000000001'
const NOW = Date.UTC(2026, 9, 9, 15, 0, 0)

function fakeDb() {
  const calls = {
    complete: [] as unknown[],
    apply: [] as unknown[],
    hold: [] as string[],
    email: [] as IngestEmailEventInput[],
    chat: [] as IngestChatEventInput[],
  }
  const db: WebhookDb = {
    completeSenderConnectionAttempt: async (input) => {
      calls.complete.push(input)
      return 'completed'
    },
    applyUnipileSenderStatus: async (accountId, status) => {
      calls.apply.push({ accountId, status })
      return true
    },
    holdSequencesOfLostSender: async (accountId) => {
      calls.hold.push(accountId)
      return 1
    },
    ingestEmailEvent: async (input) => {
      calls.email.push(input)
      return { outcome: 'reply', interaction_id: 'int-1', send_id: 'send-1', attachments: [] }
    },
    ingestChatEvent: async (input) => {
      calls.chat.push(input)
      return { outcome: 'reply', interaction_id: 'int-1', send_id: 'send-1' }
    },
    recordReceivedEmailAttachment: async () => {},
  }
  const touched = () => Object.values(calls).some((list) => list.length > 0)
  return { db, calls, touched }
}

/** Um diretório de contas combinado: o que cada id responde; o resto é da conexão ativa com o provedor dado. */
function directory(answers: Record<string, AccountLookup> = {}, fallback: AccountLookup = { status: 'member', provider: 'LINKEDIN' }) {
  const asked: string[] = []
  const dir: AccountDirectory = {
    lookup: async (accountId) => {
      asked.push(accountId)
      return answers[accountId] ?? fallback
    },
  }
  return { dir, asked }
}

function handlerWith(overrides: Partial<Deps> & Pick<Deps, 'db'>) {
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    secret: SECRET,
    version: 'v1',
    unipile: { downloadEmailAttachment: async () => ({ bytes: new Uint8Array(), contentType: null }) },
    storage: { upload: async () => {} },
    now: () => NOW,
    waitUntil: () => {},
    log: (fields) => logs.push(fields),
    ...overrides,
  })
  return { handle, logs }
}

const post = (body: unknown, headers: Record<string, string> = {}, query = '') =>
  new Request(`https://functions.test/unipile-account-status${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
const authed = (body: unknown) => post(body, { 'Unipile-Auth': SECRET })

const linkedinMessage = (extra: Record<string, unknown> = {}) => ({
  event: 'message_received',
  account_id: 'acc1',
  account_type: 'LINKEDIN',
  chat_id: 'chat1',
  message_id: 'm1',
  message: 'Tenho interesse',
  sender: { attendee_provider_id: 'ACoAAA1' },
  attendees: [{}, {}],
  account_info: { user_id: 'ACoDONO' },
  ...extra,
})
const mail = { event: 'mail_received', account_id: 'acc2', email_id: 'e9', from_attendee: { identifier: 'jonas@serra.test' }, subject: 'Re: x', body_plain: 'ok' }
const notice = { status: 'CREATION_SUCCESS', account_id: 'acc7', name: PEDIDO }
const noticeUrl = async (pedido = PEDIDO) => `?k=${await connectionNoticeKey(SECRET, pedido)}`

Deno.test('v1: sem cabeçalho, com cabeçalho errado ou sem segredo configurado, a entrega é recusada antes de ler o corpo', async () => {
  const { db, touched } = fakeDb()
  const { handle } = handlerWith({ db })
  assertEquals((await handle(post(linkedinMessage()))).status, 401)
  assertEquals((await handle(post(linkedinMessage(), { 'Unipile-Auth': 'errado' }))).status, 401)
  // Um corpo que nem é JSON: se a conferência vem antes do parse, o resultado é 401, não 400.
  const garbage = await handle(
    new Request('https://functions.test/x', { method: 'POST', headers: { 'Unipile-Auth': 'errado' }, body: '{não é json' }),
  )
  assertEquals(garbage.status, 401)
  const semSegredo = handlerWith({ db, secret: '' })
  assertEquals((await semSegredo.handle(authed(linkedinMessage()))).status, 401)
  assertEquals(touched(), false)
})

Deno.test('v1: a assinatura da v2 não autentica um webhook v1 (e o cabeçalho da v1 não autentica um v2)', async () => {
  const { db, touched } = fakeDb()
  const body = JSON.stringify(linkedinMessage())
  const t = String(Math.floor(NOW / 1000))
  const signature = await signWebhookBody(body, t, SECRET)
  const { handle } = handlerWith({ db })
  const res = await handle(new Request('https://functions.test/x', { method: 'POST', headers: { 'unipile-signature': `t=${t},v0=${signature}` }, body }))
  assertEquals(res.status, 401)
  const v2 = handlerWith({ db, version: 'v2' })
  assertEquals((await v2.handle(authed({ id: 'e', type: 'account.status.running', account_id: 'acc1' }))).status, 401)
  assertEquals(touched(), false)
})

Deno.test('v1 message_received: vai para a ingestão de conversa traduzido, com o id do evento prefixado pela conta', async () => {
  const { db, calls } = fakeDb()
  const { dir } = directory()
  const { handle } = handlerWith({ db, accounts: dir })
  const res = await handle(authed(linkedinMessage()))
  assertEquals(res.status, 200)
  assertEquals(calls.chat.length, 1)
  assertEquals(calls.chat[0].eventId, 'acc1:m1')
  assertEquals(calls.chat[0].eventType, 'message.new')
  assertEquals(calls.chat[0].unipileAccountId, 'acc1')
  assertEquals(calls.chat[0].payload.id, 'm1')
  assertEquals(calls.chat[0].payload.sender_id, 'ACoAAA1')
  assertEquals(calls.chat[0].payload.is_sender, false)
  assertEquals(calls.email.length + calls.apply.length, 0)
})

Deno.test('v1 replay: a mesma mensagem entregue duas vezes chega ao banco com o mesmo id de evento (é ele que deduplica)', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  await handle(authed(linkedinMessage()))
  await handle(authed(linkedinMessage()))
  assertEquals(calls.chat.map((c) => c.eventId), ['acc1:m1', 'acc1:m1'])
  // O mesmo id de mensagem em outra conta é outro evento.
  await handle(authed(linkedinMessage({ account_id: 'acc9' })))
  assertEquals(calls.chat[2].eventId, 'acc9:m1')
})

Deno.test('v1 message_received: mensagem própria, grupo, anúncio e canal sem suporte são confirmados com 200 e não tocam o banco', async () => {
  const { db, touched } = fakeDb()
  const { handle, logs } = handlerWith({ db })
  for (
    const extra of [
      { sender: { attendee_provider_id: 'ACoDONO' } },
      { attendees: [{}, {}, {}] },
      { content_type: 'sponsored' },
      { account_type: 'INSTAGRAM' },
      { is_event: true },
    ]
  ) {
    assertEquals((await handle(authed(linkedinMessage(extra)))).status, 200)
  }
  assertEquals(touched(), false)
  assertEquals(logs.every((fields) => fields.outcome === 'ignored'), true)
})

Deno.test('v1 mail_received: vai para a ingestão de e-mail com o id do evento prefixado e o Email no formato que o banco lê', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(authed(mail))
  assertEquals(res.status, 200)
  assertEquals(calls.email.length, 1)
  assertEquals(calls.email[0].eventId, 'acc2:e9')
  assertEquals(calls.email[0].eventType, 'email.new')
  assertEquals(calls.email[0].email.id, 'e9')
  assertEquals(calls.email[0].email.from, { email: 'jonas@serra.test' })
})

Deno.test('v1 estado da conta: attention grava a queda e pausa as Sequências; connected só grava; passageiro e desconhecido não fazem nada', async () => {
  const { db, calls, touched } = fakeDb()
  const { handle } = handlerWith({ db })
  const state = (message: string) => authed({ AccountStatus: { account_id: 'acc1', account_type: 'LINKEDIN', message } })
  assertEquals((await handle(state('CREDENTIALS'))).status, 200)
  assertEquals(calls.apply, [{ accountId: 'acc1', status: 'CREDENTIALS' }])
  assertEquals(calls.hold, ['acc1'])
  assertEquals((await handle(state('OK'))).status, 200)
  assertEquals(calls.apply[1], { accountId: 'acc1', status: 'OK' })
  assertEquals(calls.hold.length, 1)
  const quiet = fakeDb()
  const second = handlerWith({ db: quiet.db })
  assertEquals((await second.handle(state('CONNECTING'))).status, 200)
  assertEquals((await second.handle(state('ALGO_NOVO'))).status, 200)
  assertEquals(quiet.touched(), false)
  assertEquals(touched(), true)
})

Deno.test('v1 new_relation: chega ao banco só para registro', async () => {
  const { db, calls } = fakeDb()
  const { handle } = handlerWith({ db })
  const res = await handle(authed({ event: 'new_relation', account_id: 'acc1', user_provider_id: 'ACoJ', user_public_identifier: 'joao' }))
  assertEquals(res.status, 200)
  assertEquals(calls.chat[0].eventType, 'new_relation')
  assertEquals(calls.chat[0].eventId, 'acc1:new_relation:ACoJ')
  assertEquals(calls.chat[0].payload, { public_identifier: 'joao', provider_id: 'ACoJ' })
})

Deno.test('v1 aviso do link de conexão: com a chave do endereço do pedido conclui a tentativa, com o provedor da lista de contas', async () => {
  const { db, calls } = fakeDb()
  const { dir, asked } = directory({ acc7: { status: 'member', provider: 'GOOGLE_OAUTH' } })
  const { handle } = handlerWith({ db, accounts: dir })
  const res = await handle(post(notice, {}, await noticeUrl()))
  assertEquals(res.status, 200)
  assertEquals(calls.complete, [{ attemptId: PEDIDO, unipileAccountId: 'acc7', provider: 'GOOGLE', initialStatus: 'CREATION_SUCCESS' }])
  // E-mail do Google não espera a sincronização: a conta já é marcada pronta para a reconciliação.
  assertEquals(calls.apply, [{ accountId: 'acc7', status: 'SYNC_SUCCESS' }])
  assertEquals(asked, ['acc7'])
})

Deno.test('v1 aviso do link de conexão: WhatsApp espera o aviso de sincronização; o cabeçalho também autentica o aviso', async () => {
  const { db, calls } = fakeDb()
  const { dir } = directory({ acc7: { status: 'member', provider: 'WHATSAPP' } })
  const { handle } = handlerWith({ db, accounts: dir })
  assertEquals((await handle(authed({ ...notice, status: 'RECONNECTED' }))).status, 200)
  assertEquals(calls.complete, [{ attemptId: PEDIDO, unipileAccountId: 'acc7', provider: 'WHATSAPP', initialStatus: 'RECONNECTED' }])
  assertEquals(calls.apply, [])
})

Deno.test('v1 a chave do endereço vale só para o evento de conexão: mensagem, e-mail e estado com ?k= recebem 401', async () => {
  const { db, touched } = fakeDb()
  const { handle } = handlerWith({ db })
  const query = await noticeUrl()
  for (const body of [{ ...linkedinMessage(), name: PEDIDO }, { ...mail, name: PEDIDO }, { account_id: 'acc1', account_type: 'X', message: 'DELETED', name: PEDIDO }]) {
    assertEquals((await handle(post(body, {}, query))).status, 401)
  }
  assertEquals(touched(), false)
})

Deno.test('v1 chave do endereço de outro pedido, ou de outro segredo: 401 e nada vai ao banco', async () => {
  const { db, touched } = fakeDb()
  const { handle } = handlerWith({ db })
  assertEquals((await handle(post(notice, {}, await noticeUrl('f6000000-0000-0000-0000-0000000000ff')))).status, 401)
  assertEquals((await handle(post(notice, {}, `?k=${await connectionNoticeKey('outro-segredo', PEDIDO)}`))).status, 401)
  assertEquals((await handle(post(notice, {}, '?k=lixo'))).status, 401)
  assertEquals(touched(), false)
})

Deno.test('v1 aviso de conexão sem pedido nosso, ou de um provedor que a Althius não conecta: 200 sem tocar o banco', async () => {
  const { db, touched } = fakeDb()
  const { dir } = directory({ acc7: { status: 'member', provider: 'TELEGRAM' } })
  const { handle } = handlerWith({ db, accounts: dir })
  assertEquals((await handle(authed({ ...notice, name: 'qualquer-coisa' }))).status, 200)
  assertEquals((await handle(authed(notice))).status, 200)
  assertEquals(touched(), false)
})

Deno.test('v1 aviso de conexão sem como descobrir o provedor (lista indisponível): 503, a Unipile entrega de novo, nada é gravado', async () => {
  const { db, touched } = fakeDb()
  const { dir } = directory({}, { status: 'unknown' })
  const { handle } = handlerWith({ db, accounts: dir })
  assertEquals((await handle(authed(notice))).status, 503)
  const semDiretorio = handlerWith({ db })
  assertEquals((await semDiretorio.handle(authed(notice))).status, 503)
  assertEquals(touched(), false)
})

Deno.test('evento de uma conta que não é da conexão ativa: 200 e o banco não é tocado (v1 e v2)', async () => {
  const { db, touched } = fakeDb()
  const { dir, asked } = directory({ outra: { status: 'foreign' } })
  const v1 = handlerWith({ db, accounts: dir })
  for (
    const body of [
      linkedinMessage({ account_id: 'outra' }),
      { ...mail, account_id: 'outra' },
      { AccountStatus: { account_id: 'outra', account_type: 'LINKEDIN', message: 'CREDENTIALS' } },
      { event: 'new_relation', account_id: 'outra', user_provider_id: 'ACoJ' },
      { ...notice, account_id: 'outra' },
    ]
  ) {
    assertEquals((await v1.handle(authed(body))).status, 200)
  }
  const v2 = handlerWith({ db, version: 'v2', accounts: dir })
  const signed = async (body: unknown) => {
    const raw = JSON.stringify(body)
    const t = String(Math.floor(NOW / 1000))
    return new Request('https://functions.test/x', {
      method: 'POST',
      headers: { 'unipile-signature': `t=${t},v0=${await signWebhookBody(raw, t, SECRET)}` },
      body: raw,
    })
  }
  assertEquals((await v2.handle(await signed({ id: 'e1', type: 'message.new', account_id: 'outra', payload: { id: 'm', chat_id: 'c' } }))).status, 200)
  assertEquals((await v2.handle(await signed({ id: 'e2', type: 'account.status.disconnected', account_id: 'outra' }))).status, 200)
  assertEquals(touched(), false)
  assertEquals(asked.length, 7)
  assertEquals(v1.logs.at(-1)?.outcome, 'other_connection')
})

Deno.test('a conta removida (DELETED) segue para o banco mesmo sem constar mais na lista da conexão: é o que pausa as Sequências', async () => {
  const { db, calls } = fakeDb()
  const { dir, asked } = directory({ acc1: { status: 'foreign' } })
  const { handle } = handlerWith({ db, accounts: dir })
  assertEquals((await handle(authed({ AccountStatus: { account_id: 'acc1', account_type: 'LINKEDIN', message: 'DELETED' } }))).status, 200)
  assertEquals(calls.apply, [{ accountId: 'acc1', status: 'DELETED' }])
  assertEquals(calls.hold, ['acc1'])
  assertEquals(asked, [])
})

Deno.test('lista de contas indisponível (unknown): o evento segue como seguia antes, sem descartar nada sem prova', async () => {
  const { db, calls } = fakeDb()
  const { dir } = directory({}, { status: 'unknown' })
  const { handle } = handlerWith({ db, accounts: dir })
  assertEquals((await handle(authed(linkedinMessage()))).status, 200)
  assertEquals(calls.chat.length, 1)
})

Deno.test('v1 corpo que não é JSON, ou evento sem tipo nem conta, depois de autenticado: 400', async () => {
  const { db, touched } = fakeDb()
  const { handle } = handlerWith({ db })
  const broken = await handle(new Request('https://functions.test/x', { method: 'POST', headers: { 'Unipile-Auth': SECRET }, body: '{não é json' }))
  assertEquals(broken.status, 400)
  assertEquals((await handle(authed({}))).status, 400)
  assertEquals(touched(), false)
})

Deno.test('v1 erro no banco devolve 500 para a Unipile entregar de novo', async () => {
  const { db } = fakeDb()
  db.ingestChatEvent = async () => {
    throw new Error('boom')
  }
  const { handle } = handlerWith({ db })
  assertEquals((await handle(authed(linkedinMessage()))).status, 500)
})

// TEMPORÁRIO (fix-resposta-email-v1): o log do corpo do webhook de e-mail da v1, para validar o formato de `in_reply_to.id` com a
// próxima resposta real. Sai quando o formato estiver confirmado.
Deno.test('v1 mail_received: log temporário do corpo bruto, sem o texto do e-mail, só para o e-mail da v1', async () => {
  const { db } = fakeDb()
  const { handle, logs } = handlerWith({ db })
  const raw = { ...mail, in_reply_to: { id: 'nSJU60KtTQaNv-k2we_GIw', message_id: null }, body: '<p>texto privado do lead</p>', body_plain: 'texto privado do lead' }
  assertEquals((await handle(authed(raw))).status, 200)
  const entry = logs.find((fields) => fields.type === 'temp_v1_mail_raw')
  assertEquals(entry?.raw && (entry.raw as Record<string, unknown>).in_reply_to, { id: 'nSJU60KtTQaNv-k2we_GIw', message_id: null })
  assertEquals((entry?.raw as Record<string, unknown>).email_id, 'e9')
  const printed = JSON.stringify(logs)
  assertEquals(printed.includes('texto privado do lead'), false)
  assertEquals(printed.includes(SECRET), false)

  // Mensagem de chat e e-mail sem autenticação não geram o log.
  const other = handlerWith({ db: fakeDb().db })
  await other.handle(authed(linkedinMessage()))
  await other.handle(post(raw, { 'Unipile-Auth': 'errado' }))
  assertEquals(other.logs.some((fields) => fields.type === 'temp_v1_mail_raw'), false)
})
