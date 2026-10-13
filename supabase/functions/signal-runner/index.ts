import { createClient } from 'npm:@supabase/supabase-js@2'
import { actorDoRegistro, type LinhaDoActor, tokensDoApify } from '../_shared/apify-ambiente.ts'
import { type ClienteRpc, criarMotorDeCascata } from '../_shared/cascata-de-sinais/index.ts'
import { clienteDoApify } from '../signal-scan/apify.ts'
import { ADAPTADORES } from './adaptadores.ts'
import {
  type BuscaReivindicada,
  type Buscas,
  createHandler,
  type Db,
  type MonitorReivindicado,
  type ResultadoDaAbertura,
} from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
      slot: string
      accounts: MonitorReivindicado['accounts']
    }[]).map((linha) => ({
      monitorId: linha.monitor_id,
      workspaceId: linha.workspace_id,
      signalType: linha.signal_type,
      criteria: linha.criteria ?? {},
      createdBy: linha.created_by,
      slot: linha.slot,
      accounts: linha.accounts ?? [],
    }))
  },
  async actorForType(signalType) {
    const { data, error } = await admin.rpc('signal_actor_for_type', { p_signal_type: signalType })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as LinhaDoActor[]
    return linha ? actorDoRegistro(linha) : null
  },
  async beginScan({ workspaceId, userId, monitorId, accountId, slot }) {
    const { data, error } = await admin.rpc('begin_account_scan', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_monitor_id: monitorId,
      p_account_id: accountId,
      p_slot: slot,
    })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as { outcome: ResultadoDaAbertura; reservation_id: string | null }[]
    if (!linha) throw new Error('begin_account_scan não respondeu')
    return { outcome: linha.outcome, reservationId: linha.reservation_id }
  },
  async endScan(reservationId, success) {
    const { error } = await admin.rpc('end_account_scan', { p_reservation_id: reservationId, p_success: success })
    if (error) throw falha(error)
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
  async finish(monitorId, attempted, error, continuar) {
    const { error: e } = await admin.rpc('finish_signal_monitor_run', {
      p_monitor_id: monitorId,
      p_attempted: attempted,
      p_error: error,
      p_continue: continuar,
    })
    if (e) throw falha(e)
  },
}

// A fila de buscas da reativação de Sinais (ticket 08).
const buscas: Buscas = {
  async claim(limit) {
    const { data, error } = await admin.rpc('claim_signal_rescans', { p_limit: limit })
    if (error) throw falha(error)
    return ((data ?? []) as {
      rescan_id: string
      workspace_id: string
      origin: BuscaReivindicada['origin']
      requested_by: string | null
      requested_at: string
      account: BuscaReivindicada['account']
      monitors: BuscaReivindicada['monitors'] | null
    }[]).map((linha) => ({
      rescanId: linha.rescan_id,
      workspaceId: linha.workspace_id,
      origin: linha.origin,
      requestedBy: linha.requested_by,
      requestedAt: linha.requested_at,
      account: linha.account,
      monitors: linha.monitors ?? [],
    }))
  },
  async beginScan({ rescanId, monitorId }) {
    const { data, error } = await admin.rpc('begin_rescan_scan', { p_rescan_id: rescanId, p_monitor_id: monitorId })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as { outcome: ResultadoDaAbertura; reservation_id: string | null }[]
    if (!linha) throw new Error('begin_rescan_scan não respondeu')
    return { outcome: linha.outcome, reservationId: linha.reservation_id }
  },
  async endScan(rescanId, reservationId, success) {
    const { error } = await admin.rpc('end_rescan_scan', {
      p_rescan_id: rescanId,
      p_reservation_id: reservationId,
      p_success: success,
    })
    if (error) throw falha(error)
  },
  async finish(rescanId, state, scanned, error) {
    const { error: e } = await admin.rpc('finish_signal_rescan', {
      p_rescan_id: rescanId,
      p_state: state,
      p_scanned: scanned,
      p_error: error,
    })
    if (e) throw falha(e)
  },
  async stopWorkspace(workspaceId, error) {
    const { data, error: e } = await admin.rpc('stop_workspace_rescans', { p_workspace_id: workspaceId, p_error: error })
    if (e) throw falha(e)
    return Number(data ?? 0)
  },
  async kick() {
    const { error } = await admin.rpc('kick_rescan_runner')
    if (error) throw falha(error)
  },
}

// Esta função tem 150 s; cada Conta espera o Apify no máximo 70 s (60 s de execução) e mais 3 s para reler o custo quando
// o Apify ainda não fechou a conta da execução, e uma Conta nova só começa até 72 s.
const tokens = tokensDoApify((nome) => Deno.env.get(nome))
const apify = clienteDoApify({
  tokens,
  runTimeoutSeconds: 60,
  timeoutMs: 70_000,
  esperaDoCustoMs: 3_000,
})

// Os Sinais em cascata (um Sinal = vários passos) rodam pelo mesmo motor da conversa do Hermes: as mesmas contas do Apify,
// o mesmo banco, o mesmo teto. O Monitoramento de um tipo que é cascata não passa pelo caminho de uma varredura por Conta.
const cascatas = criarMotorDeCascata({ admin: admin as unknown as ClienteRpc, tokens })

Deno.serve(createHandler({ db, apify, adaptadores: ADAPTADORES, buscas, cascatas }))
