import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDoApify } from '../signal-scan/apify.ts'
import type { ActorDoRegistro } from '../signal-scan/handler.ts'
import { ADAPTADORES } from './adaptadores.ts'
import { createHandler, type Db, type MonitorReivindicado, type ResultadoDoTeto, SemCreditos } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// As contas do Apify: APIFY_TOKEN e, se houver, APIFY_TOKEN_2 a APIFY_TOKEN_5 (a próxima assume quando o crédito acaba).
const tokens = ['APIFY_TOKEN', 'APIFY_TOKEN_2', 'APIFY_TOKEN_3', 'APIFY_TOKEN_4', 'APIFY_TOKEN_5']
  .map((nome) => Deno.env.get(nome))
  .filter((t): t is string => !!t)
if (tokens.length === 0) throw new Error('Backend is not configured')

function falha(error: { code?: string; message: string }): Error {
  return new Error(`${error.code ?? ''} ${error.message}`)
}

const db: Db = {
  async tokenMatches(token) {
    const { data, error } = await admin.rpc('signal_runner_token_matches', { p_token: token })
    if (error) throw falha(error)
    return data === true
  },
  async claim(limit) {
    const { data, error } = await admin.rpc('claim_due_signal_monitors', { p_limit: limit })
    if (error) throw falha(error)
    return ((data ?? []) as {
      monitor_id: string
      workspace_id: string
      signal_type: string
      criteria: Record<string, unknown>
      created_by: string | null
      accounts: MonitorReivindicado['accounts']
    }[]).map((linha) => ({
      monitorId: linha.monitor_id,
      workspaceId: linha.workspace_id,
      signalType: linha.signal_type,
      criteria: linha.criteria ?? {},
      createdBy: linha.created_by,
      accounts: linha.accounts ?? [],
    }))
  },
  async actorForType(signalType) {
    const { data, error } = await admin.rpc('signal_actor_for_type', { p_signal_type: signalType })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as {
      actor_id: string
      signal_type: string
      state: ActorDoRegistro['state']
      version: string | null
      max_cost_usd: number | string
    }[]
    if (!linha) return null
    return {
      actorId: linha.actor_id,
      signalType: linha.signal_type,
      state: linha.state,
      version: linha.version,
      maxCostUsd: Number(linha.max_cost_usd),
    }
  },
  async reserve({ workspaceId, userId, action, actionKey, quantity }) {
    const { data, error } = await admin.rpc('reserve_credits', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_action: action,
      p_action_key: actionKey,
      p_quantity: quantity,
      p_own_ai_key: false,
    })
    if (error) {
      if (error.message.includes('insufficient credits') || error.message.includes('monthly credit limit')) {
        throw new SemCreditos()
      }
      throw falha(error)
    }
    return data as string
  },
  async settle(reservationId) {
    const { error } = await admin.rpc('settle_credits', { p_reservation_id: reservationId, p_used_quantity: null })
    if (error) throw falha(error)
  },
  async release(reservationId) {
    const { error } = await admin.rpc('release_credits', { p_reservation_id: reservationId })
    if (error) throw falha(error)
  },
  async consumeCap(workspaceId, scope, amount) {
    const { data, error } = await admin.rpc('consume_automation_cap', {
      p_workspace_id: workspaceId,
      p_scope: scope,
      p_amount: amount,
    })
    if (error) throw falha(error)
    return data as ResultadoDoTeto
  },
  async recordSignal(a) {
    const { data, error } = await admin.rpc('record_signal', {
      p_workspace_id: a.workspaceId,
      p_target_account_id: a.accountId,
      p_monitor_id: a.monitorId,
      p_signal_type: a.signalType,
      p_event_key: a.eventKey,
      p_phrase: a.phrase,
      p_fired_at: a.firedAt,
      p_source: a.source,
      p_evidence: a.evidence,
    })
    if (error) throw falha(error)
    return data === true
  },
  async recordCost({ workspaceId, actorId, runId, items, costUsd }) {
    const { error } = await admin.rpc('record_signal_scan_cost', {
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_run_id: runId,
      p_items: items,
      p_cost_usd: costUsd,
    })
    if (error) throw falha(error)
  },
  async finish(monitorId, scanned, error) {
    const { error: e } = await admin.rpc('finish_signal_monitor_run', {
      p_monitor_id: monitorId,
      p_scanned: scanned,
      p_error: error,
    })
    if (e) throw falha(e)
  },
}

Deno.serve(createHandler({ db, apify: clienteDoApify({ tokens }), adaptadores: ADAPTADORES }))
