import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  type Conversation,
  createHandler,
  type Db,
  type EmailSent,
  type IngestedEmail,
  type OutgoingEmail,
  type ReleaseResult,
  type UnipileMail,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from './handler.ts'

const UNIPILE_API_BASE = 'https://api.unipile.com'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: uma função sem configuração não libera envio nenhum.
const UNIPILE_API_KEY = required('UNIPILE_API_KEY')
const APP_ORIGIN = required('APP_ORIGIN')

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const supabase = createClient(required('SUPABASE_URL'), apikey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async hasActiveMembership(workspaceId, userId) {
    const { data, error } = await admin
      .from('workspace_memberships')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    return !error && !!data
  },
  async conversationForSend(sendId, userId) {
    const { data, error } = await admin.rpc('conversation_for_send', { p_send_id: sendId, p_user_id: userId })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as Conversation | undefined
    return row ?? null
  },
  async ingestEmailEvent({ eventId, eventType, unipileAccountId, email, ownerAddresses }) {
    const { data, error } = await admin.rpc('ingest_unipile_email_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_unipile_account_id: unipileAccountId,
      p_email: email,
      p_owner_addresses: ownerAddresses,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as IngestedEmail | undefined
    if (!row) throw new Error('ingest_unipile_email_event returned no row')
    return row
  },
  async releaseStepSend(sendId, userId) {
    const { data, error } = await admin.rpc('release_sequence_step_send', {
      p_send_id: sendId,
      p_user_id: userId,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as ReleaseResult | undefined
    if (!row) throw new Error('release_sequence_step_send returned no row')
    return row
  },
  async recordStepSendResult({ sendId, outcome, providerEmailId, providerMessageId, error }) {
    const { error: rpcError } = await admin.rpc('record_sequence_step_send_result', {
      p_send_id: sendId,
      p_outcome: outcome,
      p_provider_email_id: providerEmailId ?? null,
      p_provider_message_id: providerMessageId ?? null,
      p_error: error ?? null,
    })
    if (rpcError) throw rpcError
  },
}

function unipileHeaders() {
  return { 'X-API-KEY': UNIPILE_API_KEY, accept: 'application/json' }
}

async function unipileGet(path: string) {
  const upstream = await fetch(`${UNIPILE_API_BASE}${path}`, { headers: unipileHeaders() })
  if (!upstream.ok) throw new UnipileRequestError(upstream.status)
  return upstream.json()
}

const unipile: UnipileMail = {
  // Conferir no primeiro envio real: a forma exata da resposta de GET /threads/{id} e de /email-senders.
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
      headers: { ...unipileHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(email),
      signal,
    })
    if (!upstream.ok) throw new UnipileRequestError(upstream.status)
    const result = await upstream.json()
    if (typeof result?.id !== 'string') throw new UnipileUnreadableResponse()
    return { id: result.id, message_id: typeof result.message_id === 'string' ? result.message_id : null }
  },
}

Deno.serve(createHandler({ db, unipile, appOrigin: APP_ORIGIN }))
