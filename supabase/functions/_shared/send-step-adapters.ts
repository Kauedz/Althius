// Os adaptadores reais do núcleo do envio: a Unipile v2 por HTTP e o banco pelas RPCs, com o cliente service_role.
import { ingestEmailEventVia } from './ingest-email-event.ts'
import type { ChatSent, UnipileChat, WhatsappReleaseResult, WhatsappStepDb } from './send-whatsapp.ts'
import {
  type Conversation,
  type EmailSent,
  type OutgoingEmail,
  type SendStepDb,
  type UnipileMail,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from './send-step.ts'

const UNIPILE_API_BASE = 'https://api.unipile.com'

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function sendStepDbVia(admin: RpcClient): SendStepDb {
  return {
    async conversationForSend(sendId, userId) {
      const { data, error } = await admin.rpc('conversation_for_send', { p_send_id: sendId, p_user_id: userId })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as Conversation | undefined
      return row ?? null
    },
    ingestEmailEvent: ingestEmailEventVia(admin),
    async recordStepSendResult(
      { sendId, outcome, providerEmailId, providerMessageId, error, retryAfterSeconds, providerChatId },
    ) {
      const { error: rpcError } = await admin.rpc('record_sequence_step_send_result', {
        p_send_id: sendId,
        p_outcome: outcome,
        p_provider_email_id: providerEmailId ?? null,
        p_provider_message_id: providerMessageId ?? null,
        p_error: error ?? null,
        p_retry_after_seconds: retryAfterSeconds ?? null,
        // Só o WhatsApp manda a conversa: o E-mail chama a RPC exatamente como antes da migration do canais-06.
        ...(providerChatId ? { p_provider_chat_id: providerChatId } : {}),
      })
      if (rpcError) throw rpcError
    },
  }
}

/** Retry-After em segundos, ou numa data HTTP; ausente ou ilegível, null. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  if (/^\d+$/.test(value.trim())) return Number(value.trim())
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000))
}

export function unipileMailVia(apiKey: string): UnipileMail {
  const headers = { 'X-API-KEY': apiKey, accept: 'application/json' }

  async function unipileGet(path: string) {
    const upstream = await fetch(`${UNIPILE_API_BASE}${path}`, { headers })
    if (!upstream.ok) {
      throw new UnipileRequestError(upstream.status, retryAfterSeconds(upstream.headers.get('retry-after')))
    }
    return upstream.json()
  }

  return {
    async getEmail(accountId, emailId) {
      const data = await unipileGet(`/v2/${encodeURIComponent(accountId)}/emails/${encodeURIComponent(emailId)}`)
      if (!data || typeof data !== 'object') throw new UnipileUnreadableResponse()
      return data as Record<string, unknown>
    },
    async listThreadEmails(accountId, threadId) {
      const data = await unipileGet(`/v2/${encodeURIComponent(accountId)}/threads/${encodeURIComponent(threadId)}`)
      const list = Array.isArray(data) ? data : data?.emails ?? data?.items ?? data?.messages ?? []
      return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []
    },
    async listEmailSenders(accountId) {
      const data = await unipileGet(`/v2/${encodeURIComponent(accountId)}/email-senders`)
      const list = Array.isArray(data) ? data : data?.items ?? data?.senders ?? []
      if (!Array.isArray(list)) return []
      return list
        .map((item) => typeof item === 'string' ? item : item?.email ?? item?.address ?? item?.identifier)
        .filter((value): value is string => typeof value === 'string' && value.includes('@'))
        .map((value) => value.trim().toLowerCase())
    },
    async sendEmail(accountId: string, email: OutgoingEmail, { signal }): Promise<EmailSent> {
      const upstream = await fetch(`${UNIPILE_API_BASE}/v2/${encodeURIComponent(accountId)}/emails/send`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(email),
        signal,
      })
      if (!upstream.ok) {
        throw new UnipileRequestError(upstream.status, retryAfterSeconds(upstream.headers.get('retry-after')))
      }
      const result = await upstream.json()
      if (typeof result?.id !== 'string') throw new UnipileUnreadableResponse()
      return { id: result.id, message_id: typeof result.message_id === 'string' ? result.message_id : null }
    },
  }
}

/**
 * A Unipile v2 para WhatsApp por HTTP. A chave vai só no cabeçalho `X-API-KEY`, nunca na URL. `fetchImpl` existe para o
 * teste trocar a rede por uma falsa.
 */
export function unipileChatVia(apiKey: string, fetchImpl: typeof fetch = fetch): UnipileChat {
  const headers = { 'X-API-KEY': apiKey, accept: 'application/json' }

  // A resposta desses envios não está documentada: qualquer 2xx é "aceito", e só o que vem como texto é lido.
  async function accepted(upstream: Response): Promise<ChatSent> {
    let data: unknown = null
    try {
      data = await upstream.json()
    } catch {
      // Corpo vazio ou ilegível não desfaz a aceitação.
    }
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null
    const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
    return { chatId: text(body.chat_id), messageId: text(body.message_id) }
  }

  async function post(path: string, body: Record<string, unknown>, signal: AbortSignal) {
    const upstream = await fetchImpl(`${UNIPILE_API_BASE}${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!upstream.ok) {
      await upstream.body?.cancel()
      throw new UnipileRequestError(upstream.status, retryAfterSeconds(upstream.headers.get('retry-after')))
    }
    return accepted(upstream)
  }

  return {
    async userExists(accountId, userId, { signal }) {
      const upstream = await fetchImpl(
        `${UNIPILE_API_BASE}/v2/${encodeURIComponent(accountId)}/users/${encodeURIComponent(userId)}`,
        { headers, signal },
      )
      await upstream.body?.cancel()
      if (upstream.status === 404) return false
      if (!upstream.ok) {
        throw new UnipileRequestError(upstream.status, retryAfterSeconds(upstream.headers.get('retry-after')))
      }
      return true
    },
    startChat(accountId, userId, text, { signal }) {
      return post(`/v2/${encodeURIComponent(accountId)}/chats/send`, { user_ids: [userId], text }, signal)
    },
    sendInChat(accountId, chatId, text, { signal }) {
      return post(
        `/v2/${encodeURIComponent(accountId)}/chats/${encodeURIComponent(chatId)}/messages/send`,
        { text },
        signal,
      )
    },
  }
}

/** O banco para o passo de WhatsApp: as liberações, o bloqueio, o canal do Envio e o resultado, pelas RPCs. */
export function whatsappDbVia(admin: RpcClient): WhatsappStepDb {
  async function release(fn: string, args: Record<string, unknown>): Promise<WhatsappReleaseResult> {
    const { data, error } = await admin.rpc(fn, args)
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as WhatsappReleaseResult | undefined
    if (!row) throw Object.assign(new Error('send not found'), { code: 'P0002' })
    return row
  }
  return {
    recordStepSendResult: sendStepDbVia(admin).recordStepSendResult,
    async blockStep(sendId, reason) {
      const { error } = await admin.rpc('block_whatsapp_step_send', { p_send_id: sendId, p_reason: reason })
      if (error) throw error
    },
    releaseSend: (sendId, userId) => release('release_whatsapp_step_send', { p_send_id: sendId, p_user_id: userId }),
    releaseDueSend: (sendId) => release('release_due_whatsapp_step_send', { p_send_id: sendId }),
    async stepSendChannel(sendId, userId) {
      const { data, error } = await admin.rpc('step_send_channel', { p_send_id: sendId, p_user_id: userId })
      if (error) throw error
      return typeof data === 'string' ? data : null
    },
  }
}
