// Os adaptadores reais do núcleo do envio: o banco pelas RPCs, com o cliente service_role. A Unipile fala pela ponte
// (unipile/bridge.ts), que escolhe o adaptador pela conexão ativa; `unipileMailVia` é só a ponte v2 com uma chave dada.
import { ingestEmailEventVia } from './ingest-email-event.ts'
import type { Conversation, SendStepDb, UnipileMail } from './send-step.ts'
import { createBridge, DEFAULT_V2_BASE_URL, retryAfterSeconds } from './unipile/index.ts'

// O Retry-After mora no cliente único (unipile/client.ts); reexportado para quem importa daqui.
export { retryAfterSeconds }

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
    async recordStepSendResult({ sendId, outcome, providerEmailId, providerMessageId, error, retryAfterSeconds }) {
      const { error: rpcError } = await admin.rpc('record_sequence_step_send_result', {
        p_send_id: sendId,
        p_outcome: outcome,
        p_provider_email_id: providerEmailId ?? null,
        p_provider_message_id: providerMessageId ?? null,
        p_error: error ?? null,
        p_retry_after_seconds: retryAfterSeconds ?? null,
      })
      if (rpcError) throw rpcError
    },
  }
}

/**
 * A ponte v2 com a chave dada, no endereço padrão. As Edge Functions usam a ponte da conexão ativa
 * (unipile/connection.ts); isto fica para quem tem só a chave, como os testes.
 */
export function unipileMailVia(apiKey: string, fetchImpl?: typeof fetch): UnipileMail {
  return createBridge({ version: 'v2', baseUrl: DEFAULT_V2_BASE_URL, apiKey }, { fetch: fetchImpl })
}
