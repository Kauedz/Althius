import { createClient } from 'npm:@supabase/supabase-js@2'
import { adaptadorCanalDoAmbiente } from '../_shared/canal/index.ts'
import { createHandler, type Db, type Entrega } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const adaptador = adaptadorCanalDoAmbiente()
const db: Db = {
  async reservarEntrega(runId) {
    const { data, error } = await admin.rpc('claim_whatsapp_channel_delivery', { p_run_id: runId })
    if (error) throw new Error(`claim_whatsapp_channel_delivery: ${error.code ?? ''}`)
    const [linha] = (data ?? []) as { status: Entrega['status']; error_code: string | null; answer: string | null; phone: string; within_window: boolean }[]
    return linha ? { status: linha.status, codigoDoErro: linha.error_code, resposta: linha.answer, telefone: linha.phone, dentroDaJanela: linha.within_window } : null
  },
  async confirmarEntrega(runId) {
    const { error } = await admin.rpc('confirm_whatsapp_channel_delivery', { p_run_id: runId })
    if (error) throw new Error(`confirm_whatsapp_channel_delivery: ${error.code ?? ''}`)
  },
  async falharEntrega(runId, erro) {
    const { data, error: falha } = await admin.rpc('fail_whatsapp_channel_delivery', { p_run_id: runId, p_error: erro })
    if (falha) throw new Error(`fail_whatsapp_channel_delivery: ${falha.code ?? ''}`)
    return data as string
  },
}
Deno.serve(createHandler({ db, adaptador, segredoInterno: required('WHATSAPP_CHANNEL_DELIVERY_SECRET') }))
