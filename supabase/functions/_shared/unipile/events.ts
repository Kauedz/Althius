// A união canônica dos eventos de webhook da Unipile (ADR-0024): o que o resto da Althius enxerga, seja qual for a
// versão da conexão ativa. Este arquivo tem o FORMATO da união e o parse da v2 que já existia no webhook
// (unipile-account-status/handler.ts); os eventos da v1 são traduzidos para a mesma união em events-v1.ts (canais-17).
import { CHAT_MESSAGE_EVENTS, CHAT_RELATION_EVENTS } from '../ingest-chat-event.ts'
import { emailAddress, nonBlank } from './common.ts'
import { z } from './zod.ts'

/** Por que um evento é descartado. O vocabulário vem do mapa do protótipo (.scratch/handoffs/unipile-port-map.md, §1.5). */
export const IGNORE_REASONS = [
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
] as const

/** O estado de uma conta no vocabulário que a RPC apply_unipile_sender_status já entende (a RPC não muda). */
export const ACCOUNT_STATUSES = ['SYNC_SUCCESS', 'OK', 'CREDENTIALS', 'ERROR', 'DELETED'] as const

const account_id = nonBlank
const record = z.record(z.unknown())

export const canonicalEventSchema = z.discriminatedUnion('kind', [
  /** Mensagem de WhatsApp ou LinkedIn (recebida E enviada: o banco distingue o eco do titular). */
  z.object({
    kind: z.literal('message'),
    event_id: nonBlank,
    account_id,
    event_type: z.literal('message.new'),
    payload: record,
  }),
  /** E-mail novo, ou devolvido (bounce). */
  z.object({
    kind: z.literal('email'),
    event_id: nonBlank,
    account_id,
    event_type: z.enum(['email.new', 'email.new.bounce']),
    email: z.object({ id: z.string() }).passthrough(),
    owner_addresses: z.array(z.string()),
  }),
  /** Nova relação no LinkedIn (aceite de convite). */
  z.object({
    kind: z.literal('relation'),
    event_id: nonBlank,
    account_id,
    event_type: z.enum(['relation.new', 'new_relation']),
    payload: record,
  }),
  /** O estado da conta mudou. */
  z.object({ kind: z.literal('account_status'), account_id, event_type: nonBlank, status: z.enum(ACCOUNT_STATUSES) }),
  /** Uma conexão (ou reconexão) terminou, ligada à tentativa que a Althius abriu. */
  z.object({
    kind: z.literal('connection'),
    account_id,
    event_type: z.enum(['account.add', 'account.reconnect']),
    attempt_id: z.string().regex(/^[0-9a-f-]{36}$/i),
    /** Nulo no aviso da v1, que não diz o provedor: quem recebe o completa pela lista de contas (events-v1.ts). */
    provider: nonBlank.nullable(),
    initial_status: z.enum(['CREATION_SUCCESS', 'RECONNECTED']),
    /** WhatsApp e IMAP só ficam prontos depois da sincronização inicial; os outros provedores, já no evento. */
    sync_finished: z.boolean(),
  }),
  /** Descartado, com o motivo. */
  z.object({
    kind: z.literal('ignore'),
    reason: z.enum(IGNORE_REASONS),
    event_type: z.string().optional(),
    account_id: z.string().optional(),
  }),
])

export type CanonicalEvent = z.infer<typeof canonicalEventSchema>
export type IgnoreReason = (typeof IGNORE_REASONS)[number]

// Traduz os event types de conta da v2 para o vocabulário que apply_unipile_sender_status já entende
// (a RPC não muda: SYNC_SUCCESS/CREDENTIALS/ERROR/OK/DELETED já existiam para os mesmos significados na v1).
const V2_STATUS_EVENTS: Record<string, (typeof ACCOUNT_STATUSES)[number]> = {
  'account.initial_sync.completed': 'SYNC_SUCCESS',
  'account.status.running': 'OK',
  'account.status.disconnected': 'CREDENTIALS',
  'account.status.errored': 'ERROR',
  'account.remove': 'DELETED',
}

// Na v2 só WhatsApp e IMAP fazem sincronização inicial (docs/initial-sync); os outros provedores já
// chegam com o histórico disponível, então nunca mandam account.initial_sync.completed.
const PROVIDERS_WITH_INITIAL_SYNC = new Set(['whatsapp', 'imap'])

const V2_EMAIL_EVENTS = new Set(['email.new', 'email.new.bounce'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

/**
 * Lê um evento de webhook da Unipile v2 já com o JSON decodificado. Nunca lança: o que não presta vira `ignore` com o
 * motivo (`payload_invalido` sem tipo ou conta; `payload_incompleto` quando falta o que o tipo exige;
 * `evento_desconhecido` para um tipo que a Althius não trata). Quem recebe decide a resposta HTTP.
 */
export function parseV2WebhookEvent(raw: unknown): CanonicalEvent {
  const event = isRecord(raw) ? raw : {}
  const type = text(event.type)
  const accountId = text(event.account_id)
  const trace = {
    ...(type ? { event_type: type } : {}),
    ...(accountId ? { account_id: accountId } : {}),
  }
  const ignore = (reason: IgnoreReason): CanonicalEvent => ({ kind: 'ignore', reason, ...trace })

  if (!type || !accountId) return ignore('payload_invalido')

  const payload = event.payload
  const eventId = text(event.id)

  if (type === 'account.add' || type === 'account.reconnect') {
    const payloadRecord = isRecord(payload) ? payload : {}
    const account = isRecord(payloadRecord.account) ? payloadRecord.account : {}
    const attemptId = typeof payloadRecord.state === 'string' ? payloadRecord.state : ''
    const provider = text(account.provider) ?? text(event.account_provider) ?? ''
    const parsed = canonicalEventSchema.safeParse({
      kind: 'connection',
      account_id: accountId,
      event_type: type,
      attempt_id: attemptId,
      provider,
      initial_status: type === 'account.add' ? 'CREATION_SUCCESS' : 'RECONNECTED',
      sync_finished: !PROVIDERS_WITH_INITIAL_SYNC.has(provider.toLowerCase()) ||
        (isRecord(account.initial_sync) && account.initial_sync.status === 'completed'),
    })
    return parsed.success ? parsed.data : ignore('payload_incompleto')
  }

  const status = V2_STATUS_EVENTS[type]
  if (status) return { kind: 'account_status', account_id: accountId, event_type: type, status }

  if (V2_EMAIL_EVENTS.has(type)) {
    // O payload traz folder_id e email (o objeto Email). Alguns envelopes trazem o Email direto no payload.
    const payloadRecord = isRecord(payload) ? payload : null
    const email = payloadRecord && isRecord(payloadRecord.email)
      ? payloadRecord.email
      : payloadRecord && typeof payloadRecord.id === 'string'
      ? payloadRecord
      : null
    if (!email || typeof email.id !== 'string' || !eventId) return ignore('payload_incompleto')
    // O endereço do titular vem no envelope (account_name) quando o provedor é de e-mail.
    const ownerAddresses = [event.account_name, payloadRecord?.account_name]
      .filter((value): value is string => typeof value === 'string' && emailAddress.safeParse(value).success)
      .map((value) => value.trim().toLowerCase())
    return {
      kind: 'email',
      event_id: eventId,
      account_id: accountId,
      event_type: type as 'email.new' | 'email.new.bounce',
      email: email as { id: string },
      owner_addresses: ownerAddresses,
    }
  }

  // WhatsApp e LinkedIn: o payload de `message.new` é o próprio objeto Message; a nova relação é só registrada.
  if (CHAT_MESSAGE_EVENTS.has(type) || CHAT_RELATION_EVENTS.has(type)) {
    if (!isRecord(payload) || !eventId) return ignore('payload_incompleto')
    return CHAT_MESSAGE_EVENTS.has(type)
      ? { kind: 'message', event_id: eventId, account_id: accountId, event_type: 'message.new', payload }
      : {
        kind: 'relation',
        event_id: eventId,
        account_id: accountId,
        event_type: type as 'relation.new' | 'new_relation',
        payload,
      }
  }

  return ignore('evento_desconhecido')
}
