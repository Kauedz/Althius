import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendStepDbVia } from '../_shared/send-step-adapters.ts'
import { sendChatStepDbVia } from '../_shared/send-chat-step-adapters.ts'
import { createUnipileRuntime, unipileUnavailableResponse } from '../_shared/unipile/index.ts'
import { stepAttachmentSourceVia } from '../_shared/anexos-do-envio.ts'
import {
  type ChatRunnerDb,
  type ChatToReconcile,
  type ConversationToReconcile,
  createHandler,
  type DueSend,
  type RunnerDb,
  type SenderToReconcile,
} from './handler.ts'
import type { ReleaseResult } from '../_shared/send-step.ts'
import type { ChatReleaseResult } from '../_shared/send-chat-step.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// A conta Unipile que envia é a conexão ativa (ADR-0024), lida a cada pedido (em cache por 30 s): trocar de conta não
// pede deploy. Sem conexão ativa, o Executor nem reserva envio: responde 503 e os passos esperam.
const unipile = createUnipileRuntime({ rpc: admin, env: Deno.env })

const db: RunnerDb = {
  ...sendStepDbVia(admin),
  async tokenMatches(token) {
    const { data, error } = await admin.rpc('sequence_runner_token_matches', { p_token: token })
    if (error) throw error
    return data === true
  },
  async claimDueSends(limit) {
    const { data, error } = await admin.rpc('claim_due_step_sends', { p_limit: limit })
    if (error) throw error
    return (data ?? []) as DueSend[]
  },
  async claimSenderReconciliations(limit) {
    const { data, error } = await admin.rpc('claim_sender_reconciliations', { p_limit: limit })
    if (error) throw error
    return (data ?? []) as SenderToReconcile[]
  },
  async conversationsToReconcile(senderAccountId, limit) {
    const { data, error } = await admin.rpc('conversations_to_reconcile', {
      p_sender_account_id: senderAccountId,
      p_limit: limit,
    })
    if (error) throw error
    return (data ?? []) as ConversationToReconcile[]
  },
  async recordReconciliationProgress(senderAccountId, claimedAt, checked) {
    const { data, error } = await admin.rpc('record_reconciliation_progress', {
      p_sender_account_id: senderAccountId,
      p_claimed_at: claimedAt,
      p_checked_at: checked.sent_at,
      p_checked_send: checked.send_id,
    })
    if (error) throw error
    return data === true
  },
  async finishSenderReconciliation(senderAccountId, claimedAt) {
    const { data, error } = await admin.rpc('finish_sender_reconciliation', {
      p_sender_account_id: senderAccountId,
      p_claimed_at: claimedAt,
    })
    if (error) throw error
    return data === true
  },
  async renewDueClaims(sendIds) {
    const { data, error } = await admin.rpc('renew_due_step_send_claims', { p_send_ids: sendIds })
    if (error) throw error
    return typeof data === 'number' ? data : 0
  },
  async releaseDueSend(sendId) {
    const { data, error } = await admin.rpc('release_due_step_send', { p_send_id: sendId })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as ReleaseResult | undefined
    if (!row) throw Object.assign(new Error('send not found'), { code: 'P0002' })
    return row
  },
}

// WhatsApp e LinkedIn (canais-06 e canais-07): o mesmo Executor, os mesmos relógios, as RPCs irmãs do e-mail.
const chatDb: ChatRunnerDb = {
  ...sendChatStepDbVia(admin),
  async claimDueChatSends(limit) {
    const { data, error } = await admin.rpc('claim_due_chat_step_sends', { p_limit: limit })
    if (error) throw error
    return (data ?? []) as DueSend[]
  },
  async releaseDueChatSend(sendId) {
    const { data, error } = await admin.rpc('release_due_chat_step_send', { p_send_id: sendId })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as ChatReleaseResult | undefined
    if (!row) throw Object.assign(new Error('send not found'), { code: 'P0002' })
    return row
  },
  async chatsToReconcile(senderAccountId, limit) {
    const { data, error } = await admin.rpc('chats_to_reconcile', {
      p_sender_account_id: senderAccountId,
      p_limit: limit,
    })
    if (error) throw error
    return (data ?? []) as ChatToReconcile[]
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para os envios terminarem.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

const handlerFor = (bridge: NonNullable<Awaited<ReturnType<typeof unipile.bridge>>>) =>
  createHandler({
    db,
    unipile: bridge,
    chat: { db: chatDb, unipile: bridge },
    attachments: stepAttachmentSourceVia(admin),
    // Ritmo de envio: 1 a 4 s entre dois envios da mesma execução. O intervalo por Conta remetente é do banco.
    pauseBetweenSendsMs: { min: 1000, max: 4000 },
    async holdForUnreadySend(sendId) {
      const { data, error } = await admin.rpc('hold_sequence_for_unready_send', { p_send_id: sendId })
      if (error) throw error
      return data === true
    },
    waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
  })

Deno.serve(async (req) => {
  const bridge = await unipile.bridge()
  return bridge ? handlerFor(bridge)(req) : unipileUnavailableResponse()
})
