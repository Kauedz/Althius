// Leitores do que a Unipile devolve nos chats e nos perfis, iguais nas duas versões: a diferença de nomes de campo fica
// nos schemas (v1.ts e v2.ts), e a decisão (conexão ou não, quais ids valem) é daqui. Antes moravam em
// send-chat-step-adapters.ts, que os reexporta.
import { readResponse } from './common.ts'
import { UnipileUnreadableResponse } from './errors.ts'
import { v1 } from './v1.ts'
import { v2 } from './v2.ts'
import type { ChatSent, LinkedInProfile } from '../send-chat-step.ts'

/** Quantas mensagens recentes de uma conversa a conferência lê. */
export const CHAT_CHECK_MESSAGE_LIMIT = 50

// não confirmado: o guia de migração diz `users_ids` (uma identidade ou uma lista); um exemplo do guia de envio mostra
// `user_ids`. Se a Unipile recusar o campo, é só trocar esta constante.
export const START_CHAT_USERS_FIELD = 'users_ids'
// não confirmado: onde a Unipile v2 diz a distância de rede (1º grau = conexão); o id nativo do perfil e os nomes
// possíveis estão em v2.ts (resolveProfile).
export const LINKEDIN_DISTANCE_FIELDS = ['network_distance', 'distance', 'connection_degree', 'relation'] as const

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
export function readLinkedInProfile(data: unknown, version: 'v1' | 'v2' = 'v2'): LinkedInProfile {
  const object = readResponse(version === 'v1' ? v1.resolveProfile.response : v2.resolveProfile.response, data) as
    & Record<string, unknown>
    & { id?: string; provider_id?: string; user_id?: string }
  // Na v1 o id nativo vem em `provider_id`; na v2, em `id`.
  const providerId = version === 'v1'
    ? object.provider_id ?? object.id
    : object.id ?? object.provider_id ?? object.user_id
  if (!providerId) throw new UnipileUnreadableResponse()
  let firstDegree: boolean | null = null
  for (const field of LINKEDIN_DISTANCE_FIELDS) {
    firstDegree = parseFirstDegree(object[field])
    if (firstDegree !== null) break
  }
  if (firstDegree === null && typeof object.is_connection === 'boolean') firstDegree = object.is_connection
  return { providerId, firstDegree }
}

/**
 * Os ids de uma resposta de envio. Sem nenhum, a resposta é ilegível: o envio provavelmente saiu, então fica incerto.
 * não confirmado: onde a Unipile traz os ids. Aqui, `chat_id` e `message_id` valem sempre; um `id` sozinho é o da
 * conversa ao abrir uma (knownChatId nulo) e o da mensagem ao continuar uma.
 */
export function readChatSent(data: unknown, knownChatId: string | null = null, version: 'v1' | 'v2' = 'v2'): ChatSent {
  const sent = readResponse(version === 'v1' ? v1.startChat.response : v2.startChat.response, data)
  const chatId = sent.chat_id ?? knownChatId ?? sent.id
  const messageId = sent.message_id ?? (knownChatId !== null ? sent.id : null)
  if (!chatId && !messageId) throw new UnipileUnreadableResponse()
  return { chat_id: chatId, message_id: messageId }
}
