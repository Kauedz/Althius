import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  createHandler,
  type Db,
  type EmailSent,
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

const unipile: UnipileMail = {
  async sendEmail(accountId: string, email: OutgoingEmail, { signal }): Promise<EmailSent> {
    const upstream = await fetch(`${UNIPILE_API_BASE}/v2/${encodeURIComponent(accountId)}/emails/send`, {
      method: 'POST',
      headers: {
        'X-API-KEY': UNIPILE_API_KEY,
        accept: 'application/json',
        'content-type': 'application/json',
      },
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
