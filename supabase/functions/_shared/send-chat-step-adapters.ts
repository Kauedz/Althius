// Os adaptadores reais do núcleo do envio de conversa: a Unipile v2 por HTTP (chats, mensagens, convites e perfis) e o
// banco pelas RPCs, com o cliente service_role. Ficam num arquivo à parte do e-mail (send-step-adapters.ts).
//
// Contrato da Unipile v2 levantado por busca (a documentação oficial é bloqueada onde isto foi escrito). O que está
// marcado com `não confirmado:` precisa ser conferido no primeiro envio real; os nomes de campo ficam nas constantes
// abaixo, para a correção ser de uma linha.
import { ingestChatEventVia } from './ingest-chat-event.ts'
import { retryAfterSeconds } from './send-step-adapters.ts'
import {
  type ChatConversation,
  type ChatSendDb,
  type ChatSent,
  type InvitationSent,
  type LinkedInProfile,
  type UnipileChat,
  UnipileChatRequestError,
} from './send-chat-step.ts'
import { UnipileUnreadableResponse } from './send-step.ts'

const UNIPILE_API_BASE = 'https://api.unipile.com'

/** Quantas mensagens recentes de uma conversa a conferência lê. */
export const CHAT_CHECK_MESSAGE_LIMIT = 50

// não confirmado: o guia de migração diz `users_ids` (uma identidade ou uma lista); um exemplo do guia de envio mostra
// `user_ids`. Se a Unipile recusar o campo, é só trocar esta constante.
export const START_CHAT_USERS_FIELD = 'users_ids'
// não confirmado: onde a Unipile v2 diz o id nativo do perfil e a distância de rede (1º grau = conexão).
export const LINKEDIN_PROFILE_ID_FIELDS = ['id', 'provider_id', 'user_id'] as const
export const LINKEDIN_DISTANCE_FIELDS = ['network_distance', 'distance', 'connection_degree', 'relation'] as const
const INVITATION_ID_FIELDS = ['id', 'invitation_id', 'relation_request_id'] as const
const LIST_FIELDS = ['items', 'messages', 'data'] as const

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function sendChatStepDbVia(admin: RpcClient): ChatSendDb {
  return {
    async chatConversationForSend(sendId, userId) {
      const { data, error } = await admin.rpc('chat_conversation_for_send', { p_send_id: sendId, p_user_id: userId })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as ChatConversation | undefined
      return row ?? null
    },
    ingestChatEvent: ingestChatEventVia(admin),
    async recordChatStepSendResult(input) {
      const { error } = await admin.rpc('record_chat_step_send_result', {
        p_send_id: input.sendId,
        p_outcome: input.outcome,
        p_provider_chat_id: input.providerChatId ?? null,
        p_provider_message_id: input.providerMessageId ?? null,
        p_provider_user_id: input.providerUserId ?? null,
        p_linkedin_action: input.linkedinAction ?? null,
        p_error: input.error ?? null,
        p_retry_after_seconds: input.retryAfterSeconds ?? null,
      })
      if (error) throw error
    },
  }
}

function firstString(object: Record<string, unknown>, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = object[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

/**
 * O motivo de uma recusa da Unipile, em um código que o Vendedor responsável entende. Quem decide é o texto da
 * resposta (tipo, código, título ou detalhe), em minúsculas; o status só ajuda. Sem pista, vira `http_<status>`.
 * não confirmado: o formato dos erros da Unipile v2; as pistas abaixo são palavras que a busca encontrou.
 */
export function classifyProviderError(status: number, bodyText: string): string {
  const text = bodyText.toLowerCase()
  if (/credit/.test(text) || status === 402) return 'insufficient_credits'
  if (/(already|pending).*(invit|connect|relation)|(invit|connect|relation).*(already|pending)|already_?invited/.test(text)) {
    return 'invite_already_pending'
  }
  if (/(too.?long|max.*(length|char)|exceed|character.?limit|note.*limit)/.test(text)) return 'invite_note_too_long'
  if (/(subscription|premium|sales.?navigator|recruiter|upgrade|not.?entitled|plan)/.test(text)) return 'subscription_required'
  if (/(not.?connected|not.?a.?connection|no.?relation|cannot.?message|first.?degree|not.?allowed.*messag|messag.*not.?allowed)/.test(text)) {
    return 'not_connected'
  }
  if (/(invalid|unknown|not.?found).*(user|recipient|profile|number|phone)|(user|recipient|profile|number|phone).*(invalid|not.?found|not exist)/.test(text)) {
    return 'recipient_not_found'
  }
  if (/(limit|quota|restrict)/.test(text)) return 'provider_limit_reached'
  return `http_${status}`
}

function parseFirstDegree(raw: unknown): boolean | null {
  if (typeof raw === 'number') return raw === 1
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return null
  const value = raw.trim().toUpperCase()
  if (!value) return null
  if (/^(FIRST|1ST|1|DISTANCE_1|FIRST_DEGREE|CONNECTED|CONNECTION)$/.test(value)) return true
  if (/^(SECOND|2ND|2|3|3RD|THIRD|DISTANCE_2|DISTANCE_3|SECOND_DEGREE|THIRD_DEGREE|OUT_OF_NETWORK|NOT_CONNECTED|NONE)$/.test(value)) {
    return false
  }
  return null
}

/** O perfil que a Unipile devolveu: o id nativo e se já é conexão. Sem id, a resposta é ilegível. */
export function readLinkedInProfile(data: unknown): LinkedInProfile {
  if (!data || typeof data !== 'object') throw new UnipileUnreadableResponse()
  const object = data as Record<string, unknown>
  const providerId = firstString(object, LINKEDIN_PROFILE_ID_FIELDS)
  if (!providerId) throw new UnipileUnreadableResponse()
  let firstDegree: boolean | null = null
  for (const field of LINKEDIN_DISTANCE_FIELDS) {
    if (field in object) {
      firstDegree = parseFirstDegree(object[field])
      if (firstDegree !== null) break
    }
  }
  if (firstDegree === null && typeof object.is_connection === 'boolean') firstDegree = object.is_connection
  return { providerId, firstDegree }
}

/**
 * Os ids de uma resposta de envio. Sem nenhum, a resposta é ilegível: o envio provavelmente saiu, então fica incerto.
 * não confirmado: onde a Unipile v2 traz os ids. Aqui, `chat_id` e `message_id` valem sempre; um `id` sozinho é o da
 * conversa ao abrir uma (knownChatId nulo) e o da mensagem ao continuar uma.
 */
export function readChatSent(data: unknown, knownChatId: string | null = null): ChatSent {
  if (!data || typeof data !== 'object') throw new UnipileUnreadableResponse()
  const object = data as Record<string, unknown>
  const plainId = firstString(object, ['id'])
  const chatId = firstString(object, ['chat_id']) ?? knownChatId ?? plainId
  const messageId = firstString(object, ['message_id']) ?? (knownChatId !== null ? plainId : null)
  if (!chatId && !messageId) throw new UnipileUnreadableResponse()
  return { chat_id: chatId, message_id: messageId }
}

export function unipileChatVia(apiKey: string, fetchImpl: typeof fetch = fetch): UnipileChat {
  const headers = { 'X-API-KEY': apiKey, accept: 'application/json' }

  async function refuse(upstream: Response): Promise<never> {
    // O corpo da recusa só serve para achar o motivo; nada dele vai para log nem para o banco além do código.
    const text = await upstream.text().catch(() => '')
    throw new UnipileChatRequestError(
      upstream.status,
      retryAfterSeconds(upstream.headers.get('retry-after')),
      upstream.status >= 400 && upstream.status < 500 && upstream.status !== 408 && upstream.status !== 429
        ? classifyProviderError(upstream.status, text.slice(0, 2000))
        : null,
    )
  }

  async function post(path: string, body: Record<string, unknown>, signal: AbortSignal) {
    const upstream = await fetchImpl(`${UNIPILE_API_BASE}${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!upstream.ok) await refuse(upstream)
    return upstream.json().catch(() => {
      throw new UnipileUnreadableResponse()
    })
  }

  async function get(path: string, signal?: AbortSignal) {
    const upstream = await fetchImpl(`${UNIPILE_API_BASE}${path}`, { headers, signal })
    if (!upstream.ok) await refuse(upstream)
    return upstream.json().catch(() => {
      throw new UnipileUnreadableResponse()
    })
  }

  const account = (accountId: string) => `/v2/${encodeURIComponent(accountId)}`

  return {
    // Os anexos (canais-10) vão no mesmo JSON, com o conteúdo em base64, como no e-mail da v2.
    // não confirmado: o campo `attachments` e o formato de cada item no envio de mensagem da v2.
    async startChat(accountId, { userId, text, attachments }, { signal }) {
      return readChatSent(await post(`${account(accountId)}/chats/send`, {
        [START_CHAT_USERS_FIELD]: [userId],
        text,
        ...(attachments?.length ? { attachments } : {}),
      }, signal))
    },
    async sendChatMessage(accountId, chatId, text, { signal, attachments }) {
      return readChatSent(
        await post(`${account(accountId)}/chats/${encodeURIComponent(chatId)}/messages/send`, {
          text,
          ...(attachments?.length ? { attachments } : {}),
        }, signal),
        chatId,
      )
    },
    async sendInvitation(accountId, { userId, message }, { signal }): Promise<InvitationSent> {
      const data = await post(`${account(accountId)}/users/me/relation-requests`, { user_id: userId, message }, signal)
      const id = data && typeof data === 'object' ? firstString(data as Record<string, unknown>, INVITATION_ID_FIELDS) : null
      if (!id) throw new UnipileUnreadableResponse()
      return { id }
    },
    async getLinkedInProfile(accountId, identifier, { signal }) {
      return readLinkedInProfile(await get(`${account(accountId)}/users/${encodeURIComponent(identifier)}`, signal))
    },
    async listChatMessages(accountId, chatId) {
      const data = await get(
        `${account(accountId)}/chats/${encodeURIComponent(chatId)}/messages?limit=${CHAT_CHECK_MESSAGE_LIMIT}`,
      )
      let list: unknown = data
      if (!Array.isArray(list) && data && typeof data === 'object') {
        for (const field of LIST_FIELDS) {
          const candidate = (data as Record<string, unknown>)[field]
          if (Array.isArray(candidate)) {
            list = candidate
            break
          }
        }
      }
      return Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []
    },
  }
}
