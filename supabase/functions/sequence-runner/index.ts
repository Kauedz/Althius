import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendStepDbVia, unipileMailVia } from '../_shared/send-step-adapters.ts'
import { sendChatStepDbVia, unipileChatVia } from '../_shared/send-chat-step-adapters.ts'
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

const UNIPILE_API_KEY = required('UNIPILE_API_KEY')

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

Deno.serve(createHandler({
  db,
  unipile: unipileMailVia(UNIPILE_API_KEY),
  chat: { db: chatDb, unipile: unipileChatVia(UNIPILE_API_KEY) },
  attachments: stepAttachmentSourceVia(admin),
  async holdForUnreadySend(sendId) {
    const { data, error } = await admin.rpc('hold_sequence_for_unready_send', { p_send_id: sendId })
    if (error) throw error
    return data === true
  },
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
}))
