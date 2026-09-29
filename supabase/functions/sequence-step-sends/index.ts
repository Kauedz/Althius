import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendStepDbVia, unipileChatVia, unipileMailVia, whatsappDbVia } from '../_shared/send-step-adapters.ts'
import { createHandler, type Db, type ReleaseResult } from './handler.ts'

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
  ...sendStepDbVia(admin),
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
}

Deno.serve(createHandler({
  db,
  unipile: unipileMailVia(UNIPILE_API_KEY),
  whatsapp: { db: whatsappDbVia(admin), chat: unipileChatVia(UNIPILE_API_KEY) },
  appOrigin: APP_ORIGIN,
}))
