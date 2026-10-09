import { createClient } from 'npm:@supabase/supabase-js@2'
import { comCors } from '../_shared/cors.ts'
import { sendStepDbVia } from '../_shared/send-step-adapters.ts'
import { createUnipileRuntime, unipileUnavailableResponse } from '../_shared/unipile/index.ts'
import { stepAttachmentSourceVia } from '../_shared/anexos-do-envio.ts'
import { createHandler, type Db, type ReleaseResult } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lido na inicialização: uma função sem configuração não libera envio nenhum.
const APP_ORIGIN = required('APP_ORIGIN')

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// A conta Unipile que envia é a conexão ativa (ADR-0024), lida a cada pedido (em cache por 30 s). Sem conexão ativa, a
// função responde 503 antes de liberar qualquer envio.
const unipile = createUnipileRuntime({ rpc: admin, env: Deno.env })

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

// O 503 do canal desligado também leva o CORS: sem ele, o navegador veria só uma falha de rede.
const unavailable = comCors(APP_ORIGIN, () => Promise.resolve(unipileUnavailableResponse()))

Deno.serve(async (req) => {
  const bridge = await unipile.bridge()
  if (!bridge) return unavailable(req)
  return createHandler({
    db,
    unipile: bridge,
    appOrigin: APP_ORIGIN,
    attachments: stepAttachmentSourceVia(admin),
  })(req)
})
