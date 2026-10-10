// Os eventos de webhook da Unipile v1 traduzidos, no limite, para a união canônica do canais-14 (events.ts). O resto da
// Althius (o handler e as operações do banco) só enxerga a forma canônica: a mensagem v1 chega ao banco já no formato do
// Message da v2, e o e-mail, no formato do Email.
//
// NÃO CONFIRMADO: nenhum destes formatos foi visto com tráfego real. Vêm da documentação da v1 como o protótipo
// (Kauedz/althius-revenue-os, src/server/webhooks/unipile.ts, `interpretarV1`) a leu: `message_received`,
// `mail_received`, `new_relation`, `AccountStatus` (aninhado ou direto) e o aviso do link de conexão
// `{ status, account_id, name }`. Os campos marcados "não confirmado" abaixo entram na conferência do canais-12 quando
// houver uma conta v1 de verdade. Um campo opcional que vier com o tipo errado é descartado, nunca derruba o evento.
import { nonBlank } from './common.ts'
import { type CanonicalEvent, type IgnoreReason } from './events.ts'
import { z } from './zod.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CanonicalConnection = Extract<CanonicalEvent, { kind: 'connection' }>

// ---- Estado da conta (tabela do mapa, .scratch/handoffs/unipile-port-map.md §1.5) ----

/** O que cada nome de estado da v1 quer dizer para a Althius; `null` é passageiro e não muda nada. */
export const V1_ACCOUNT_STATES: Record<string, 'connected' | 'attention' | 'disconnected' | null> = {
  OK: 'connected',
  SYNC_SUCCESS: 'connected',
  CREATION_SUCCESS: 'connected',
  RECONNECTED: 'connected',
  CREDENTIALS: 'attention',
  ERROR: 'attention',
  STOPPED: 'attention',
  PERMISSIONS: 'attention',
  DELETED: 'disconnected',
  CONNECTING: null,
}

/** `connected`, `attention` ou `disconnected`; `null` para um estado passageiro ou que ninguém conhece. */
export function v1AccountState(message: string): 'connected' | 'attention' | 'disconnected' | null {
  return V1_ACCOUNT_STATES[message.trim().toUpperCase()] ?? null
}

// O vocabulário que apply_unipile_sender_status entende (a RPC não muda). Atenção pede reconexão: CREDENTIALS fica como é;
// ERROR, STOPPED e PERMISSIONS viram ERROR (a RPC só conhece os dois primeiros, e todos pedem a mesma coisa da pessoa).
const V1_STATUS_TO_CANONICAL: Record<string, 'SYNC_SUCCESS' | 'OK' | 'CREDENTIALS' | 'ERROR' | 'DELETED'> = {
  OK: 'OK',
  SYNC_SUCCESS: 'SYNC_SUCCESS',
  CREATION_SUCCESS: 'OK',
  RECONNECTED: 'OK',
  CREDENTIALS: 'CREDENTIALS',
  ERROR: 'ERROR',
  STOPPED: 'ERROR',
  PERMISSIONS: 'ERROR',
  DELETED: 'DELETED',
}

// ---- Provedor da conta (o aviso do link de conexão não o traz) ----

// não confirmado: os `type` que a v1 devolve em GET /accounts. O protótipo manda o nome em maiúsculas; o guia da v1 cita
// MAIL, IMAP, GOOGLE_OAUTH, OUTLOOK, WHATSAPP e LINKEDIN.
const V1_PROVIDER_NAMES: Record<string, string> = {
  LINKEDIN: 'LINKEDIN',
  WHATSAPP: 'WHATSAPP',
  GOOGLE: 'GOOGLE',
  GOOGLE_OAUTH: 'GOOGLE',
  OUTLOOK: 'OUTLOOK',
  IMAP: 'IMAP',
  MAIL: 'IMAP',
}

/** O provedor no nome que as Contas remetentes guardam (maiúsculas, o da v2); `null` se não é um que a Althius conecta. */
export function normalizeV1Provider(type: string): string | null {
  return V1_PROVIDER_NAMES[type.trim().toUpperCase()] ?? null
}

/**
 * O aviso do link de conexão da v1 não diz o provedor (nem se a sincronização inicial acabou): quem recebe o descobre na
 * lista de contas da conexão e completa o evento. Só WhatsApp e IMAP esperam a sincronização, como na v2; `null` quando o
 * tipo da conta não é um provedor que a Althius conecta (nada é gravado).
 */
export function completeV1Connection(event: CanonicalConnection, accountType: string): CanonicalConnection | null {
  const provider = normalizeV1Provider(accountType)
  if (!provider) return null
  return { ...event, provider, sync_finished: provider !== 'WHATSAPP' && provider !== 'IMAP' }
}

// ---- Leitura solta dos campos ----

const optional = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined)
const id = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).pipe(nonBlank)
const text = z.string().transform((value) => value.trim())
const flag = z.union([z.boolean(), z.number(), z.string()]).transform((value) => value === true || value === 1 || value === '1' || value === 'true')
const record = z.record(z.unknown())

const messageSchema = z.object({
  event: z.string(),
  account_id: id,
  account_type: optional(text),
  chat_id: optional(id),
  message_id: optional(id),
  message: optional(text),
  timestamp: optional(z.string()),
  is_event: optional(flag),
  deleted: optional(flag),
  is_group: optional(flag),
  // não confirmado: a v1 pode ou não mandar `is_sender` no aviso; quando manda, vale.
  is_sender: optional(flag),
  content_type: optional(text),
  sender: optional(z.object({
    attendee_id: optional(id),
    attendee_name: optional(text),
    attendee_provider_id: optional(id),
  }).passthrough()),
  attendees: optional(z.array(z.unknown())),
  account_info: optional(z.object({ user_id: optional(id) }).passthrough()),
  attachments: optional(z.array(z.unknown())),
})

const mailSchema = z.object({
  event: z.string(),
  account_id: id,
  email_id: optional(id),
  // não confirmado: message_id, thread_id, date, attachments e headers no aviso de e-mail da v1.
  message_id: optional(text),
  thread_id: optional(id),
  date: optional(z.string()),
  from_attendee: optional(z.object({ identifier: optional(text), display_name: optional(text) }).passthrough()),
  subject: optional(text),
  body: optional(text),
  body_plain: optional(text),
  attachments: optional(z.array(record)),
  headers: optional(z.array(record)),
  // não confirmado: o formato de `in_reply_to` no aviso de e-mail da v1 ({ id, message_id }: o id do e-mail respondido na Unipile e o
  // Message-ID do cabeçalho). Um formato que não é objeto, ou um campo com o tipo errado, é descartado.
  in_reply_to: optional(z.object({ id: optional(id), message_id: optional(text) }).passthrough()),
})

const relationSchema = z.object({
  event: z.string(),
  account_id: id,
  user_public_identifier: optional(text),
  user_provider_id: optional(id),
  user_profile_url: optional(text),
})

const accountStatusSchema = z.object({ account_id: id, account_type: optional(text), message: text })

const connectionNoticeSchema = z.object({ status: z.string(), account_id: id, name: optional(text) })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const present = (value: string | undefined) => (value ? value : undefined)

const SNIPPET_LIMIT = 300

/**
 * Lê um evento de webhook da Unipile v1 já com o JSON decodificado e o traduz para a união canônica. Nunca lança: o que
 * não presta vira `ignore` com o motivo (o vocabulário do mapa, §1.5).
 */
export function parseV1WebhookEvent(raw: unknown): CanonicalEvent {
  const event = isRecord(raw) ? raw : {}
  const ignore = (reason: IgnoreReason, eventType?: string, accountId?: string): CanonicalEvent => ({
    kind: 'ignore',
    reason,
    ...(eventType ? { event_type: eventType } : {}),
    ...(accountId ? { account_id: accountId } : {}),
  })
  if (!isRecord(raw)) return ignore('payload_invalido')

  // Aviso do link de conexão (notify_url): o `name` é o id do pedido que a Althius mandou ao gerar o link.
  const status = typeof event.status === 'string' ? event.status.trim().toUpperCase() : ''
  if (status === 'CREATION_SUCCESS' || status === 'RECONNECTED') {
    const notice = connectionNoticeSchema.safeParse(event)
    if (!notice.success) return ignore('payload_incompleto', 'connection_notice')
    const accountId = notice.data.account_id
    const attemptId = notice.data.name ?? ''
    if (!UUID.test(attemptId)) return ignore('conexao_sem_pedido', 'connection_notice', accountId)
    return {
      kind: 'connection',
      account_id: accountId,
      event_type: status === 'CREATION_SUCCESS' ? 'account.add' : 'account.reconnect',
      attempt_id: attemptId,
      provider: null,
      initial_status: status,
      sync_finished: false,
    }
  }

  // Estado da conta: aninhado em AccountStatus (como na documentação) ou direto no corpo, sem `event`.
  const statusBody = isRecord(event.AccountStatus)
    ? event.AccountStatus
    : event.event === undefined && 'message' in event && 'account_type' in event
    ? event
    : null
  if (statusBody || 'AccountStatus' in event) {
    const parsed = accountStatusSchema.safeParse(statusBody ?? {})
    if (!parsed.success) return ignore('payload_incompleto', 'AccountStatus')
    const canonical = V1_STATUS_TO_CANONICAL[parsed.data.message.toUpperCase()]
    // CONNECTING é passageiro, e um estado que ninguém conhece não conecta nem derruba nada.
    if (!canonical) return ignore('status_sem_efeito', 'AccountStatus', parsed.data.account_id)
    return { kind: 'account_status', account_id: parsed.data.account_id, event_type: 'AccountStatus', status: canonical }
  }

  const eventType = typeof event.event === 'string' ? event.event.trim().toLowerCase() : ''
  const accountId = typeof event.account_id === 'string' ? event.account_id.trim() : ''
  if (!eventType || !accountId) return ignore('payload_incompleto', eventType || undefined, accountId || undefined)

  if (eventType === 'new_relation') {
    const parsed = relationSchema.safeParse(event)
    if (!parsed.success) return ignore('payload_incompleto', eventType, accountId)
    const { user_public_identifier: publicId, user_provider_id: providerId, user_profile_url: profileUrl } = parsed.data
    if (!publicId && !providerId && !profileUrl) return ignore('payload_incompleto', eventType, accountId)
    return {
      kind: 'relation',
      // A v1 não numera o evento: a mesma pessoa aceitando duas vezes é o mesmo fato.
      event_id: `${accountId}:new_relation:${providerId ?? publicId ?? profileUrl}`,
      account_id: accountId,
      event_type: 'new_relation',
      payload: {
        ...(publicId ? { public_identifier: publicId } : {}),
        ...(providerId ? { provider_id: providerId } : {}),
        ...(profileUrl ? { profile_url: profileUrl } : {}),
      },
    }
  }

  if (eventType === 'mail_received') {
    const parsed = mailSchema.safeParse(event)
    if (!parsed.success) return ignore('payload_incompleto', eventType, accountId)
    const mail = parsed.data
    const sender = mail.from_attendee?.identifier
    if (!mail.email_id || !sender) return ignore('payload_incompleto', eventType, accountId)
    const plain = present(mail.body_plain)
    // Liga a resposta ao envio quando o envio da v1 só guardou o id do e-mail (sem conversa nem Message-ID): ingest_unipile_email_event
    // compara `in_reply_to.id` com o id do e-mail enviado e `in_reply_to.message_id` com o Message-ID enviado.
    const replyToId = mail.in_reply_to?.id
    const replyToMessageId = present(mail.in_reply_to?.message_id)
    return {
      kind: 'email',
      // O id do e-mail só é único dentro da conta: o prefixo faz a deduplicação por event_id valer.
      event_id: `${accountId}:${mail.email_id}`,
      account_id: accountId,
      event_type: 'email.new',
      email: {
        id: mail.email_id,
        ...(present(mail.message_id) ? { message_id: mail.message_id } : {}),
        ...(mail.thread_id ? { thread_id: mail.thread_id } : {}),
        ...(mail.date ? { date: mail.date } : {}),
        from: { email: sender, ...(present(mail.from_attendee?.display_name) ? { display_name: mail.from_attendee?.display_name } : {}) },
        ...(mail.subject !== undefined ? { subject: mail.subject } : {}),
        ...(present(mail.body ?? plain) ? { body: mail.body ?? plain } : {}),
        ...(plain ? { snippet: plain.slice(0, SNIPPET_LIMIT) } : {}),
        ...(mail.attachments ? { attachments: mail.attachments } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
        ...(replyToId || replyToMessageId
          ? { in_reply_to: { ...(replyToId ? { id: replyToId } : {}), ...(replyToMessageId ? { message_id: replyToMessageId } : {}) } }
          : {}),
      },
      // A v1 não diz o endereço do titular no aviso: o banco compara com o e-mail que a Conta remetente já conhece.
      owner_addresses: [],
    }
  }

  if (eventType === 'message_received') {
    const parsed = messageSchema.safeParse(event)
    if (!parsed.success) return ignore('payload_incompleto', eventType, accountId)
    const message = parsed.data
    const channel = (message.account_type ?? '').toLowerCase()
    if (channel !== 'whatsapp' && channel !== 'linkedin') return ignore('canal_nao_suportado', eventType, accountId)
    if (message.is_event || message.deleted) return ignore('evento_sem_texto', eventType, accountId)
    // Anúncios do LinkedIn (mensagem patrocinada, oferta) vêm como conversa somente leitura: ninguém responde.
    if (['sponsored', 'linkedin_offer'].includes((message.content_type ?? '').toLowerCase())) {
      return ignore('anuncio_do_canal', eventType, accountId)
    }
    // Mensagem da própria conta (do celular, por exemplo) não é resposta de contato.
    const owner = message.account_info?.user_id
    const senderId = message.sender?.attendee_provider_id
    if (message.is_sender || (owner && owner === senderId)) return ignore('mensagem_propria', eventType, accountId)
    if (message.is_group || (message.attendees?.length ?? 0) > 2) return ignore('grupo', eventType, accountId)
    if (!message.message_id || !message.chat_id) return ignore('payload_incompleto', eventType, accountId)
    return {
      kind: 'message',
      event_id: `${accountId}:${message.message_id}`,
      account_id: accountId,
      event_type: 'message.new',
      payload: {
        id: message.message_id,
        chat_id: message.chat_id,
        ...(senderId ? { sender_id: senderId } : {}),
        ...(present(message.sender?.attendee_name) ? { sender_name: message.sender?.attendee_name } : {}),
        // Só afirma "não é do titular" quando sabe quem o titular é; senão o banco decide pela identidade que já aprendeu
        // (e, sem ela, deixa a mensagem sem relação em vez de pausar uma Sequência por uma mensagem do próprio titular).
        ...(owner ? { is_sender: false } : {}),
        ...(message.message ? { text: message.message } : {}),
        ...(message.timestamp ? { date: message.timestamp } : {}),
        is_event: false,
        deleted: false,
        attachments: message.attachments ?? [],
      },
    }
  }

  return ignore('evento_desconhecido', eventType, accountId)
}
