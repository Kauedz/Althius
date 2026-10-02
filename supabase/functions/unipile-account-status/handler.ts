// Único receptor de webhook da Unipile v2: eventos de conta (account.*) e de e-mail (email.new,
// email.new.bounce), assinados por HMAC-SHA256. A função grava e responde 2xx em menos de 5 s; o que decide
// fica nas RPCs (apply_unipile_sender_status, complete_sender_connection_attempt, ingest_unipile_email_event).
// O trabalho pesado (baixar anexos) roda depois da resposta. O banco, a Unipile e o Storage entram por
// injeção de dependência, para o teste ir da requisição à resposta sem rede.

import type { EmailAttachmentRef, IngestedEmail, IngestEmailEventInput } from '../_shared/ingest-email-event.ts'
import {
  CHAT_MESSAGE_EVENTS,
  CHAT_RELATION_EVENTS,
  type ChatEventType,
  type IngestChatEventInput,
  type IngestedChat,
} from '../_shared/ingest-chat-event.ts'
export type { EmailAttachmentRef, IngestedEmail }

export interface WebhookDb {
  /** RPC complete_sender_connection_attempt: devolve o desfecho ('completed', 'ignored', …). */
  completeSenderConnectionAttempt(input: {
    attemptId: string
    unipileAccountId: string
    provider: string
    initialStatus: 'CREATION_SUCCESS' | 'RECONNECTED'
  }): Promise<string>
  /** RPC apply_unipile_sender_status: true quando alguma Conta remetente mudou. */
  applyUnipileSenderStatus(unipileAccountId: string, status: string): Promise<boolean>
  /**
   * RPC hold_sequences_of_lost_sender (canais-11): depois da queda gravada, pausa com o motivo as Sequências ativas que
   * usam a conta. Devolve quantas pausou. Sem ela, a queda só bloqueia os envios, como antes.
   */
  holdSequencesOfLostSender?(unipileAccountId: string): Promise<number>
  /** RPC ingest_unipile_email_event. */
  ingestEmailEvent(input: IngestEmailEventInput): Promise<IngestedEmail>
  /**
   * RPC ingest_unipile_chat_event: `message.new` (WhatsApp e LinkedIn) e o evento de nova relação do LinkedIn.
   * Sem ela, esses eventos são só reconhecidos (HTTP 200) e ignorados, como antes do canais-06.
   */
  ingestChatEvent?(input: IngestChatEventInput): Promise<IngestedChat>
  /** RPC record_received_email_attachment. */
  recordReceivedEmailAttachment(input: {
    interactionId: string
    attachmentId: string
    storagePath: string | null
    status: 'stored' | 'failed'
  }): Promise<void>
}

export interface WebhookUnipile {
  /** Baixa um anexo: pela url que veio no Email ou por GET /v2/{account_id}/emails/{email_id}/attachments/{id}. */
  downloadEmailAttachment(
    accountId: string,
    emailId: string,
    attachment: EmailAttachmentRef,
  ): Promise<{ bytes: Uint8Array; contentType: string | null }>
}

export interface AttachmentStore {
  /** Grava no bucket privado dos anexos recebidos. */
  upload(path: string, bytes: Uint8Array, contentType: string | null): Promise<void>
}

export interface Deps {
  secret: string
  db: WebhookDb
  unipile: WebhookUnipile
  storage: AttachmentStore
  /** Relógio, para a janela de 5 minutos da assinatura. Padrão Date.now. */
  now?: () => number
  /** Continua um trabalho depois da resposta (EdgeRuntime.waitUntil). Padrão: fire-and-forget. */
  waitUntil?: (work: Promise<unknown>) => void
  /** Uma linha por entrega: tipo, conta e desfecho, nunca o conteúdo. Padrão console.log em JSON. */
  log?: (fields: Record<string, unknown>) => void
}

const jsonHeaders = { 'Content-Type': 'application/json' }

// Unipile v2 assina cada entrega com HMAC-SHA256: header "unipile-signature: t=<epoch
// em segundos>,v0=<hex>", assinatura sobre "${t}.${rawBody}" usando o secret que a própria
// Unipile gerou ao criar o Webhook Endpoint (POST /v2/webhooks/endpoints).
export async function verifySignature(rawBody: string, header: string, secret: string, now = Date.now()) {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=') as [string, string]))
  const timestamp = parts.t
  const providedSignature = parts.v0
  if (!timestamp || !providedSignature) return false

  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    return false
  }

  const computedSignature = await signWebhookBody(rawBody, timestamp, secret)
  if (computedSignature.length !== providedSignature.length) return false
  let mismatch = 0
  for (let i = 0; i < computedSignature.length; i++) {
    mismatch |= computedSignature.charCodeAt(i) ^ providedSignature.charCodeAt(i)
  }
  return mismatch === 0
}

/** O hex de HMAC-SHA256("${timestamp}.${rawBody}") com o secret: o que a Unipile põe em v0. */
export async function signWebhookBody(rawBody: string, timestamp: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  return Array.from(new Uint8Array(signatureBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Traduz os event types de conta da v2 para o vocabulário que apply_unipile_sender_status já entende
// (a RPC não muda: SYNC_SUCCESS/CREDENTIALS/ERROR/OK/DELETED já existiam para os mesmos significados na v1).
const STATUS_EVENTS: Record<string, string> = {
  'account.initial_sync.completed': 'SYNC_SUCCESS',
  'account.status.running': 'OK',
  'account.status.disconnected': 'CREDENTIALS',
  'account.status.errored': 'ERROR',
  'account.remove': 'DELETED',
}

// Os estados que dizem que a conta caiu de vez (credenciais revogadas ou expiradas, erro, removida): a Sequência pausa.
const LOST_STATUSES = new Set(['CREDENTIALS', 'ERROR', 'DELETED'])

// Na v2 só WhatsApp e IMAP fazem sincronização inicial (docs/initial-sync); os outros provedores já
// chegam com o histórico disponível, então nunca mandam account.initial_sync.completed.
const PROVIDERS_WITH_INITIAL_SYNC = new Set(['whatsapp', 'imap'])

const EMAIL_EVENTS = new Set(['email.new', 'email.new.bounce'])

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Um único segmento de caminho: sem barras, sem nomes só de pontos, no máximo 120 caracteres. */
function pathSegment(value: string, fallback: string) {
  const cleaned = value.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120)
  return !cleaned || /^\.+$/.test(cleaned) ? fallback : cleaned
}

const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-download'])
const TYPES_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

/** O tipo guardado no Storage: o do download ou o do Email quando dizem algo; senão, pela extensão do nome. */
export function attachmentContentType(downloaded: string | null, attachment: { name?: string; mime?: string }) {
  for (const candidate of [downloaded, attachment.mime]) {
    const type = candidate?.split(';')[0].trim().toLowerCase() ?? ''
    if (!GENERIC_TYPES.has(type)) return candidate!.trim()
  }
  const extension = attachment.name?.split('.').pop()?.toLowerCase() ?? ''
  return TYPES_BY_EXTENSION[extension] ?? null
}

/** O caminho de um anexo no bucket privado email-attachments. Ids longos (Outlook) viram um hash, porque
 * cortados colidiriam entre anexos do mesmo Email e o upload com upsert sobrescreveria um com o outro. */
export async function attachmentPath(interactionId: string, attachmentId: string, name: string) {
  const idSegment = attachmentId.length > 120 ? await sha256Hex(attachmentId) : pathSegment(attachmentId, 'anexo')
  return `recebidos/${pathSegment(interactionId, 'interacao')}/${idSegment}/${pathSegment(name, 'anexo')}`
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const now = deps.now ?? Date.now
  const waitUntil = deps.waitUntil ?? ((work) => {
    work.catch((error) =>
      log({ outcome: 'background_error', message: error instanceof Error ? error.message : String(error) })
    )
  })

  const received = () => new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders })

  async function downloadAttachments(accountId: string, emailId: string, ingested: IngestedEmail) {
    for (const attachment of ingested.attachments) {
      if (!ingested.interaction_id) return
      try {
        const file = await deps.unipile.downloadEmailAttachment(accountId, emailId, attachment)
        const path = await attachmentPath(ingested.interaction_id, attachment.id, attachment.name ?? 'anexo')
        await deps.storage.upload(path, file.bytes, attachmentContentType(file.contentType, attachment))
        await deps.db.recordReceivedEmailAttachment({
          interactionId: ingested.interaction_id,
          attachmentId: attachment.id,
          storagePath: path,
          status: 'stored',
        })
        log({ type: 'attachment', accountId, outcome: 'stored' })
      } catch (error) {
        log({
          type: 'attachment',
          accountId,
          outcome: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
        await deps.db.recordReceivedEmailAttachment({
          interactionId: ingested.interaction_id,
          attachmentId: attachment.id,
          storagePath: null,
          status: 'failed',
        }).catch(() => {})
      }
    }
  }

  return async (req) => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const signatureHeader = req.headers.get('unipile-signature')
    if (!deps.secret || !signatureHeader) {
      log({ outcome: 'unauthorized', reason: deps.secret ? 'missing_signature' : 'missing_secret' })
      return new Response('Unauthorized', { status: 401 })
    }

    const rawBody = await req.text()
    if (!(await verifySignature(rawBody, signatureHeader, deps.secret, now()))) {
      log({ outcome: 'unauthorized', reason: 'invalid_signature' })
      return new Response('Unauthorized', { status: 401 })
    }

    try {
      const event = JSON.parse(rawBody)
      const type = typeof event?.type === 'string' ? event.type : ''
      const accountId = typeof event?.account_id === 'string' ? event.account_id : ''
      if (!type || !accountId) {
        log({ type, outcome: 'invalid_event' })
        return new Response('Invalid event', { status: 400 })
      }

      if (type === 'account.add' || type === 'account.reconnect') {
        const attemptId = typeof event?.payload?.state === 'string' ? event.payload.state : ''
        const provider = typeof event?.payload?.account?.provider === 'string'
          ? event.payload.account.provider
          : typeof event?.account_provider === 'string'
          ? event.account_provider
          : ''
        if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !provider) {
          log({ type, accountId, provider, hasState: attemptId !== '', outcome: 'invalid_event' })
          return new Response('Invalid event', { status: 400 })
        }
        let data: string
        try {
          data = await deps.db.completeSenderConnectionAttempt({
            attemptId,
            unipileAccountId: accountId,
            provider: provider.toUpperCase(),
            initialStatus: type === 'account.add' ? 'CREATION_SUCCESS' : 'RECONNECTED',
          })
        } catch {
          log({ type, accountId, provider, outcome: 'rpc_error' })
          return new Response('Event could not be processed', { status: 500 })
        }
        log({ type, accountId, provider, outcome: data })
        if (data !== 'completed' && data !== 'ignored') {
          return new Response('Event rejected', { status: 409 })
        }
        // Só na primeira entrega: uma repetição tardia não pode tirar a conta de reconnect_required.
        const syncFinished = !PROVIDERS_WITH_INITIAL_SYNC.has(provider.toLowerCase()) ||
          event?.payload?.account?.initial_sync?.status === 'completed'
        if (data === 'completed' && syncFinished) {
          try {
            const applied = await deps.db.applyUnipileSenderStatus(accountId, 'SYNC_SUCCESS')
            log({ type, accountId, status: 'SYNC_SUCCESS', outcome: applied ? 'applied' : 'no_matching_account' })
          } catch {
            log({ type, accountId, status: 'SYNC_SUCCESS', outcome: 'rpc_error' })
            return new Response('Event could not be processed', { status: 500 })
          }
        }
        return received()
      }

      const mappedStatus = STATUS_EVENTS[type]
      if (mappedStatus) {
        try {
          const applied = await deps.db.applyUnipileSenderStatus(accountId, mappedStatus)
          log({ type, accountId, status: mappedStatus, outcome: applied ? 'applied' : 'no_matching_account' })
        } catch {
          log({ type, accountId, status: mappedStatus, outcome: 'rpc_error' })
          return new Response('Event could not be processed', { status: 500 })
        }
        // A queda já está gravada e bloqueia os envios; pausar é o passo seguinte. Se falhar, o Executor pausa quando
        // o próximo passo for barrado, então o evento é confirmado mesmo assim.
        if (LOST_STATUSES.has(mappedStatus) && deps.db.holdSequencesOfLostSender) {
          try {
            const held = await deps.db.holdSequencesOfLostSender(accountId)
            log({ type, accountId, outcome: 'sequences_held', held })
          } catch {
            log({ type, accountId, outcome: 'hold_failed' })
          }
        }
        return received()
      }

      if (EMAIL_EVENTS.has(type)) {
        // O payload traz folder_id e email (o objeto Email). Alguns envelopes trazem o Email direto no payload.
        const payload = event?.payload
        const email = payload && typeof payload.email === 'object' && payload.email
          ? payload.email
          : payload && typeof payload?.id === 'string'
          ? payload
          : null
        const eventId = typeof event?.id === 'string' && event.id ? event.id : ''
        if (!email || typeof email.id !== 'string' || !eventId) {
          log({ type, accountId, outcome: 'invalid_event' })
          return new Response('Invalid event', { status: 400 })
        }
        // O endereço do titular vem no envelope (account_name) quando o provedor é de e-mail.
        const ownerAddresses = [event?.account_name, payload?.account_name]
          .filter((value): value is string => typeof value === 'string' && EMAIL_ADDRESS.test(value.trim()))
          .map((value) => value.trim().toLowerCase())

        let ingested: IngestedEmail
        try {
          ingested = await deps.db.ingestEmailEvent({
            eventId,
            eventType: type as 'email.new' | 'email.new.bounce',
            unipileAccountId: accountId,
            email,
            ownerAddresses,
          })
        } catch {
          log({ type, accountId, outcome: 'rpc_error' })
          return new Response('Event could not be processed', { status: 500 })
        }
        log({ type, accountId, outcome: ingested.outcome, attachments: ingested.attachments?.length ?? 0 })
        if (ingested.outcome === 'reply' && ingested.interaction_id && ingested.attachments?.length) {
          waitUntil(downloadAttachments(accountId, email.id, ingested))
        }
        return received()
      }

      // WhatsApp e LinkedIn: o payload de `message.new` é o próprio objeto Message (recebida E enviada); o banco
      // distingue o eco do titular da resposta do Contato. A nova relação (aceite de convite) é só registrada.
      if (deps.db.ingestChatEvent && (CHAT_MESSAGE_EVENTS.has(type) || CHAT_RELATION_EVENTS.has(type))) {
        const payload = event?.payload
        const eventId = typeof event?.id === 'string' && event.id ? event.id : ''
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !eventId) {
          log({ type, accountId, outcome: 'invalid_event' })
          return new Response('Invalid event', { status: 400 })
        }
        let ingested: IngestedChat
        try {
          ingested = await deps.db.ingestChatEvent({
            eventId,
            eventType: type as ChatEventType,
            unipileAccountId: accountId,
            payload,
          })
        } catch {
          log({ type, accountId, outcome: 'rpc_error' })
          return new Response('Event could not be processed', { status: 500 })
        }
        log({ type, accountId, outcome: ingested.outcome })
        return received()
      }

      log({ type, accountId, outcome: 'ignored' })
      return received()
    } catch (error) {
      log({ outcome: 'error', message: error instanceof Error ? error.message : String(error) })
      return new Response('Invalid event', { status: 400 })
    }
  }
}
