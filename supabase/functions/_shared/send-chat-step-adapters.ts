// Os adaptadores reais do núcleo do envio de conversa: o banco pelas RPCs, com o cliente service_role. A Unipile fala pela
// ponte (unipile/bridge.ts), que escolhe o adaptador pela conexão ativa. Ficam num arquivo à parte do e-mail
// (send-step-adapters.ts).
//
// O contrato de cada versão e o que ainda é `não confirmado:` (a conferir no primeiro envio real) estão em unipile/v1.ts,
// unipile/v2.ts e unipile/readers.ts; os nomes de campo ficam em constantes lá, para a correção ser de uma linha.
import { ingestChatEventVia } from './ingest-chat-event.ts'
import type { ChatConversation, ChatSendDb, UnipileChat } from './send-chat-step.ts'
import {
  CHAT_CHECK_MESSAGE_LIMIT,
  classifyProviderError,
  createBridge,
  DEFAULT_V2_BASE_URL,
  LINKEDIN_DISTANCE_FIELDS,
  readChatSent,
  readLinkedInProfile,
  START_CHAT_USERS_FIELD,
} from './unipile/index.ts'

// O motivo classificado de uma recusa e os leitores de perfil e de envio moram no contrato (unipile/errors.ts e
// unipile/readers.ts); reexportados para quem importa daqui.
export {
  CHAT_CHECK_MESSAGE_LIMIT,
  classifyProviderError,
  LINKEDIN_DISTANCE_FIELDS,
  readChatSent,
  readLinkedInProfile,
  START_CHAT_USERS_FIELD,
}

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

/**
 * A ponte v2 com a chave dada, no endereço padrão. As Edge Functions usam a ponte da conexão ativa
 * (unipile/connection.ts); isto fica para quem tem só a chave, como os testes.
 */
export function unipileChatVia(apiKey: string, fetchImpl?: typeof fetch): UnipileChat {
  return createBridge({ version: 'v2', baseUrl: DEFAULT_V2_BASE_URL, apiKey }, { fetch: fetchImpl })
}
