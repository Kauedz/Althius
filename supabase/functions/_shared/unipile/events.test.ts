import { assertEquals } from 'jsr:@std/assert@1'
import { canonicalEventSchema, IGNORE_REASONS, parseV2WebhookEvent } from './events.ts'

const STATE = '6f1c9f64-3d0b-4f43-8a4b-0c8a8d5b7e11'

Deno.test('v2 account.add: conexão pronta já no evento, exceto WhatsApp e IMAP, que esperam a sincronização', () => {
  const add = (provider: string, payloadAccount: Record<string, unknown> = {}) =>
    parseV2WebhookEvent({
      id: 'evt-1',
      type: 'account.add',
      account_id: 'acc-1',
      payload: { state: STATE, account: { provider, ...payloadAccount } },
    })
  assertEquals(add('linkedin'), {
    kind: 'connection',
    account_id: 'acc-1',
    event_type: 'account.add',
    attempt_id: STATE,
    provider: 'linkedin',
    initial_status: 'CREATION_SUCCESS',
    sync_finished: true,
  })
  assertEquals((add('whatsapp') as { sync_finished: boolean }).sync_finished, false)
  assertEquals((add('whatsapp', { initial_sync: { status: 'completed' } }) as { sync_finished: boolean }).sync_finished, true)
  assertEquals((add('imap') as { sync_finished: boolean }).sync_finished, false)
})

Deno.test('v2 account.reconnect usa RECONNECTED, e o provedor pode vir no envelope', () => {
  assertEquals(
    parseV2WebhookEvent({
      type: 'account.reconnect',
      account_id: 'acc-1',
      account_provider: 'gmail',
      payload: { state: STATE },
    }),
    {
      kind: 'connection',
      account_id: 'acc-1',
      event_type: 'account.reconnect',
      attempt_id: STATE,
      provider: 'gmail',
      initial_status: 'RECONNECTED',
      sync_finished: true,
    },
  )
})

Deno.test('v2 conexão sem o state da tentativa ou sem provedor é payload_incompleto', () => {
  const event = (payload: unknown) => parseV2WebhookEvent({ type: 'account.add', account_id: 'acc-1', payload })
  for (const payload of [{ account: { provider: 'linkedin' } }, { state: 'não-é-uuid', account: { provider: 'linkedin' } }, { state: STATE }]) {
    assertEquals(event(payload), { kind: 'ignore', reason: 'payload_incompleto', event_type: 'account.add', account_id: 'acc-1' })
  }
})

Deno.test('v2 eventos de estado da conta viram o vocabulário que apply_unipile_sender_status entende', () => {
  const status = (type: string) => (parseV2WebhookEvent({ type, account_id: 'acc-1' }) as { status: string }).status
  assertEquals(status('account.initial_sync.completed'), 'SYNC_SUCCESS')
  assertEquals(status('account.status.running'), 'OK')
  assertEquals(status('account.status.disconnected'), 'CREDENTIALS')
  assertEquals(status('account.status.errored'), 'ERROR')
  assertEquals(status('account.remove'), 'DELETED')
  assertEquals(parseV2WebhookEvent({ type: 'account.remove', account_id: 'acc-1' }), {
    kind: 'account_status',
    account_id: 'acc-1',
    event_type: 'account.remove',
    status: 'DELETED',
  })
})

Deno.test('v2 email.new: o Email vem em payload.email ou direto no payload, com os endereços do titular', () => {
  const email = { id: 'em-1', subject: 'Re: Olá' }
  const expected = {
    kind: 'email' as const,
    event_id: 'evt-2',
    account_id: 'acc-1',
    event_type: 'email.new' as const,
    email,
    owner_addresses: ['titular@empresa.com.br'],
  }
  assertEquals(
    parseV2WebhookEvent({ id: 'evt-2', type: 'email.new', account_id: 'acc-1', account_name: ' Titular@Empresa.com.br ', payload: { email } }),
    expected,
  )
  assertEquals<unknown>(
    parseV2WebhookEvent({ id: 'evt-2', type: 'email.new', account_id: 'acc-1', payload: { ...email, account_name: 'titular@empresa.com.br' } }),
    { ...expected, email: { ...email, account_name: 'titular@empresa.com.br' } },
  )
  assertEquals(
    (parseV2WebhookEvent({ id: 'evt-3', type: 'email.new.bounce', account_id: 'acc-1', payload: { email } }) as { event_type: string })
      .event_type,
    'email.new.bounce',
  )
})

Deno.test('v2 email sem id do evento ou sem Email é payload_incompleto', () => {
  assertEquals(parseV2WebhookEvent({ type: 'email.new', account_id: 'acc-1', payload: { email: { id: 'em-1' } } }).kind, 'ignore')
  const noEmail = parseV2WebhookEvent({ id: 'evt', type: 'email.new', account_id: 'acc-1', payload: { folder_id: 'x' } })
  assertEquals(noEmail, { kind: 'ignore', reason: 'payload_incompleto', event_type: 'email.new', account_id: 'acc-1' })
})

Deno.test('v2 message.new e relation.new levam o payload inteiro e o id do evento', () => {
  assertEquals(
    parseV2WebhookEvent({ id: 'evt-4', type: 'message.new', account_id: 'acc-1', payload: { id: 'm', text: 'oi' } }),
    { kind: 'message', event_id: 'evt-4', account_id: 'acc-1', event_type: 'message.new', payload: { id: 'm', text: 'oi' } },
  )
  assertEquals(
    parseV2WebhookEvent({ id: 'evt-5', type: 'relation.new', account_id: 'acc-1', payload: { user_id: 'u' } }),
    { kind: 'relation', event_id: 'evt-5', account_id: 'acc-1', event_type: 'relation.new', payload: { user_id: 'u' } },
  )
  assertEquals(
    parseV2WebhookEvent({ id: 'evt-6', type: 'message.new', account_id: 'acc-1', payload: [] }).kind,
    'ignore',
  )
})

Deno.test('v2 envelope inválido é payload_invalido; tipo que não conhecemos é evento_desconhecido', () => {
  assertEquals(parseV2WebhookEvent(null), { kind: 'ignore', reason: 'payload_invalido' })
  assertEquals(parseV2WebhookEvent({ account_id: 'acc-1' }), { kind: 'ignore', reason: 'payload_invalido', account_id: 'acc-1' })
  assertEquals(parseV2WebhookEvent({ type: 'chat.update', account_id: '' }), { kind: 'ignore', reason: 'payload_invalido', event_type: 'chat.update' })
  assertEquals(parseV2WebhookEvent({ type: 'folder.new', account_id: 'acc-1' }), {
    kind: 'ignore',
    reason: 'evento_desconhecido',
    event_type: 'folder.new',
    account_id: 'acc-1',
  })
})

Deno.test('os motivos de descarte são os do mapa (§1.5)', () => {
  assertEquals([...IGNORE_REASONS], [
    'payload_invalido',
    'payload_incompleto',
    'mensagem_propria',
    'grupo',
    'evento_sem_texto',
    'canal_nao_suportado',
    'anuncio_do_canal',
    'conexao_sem_pedido',
    'status_sem_efeito',
    'email_devolvido_nao_tratado',
    'evento_desconhecido',
  ])
})

Deno.test('a união canônica rejeita o que não é um dos seis formatos', () => {
  assertEquals(canonicalEventSchema.safeParse({ kind: 'ignore', reason: 'por_nenhum_motivo' }).success, false)
  assertEquals(canonicalEventSchema.safeParse({ kind: 'account_status', account_id: 'a', event_type: 'x', status: 'TALVEZ' }).success, false)
  assertEquals(canonicalEventSchema.safeParse({ kind: 'sticker' }).success, false)
  assertEquals(canonicalEventSchema.safeParse({ kind: 'ignore', reason: 'grupo' }).success, true)
})
