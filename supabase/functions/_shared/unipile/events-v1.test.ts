// Os eventos de webhook da Unipile v1 (canais-17): um exemplo por tipo, traduzido para a união canônica do canais-14.
// Os formatos vêm da documentação como o protótipo a leu (nunca vistos com tráfego real): ver events-v1.ts.
import { assertEquals } from 'jsr:@std/assert@1'
import { type CanonicalEvent, canonicalEventSchema, type IgnoreReason } from './events.ts'
import {
  completeV1Connection,
  normalizeV1Provider,
  parseV1WebhookEvent,
  V1_ACCOUNT_STATES,
  v1AccountState,
} from './events-v1.ts'

const PEDIDO = 'f6000000-0000-0000-0000-000000000001'

const linkedinMessage = (extra: Record<string, unknown> = {}) => ({
  event: 'message_received',
  account_id: 'acc1',
  account_type: 'LINKEDIN',
  chat_id: 'chat1',
  message_id: 'm1',
  message: 'Tenho interesse',
  timestamp: '2026-10-09T12:00:00.000Z',
  sender: {
    attendee_id: 'at1',
    attendee_name: 'Maria Silva',
    attendee_provider_id: 'ACoAAA1',
    attendee_public_identifier: 'maria-silva',
  },
  attendees: [{ attendee_provider_id: 'ACoAAA1' }, { attendee_provider_id: 'ACoDONO' }],
  account_info: { user_id: 'ACoDONO' },
  ...extra,
})

const ignored = (reason: IgnoreReason, event_type: string, account_id = 'acc1'): CanonicalEvent => ({
  kind: 'ignore',
  reason,
  event_type,
  account_id,
})

Deno.test('v1 message_received (LinkedIn): vira message.new no formato que o banco lê, com o id do evento prefixado pela conta', () => {
  const event = parseV1WebhookEvent(linkedinMessage())
  assertEquals(event, {
    kind: 'message',
    // O id da mensagem só é único dentro da conta: o prefixo faz a deduplicação por event_id valer.
    event_id: 'acc1:m1',
    account_id: 'acc1',
    event_type: 'message.new',
    payload: {
      // O id dentro do payload continua o da Unipile: é com ele que o banco reconhece o eco de um Envio nosso.
      id: 'm1',
      chat_id: 'chat1',
      sender_id: 'ACoAAA1',
      sender_name: 'Maria Silva',
      is_sender: false,
      text: 'Tenho interesse',
      date: '2026-10-09T12:00:00.000Z',
      is_event: false,
      deleted: false,
      attachments: [],
    },
  })
  assertEquals(canonicalEventSchema.safeParse(event).success, true)
})

Deno.test('v1 message_received (WhatsApp): o remetente é o id do provedor', () => {
  const event = parseV1WebhookEvent(linkedinMessage({
    account_type: 'WHATSAPP',
    sender: { attendee_provider_id: '5511900000001@s.whatsapp.net' },
    attendees: [],
    account_info: undefined,
  }))
  assertEquals(event.kind, 'message')
  const payload = (event as { payload: Record<string, unknown> }).payload
  assertEquals(payload.sender_id, '5511900000001@s.whatsapp.net')
  // Sem saber quem é o titular, o evento NÃO afirma que a mensagem é do contato: o banco decide pela identidade aprendida.
  assertEquals('is_sender' in payload, false)
})

Deno.test('v1 message_received: mensagem própria, grupo, evento, anúncio e canal sem suporte viram ignorar com motivo', () => {
  const type = 'message_received'
  assertEquals(
    parseV1WebhookEvent(linkedinMessage({ sender: { attendee_provider_id: 'ACoDONO' } })),
    ignored('mensagem_propria', type),
  )
  assertEquals(parseV1WebhookEvent(linkedinMessage({ is_sender: 1 })), ignored('mensagem_propria', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ attendees: [{}, {}, {}] })), ignored('grupo', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ is_group: true })), ignored('grupo', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ is_event: true })), ignored('evento_sem_texto', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ deleted: true })), ignored('evento_sem_texto', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ content_type: 'sponsored' })), ignored('anuncio_do_canal', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ content_type: 'linkedin_offer' })), ignored('anuncio_do_canal', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ content_type: 'inmail' })).kind, 'message')
  assertEquals(parseV1WebhookEvent(linkedinMessage({ account_type: 'INSTAGRAM' })), ignored('canal_nao_suportado', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ account_type: 'TELEGRAM' })), ignored('canal_nao_suportado', type))
})

Deno.test('v1 message_received: sem id da mensagem, da conversa ou da conta é payload_incompleto', () => {
  const type = 'message_received'
  assertEquals(parseV1WebhookEvent(linkedinMessage({ message_id: undefined })), ignored('payload_incompleto', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ chat_id: undefined })), ignored('payload_incompleto', type))
  assertEquals(parseV1WebhookEvent(linkedinMessage({ attendees: 'não-é-lista' })).kind, 'message')
  assertEquals(parseV1WebhookEvent({ event: 'message_received' }), {
    kind: 'ignore',
    reason: 'payload_incompleto',
    event_type: 'message_received',
  })
})

Deno.test('v1 mail_received: vira email.new no formato do Email que o banco lê, com o id do evento prefixado', () => {
  const event = parseV1WebhookEvent({
    event: 'mail_received',
    account_id: 'acc2',
    email_id: 'e9',
    message_id: '<abc@mail.test>',
    thread_id: 't1',
    date: '2026-10-09T12:30:00.000Z',
    from_attendee: { identifier: 'Jonas@Serra.test', display_name: 'Jonas Serra' },
    subject: 'Re: proposta',
    body: '<p>Fechado.</p>',
    body_plain: 'Fechado.',
    attachments: [{ id: 'a1', name: 'proposta.pdf', mime: 'application/pdf', size: 10 }],
  })
  assertEquals(event, {
    kind: 'email',
    event_id: 'acc2:e9',
    account_id: 'acc2',
    event_type: 'email.new',
    email: {
      id: 'e9',
      message_id: '<abc@mail.test>',
      thread_id: 't1',
      date: '2026-10-09T12:30:00.000Z',
      from: { email: 'Jonas@Serra.test', display_name: 'Jonas Serra' },
      subject: 'Re: proposta',
      body: '<p>Fechado.</p>',
      snippet: 'Fechado.',
      attachments: [{ id: 'a1', name: 'proposta.pdf', mime: 'application/pdf', size: 10 }],
    },
    owner_addresses: [],
  })
  assertEquals(canonicalEventSchema.safeParse(event).success, true)
  assertEquals(
    parseV1WebhookEvent({ event: 'mail_received', account_id: 'acc2', from_attendee: { identifier: 'a@b.test' } }),
    ignored('payload_incompleto', 'mail_received', 'acc2'),
  )
  assertEquals(
    parseV1WebhookEvent({ event: 'mail_received', account_id: 'acc2', email_id: 'e9' }),
    ignored('payload_incompleto', 'mail_received', 'acc2'),
  )
})

Deno.test('v1 new_relation: vira relation.new com os identificadores do usuário; sem nenhum, payload_incompleto', () => {
  const event = parseV1WebhookEvent({
    event: 'new_relation',
    account_id: 'acc1',
    user_public_identifier: 'joao',
    user_provider_id: 'ACoJ',
    user_profile_url: 'https://www.linkedin.com/in/joao',
  })
  assertEquals(event, {
    kind: 'relation',
    event_id: 'acc1:new_relation:ACoJ',
    account_id: 'acc1',
    event_type: 'new_relation',
    payload: { public_identifier: 'joao', provider_id: 'ACoJ', profile_url: 'https://www.linkedin.com/in/joao' },
  })
  assertEquals(
    parseV1WebhookEvent({ event: 'new_relation', account_id: 'acc1' }),
    ignored('payload_incompleto', 'new_relation'),
  )
})

Deno.test('v1 estado da conta (aninhado ou direto): tabela do mapa, e estado desconhecido não conecta nem derruba', () => {
  const nested = (message: string) => parseV1WebhookEvent({ AccountStatus: { account_id: 'acc1', account_type: 'LINKEDIN', message } })
  const status = (message: string) => (nested(message) as { status?: string }).status
  assertEquals(nested('OK'), { kind: 'account_status', account_id: 'acc1', event_type: 'AccountStatus', status: 'OK' })
  assertEquals(status('SYNC_SUCCESS'), 'SYNC_SUCCESS')
  assertEquals(status('CREATION_SUCCESS'), 'OK')
  assertEquals(status('RECONNECTED'), 'OK')
  assertEquals(status('CREDENTIALS'), 'CREDENTIALS')
  assertEquals(status('ERROR'), 'ERROR')
  assertEquals(status('STOPPED'), 'ERROR')
  assertEquals(status('PERMISSIONS'), 'ERROR')
  assertEquals(status('DELETED'), 'DELETED')
  assertEquals(status('ok'), 'OK')
  // CONNECTING é passageiro; um nome que ninguém conhece não faz nada.
  assertEquals(nested('CONNECTING'), ignored('status_sem_efeito', 'AccountStatus'))
  assertEquals(nested('ALGO_NOVO'), ignored('status_sem_efeito', 'AccountStatus'))
  assertEquals(
    parseV1WebhookEvent({ account_id: 'acc1', account_type: 'INSTAGRAM', message: 'ERROR' }),
    { kind: 'account_status', account_id: 'acc1', event_type: 'AccountStatus', status: 'ERROR' },
  )
  assertEquals(
    parseV1WebhookEvent({ AccountStatus: { account_type: 'LINKEDIN', message: 'OK' } }),
    { kind: 'ignore', reason: 'payload_incompleto', event_type: 'AccountStatus' },
  )
})

Deno.test('v1 estado da conta: connected, attention ou disconnected, e a lista de fontes da API', () => {
  assertEquals(v1AccountState('OK'), 'connected')
  assertEquals(v1AccountState('CREDENTIALS'), 'attention')
  assertEquals(v1AccountState('DELETED'), 'disconnected')
  assertEquals(v1AccountState('CONNECTING'), null)
  assertEquals(v1AccountState('QUALQUER'), null)
  assertEquals(Object.keys(V1_ACCOUNT_STATES).sort(), [
    'CONNECTING', 'CREATION_SUCCESS', 'CREDENTIALS', 'DELETED', 'ERROR', 'OK', 'PERMISSIONS', 'RECONNECTED', 'STOPPED', 'SYNC_SUCCESS',
  ])
})

Deno.test('v1 aviso do link de conexão: o name é o id do nosso pedido; sem pedido válido, conexao_sem_pedido', () => {
  const notice = (status: string, name: string) => parseV1WebhookEvent({ status, account_id: 'acc7', name })
  assertEquals(notice('CREATION_SUCCESS', PEDIDO), {
    kind: 'connection',
    account_id: 'acc7',
    event_type: 'account.add',
    attempt_id: PEDIDO,
    // O aviso da v1 não diz o provedor: quem recebe o descobre pela lista de contas da conexão (completeV1Connection).
    provider: null,
    initial_status: 'CREATION_SUCCESS',
    sync_finished: false,
  })
  assertEquals((notice('RECONNECTED', PEDIDO) as { event_type: string }).event_type, 'account.reconnect')
  assertEquals(notice('CREATION_SUCCESS', 'qualquer-coisa'), ignored('conexao_sem_pedido', 'connection_notice', 'acc7'))
})

Deno.test('v1 lixo nunca estoura', () => {
  for (const raw of [null, undefined, 42, 'texto', [], {}, { event: 1 }, { AccountStatus: 'x' }]) {
    const event = parseV1WebhookEvent(raw)
    assertEquals(event.kind, 'ignore')
  }
  assertEquals(parseV1WebhookEvent({ event: 'x', account_id: 'a' }), ignored('evento_desconhecido', 'x', 'a'))
  assertEquals(parseV1WebhookEvent({ event: 'message_read', account_id: 'a' }), ignored('evento_desconhecido', 'message_read', 'a'))
})

Deno.test('v1 provedor da conta: os nomes da v1 viram os da Althius; desconhecido não vira nada', () => {
  assertEquals(normalizeV1Provider('LINKEDIN'), 'LINKEDIN')
  assertEquals(normalizeV1Provider('whatsapp'), 'WHATSAPP')
  assertEquals(normalizeV1Provider('GOOGLE_OAUTH'), 'GOOGLE')
  assertEquals(normalizeV1Provider('GOOGLE'), 'GOOGLE')
  assertEquals(normalizeV1Provider('OUTLOOK'), 'OUTLOOK')
  assertEquals(normalizeV1Provider('MAIL'), 'IMAP')
  assertEquals(normalizeV1Provider('IMAP'), 'IMAP')
  assertEquals(normalizeV1Provider('TELEGRAM'), null)
  assertEquals(normalizeV1Provider(''), null)
})

Deno.test('v1 conexão completada com o provedor da lista de contas: só WhatsApp e IMAP esperam a sincronização', () => {
  const base = parseV1WebhookEvent({ status: 'CREATION_SUCCESS', account_id: 'acc7', name: PEDIDO }) as Extract<
    ReturnType<typeof parseV1WebhookEvent>,
    { kind: 'connection' }
  >
  assertEquals(completeV1Connection(base, 'LINKEDIN'), { ...base, provider: 'LINKEDIN', sync_finished: true })
  assertEquals(completeV1Connection(base, 'GOOGLE_OAUTH'), { ...base, provider: 'GOOGLE', sync_finished: true })
  assertEquals(completeV1Connection(base, 'WHATSAPP'), { ...base, provider: 'WHATSAPP', sync_finished: false })
  assertEquals(completeV1Connection(base, 'MAIL'), { ...base, provider: 'IMAP', sync_finished: false })
  assertEquals(completeV1Connection(base, 'TELEGRAM'), null)
})

// A resposta de um e-mail na v1 vem com `in_reply_to` {id, message_id}: o id do e-mail respondido na Unipile e o Message-ID
// do cabeçalho. É o que liga a resposta ao envio quando o envio só guardou o id do e-mail (sem conversa nem Message-ID).
// não confirmado: o formato real de `in_reply_to.id` na v1; o log temporário do webhook serve para validar.
Deno.test('v1 mail_received: in_reply_to {id, message_id} vai no e-mail canônico; sem ele, a chave nem existe', () => {
  const base = { event: 'mail_received', account_id: 'acc2', email_id: 'lYwp-E_oXMKFkkhGid3iGQ', from_attendee: { identifier: 'jonas@serra.test' } }
  const parsed = (extra: Record<string, unknown>) => {
    const event = parseV1WebhookEvent({ ...base, ...extra })
    assertEquals(event.kind, 'email')
    return event.kind === 'email' ? event.email : null
  }
  assertEquals(parsed({ in_reply_to: { id: 'nSJU60KtTQaNv-k2we_GIw', message_id: '<abc@mail.test>' } })?.in_reply_to, {
    id: 'nSJU60KtTQaNv-k2we_GIw',
    message_id: '<abc@mail.test>',
  })
  // Só o id (o envio da v1 não guarda Message-ID): o message_id nulo ou vazio não vai.
  assertEquals(parsed({ in_reply_to: { id: 'nSJU60KtTQaNv-k2we_GIw', message_id: null } })?.in_reply_to, { id: 'nSJU60KtTQaNv-k2we_GIw' })
  assertEquals(parsed({ in_reply_to: { id: 'nSJU60KtTQaNv-k2we_GIw', message_id: '' } })?.in_reply_to, { id: 'nSJU60KtTQaNv-k2we_GIw' })
  // Sem in_reply_to, ou com um formato que não é objeto, ou sem nenhum dos dois ids: o e-mail segue sem a chave e não cai.
  for (const extra of [{}, { in_reply_to: null }, { in_reply_to: 'nSJU60KtTQaNv-k2we_GIw' }, { in_reply_to: {} }, { in_reply_to: { id: '  ' } }]) {
    const email = parsed(extra)
    assertEquals(email !== null && 'in_reply_to' in email, false)
  }
  assertEquals(canonicalEventSchema.safeParse(parseV1WebhookEvent({ ...base, in_reply_to: { id: 'x' } })).success, true)
})
