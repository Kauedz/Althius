import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendStepDbVia, unipileMailVia } from '../_shared/send-step-adapters.ts'
import { createHandler, type DueSend, type RunnerDb } from './handler.ts'
import type { ReleaseResult } from '../_shared/send-step.ts'

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
  async releaseDueSend(sendId) {
    const { data, error } = await admin.rpc('release_due_step_send', { p_send_id: sendId })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as ReleaseResult | undefined
    if (!row) throw Object.assign(new Error('send not found'), { code: 'P0002' })
    return row
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para os envios terminarem.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  unipile: unipileMailVia(UNIPILE_API_KEY),
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
}))
