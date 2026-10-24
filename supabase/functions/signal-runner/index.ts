import { createClient } from 'npm:@supabase/supabase-js@2'
import { actorDoRegistro, type AdminDeColeta, contasDeColeta, type LinhaDoActor, memoriaDasContasDeColeta } from '../_shared/apify-ambiente.ts'
import { type ClienteRpc, criarMotorDeCascata, escolherLlmDosSinais } from '../_shared/cascata-de-sinais/index.ts'
import { clienteDoApify } from '../signal-scan/apify.ts'
import { ADAPTADORES } from './adaptadores.ts'
import {
  type BuscaReivindicada,
  type Buscas,
  createHandler,
  type Db,
  type Manuais,
  type MonitorReivindicado,
  type PedidoManual,
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
  async beginScan({ workspaceId, userId, monitorId, accountId, slot, origem, pedidoId }) {
    const { data, error } = await admin.rpc('begin_account_scan', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_monitor_id: monitorId,
      p_account_id: accountId,
      p_slot: slot,
      p_origin: origem ?? 'agenda',
      p_request_id: pedidoId ?? null,
    })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as { outcome: ResultadoDaAbertura; reservation_id: string | null }[]
    if (!linha) throw new Error('begin_account_scan não respondeu')
    return { outcome: linha.outcome, reservationId: linha.reservation_id }
  },
  async creditsUnlimited(workspaceId) {
    const { data, error } = await admin.rpc('workspace_credits_unlimited', { p_workspace_id: workspaceId })
    if (error) return false
    return data === true
  },
  async endScan(reservationId, success) {
    const { error } = await admin.rpc('end_account_scan', { p_reservation_id: reservationId, p_success: success })
    if (error) throw falha(error)
  },
  async recordSignal(a) {
    const sinal = {
      p_workspace_id: a.workspaceId,
      p_target_account_id: a.accountId,
      p_monitor_id: a.monitorId,
      p_signal_type: a.signalType,
      p_event_key: a.eventKey,
      p_phrase: a.phrase,
      p_fired_at: a.firedAt,
      p_source: a.source,
      p_evidence: a.evidence,
    }
    // Dentro de uma Rodada, o Sinal (novo ou visto de novo) fica ligado a ela; a dedupe é a mesma.
    const { data, error } = a.runId
      ? await admin.rpc('record_signal_in_run', { p_run_id: a.runId, ...sinal })
      : await admin.rpc('record_signal', sinal)
    if (error) throw falha(error)
    return data === true
  },
  async abrirRodada({ monitorId, slot, pedidoId }) {
    const { data, error } = await admin.rpc('open_signal_run', {
      p_monitor_id: monitorId,
      p_slot: slot,
      p_request_id: pedidoId ?? null,
    })
    if (error) throw falha(error)
    if (typeof data !== 'string') throw new Error('open_signal_run não respondeu')
    return data
  },
  async somarRodada(rodadaId, r) {
    const { error } = await admin.rpc('add_signal_run_progress', {
      p_run_id: rodadaId,
      p_checked: r.verificadas ?? 0,
      p_new: r.novos ?? 0,
      p_repeated: r.repetidos ?? 0,
      p_without_data: r.semDado ?? 0,
      p_reservation_ids: r.reservas ?? [],
      p_stop_reason: r.motivo ?? null,
      p_credits: Math.max(0, Math.round(r.creditos ?? 0)),
    })
    if (error) throw falha(error)
  },
  async headcountBase(workspaceId, accountId, desde, antesDe) {
    const { data, error } = await admin.rpc('account_headcount_base', {
      p_workspace_id: workspaceId,
      p_target_account_id: accountId,
      p_since: desde,
      p_before: antesDe,
    })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as { taken_on: string; headcount: number }[]
    return linha ? { takenOn: linha.taken_on, headcount: linha.headcount } : null
  },
  async recordHeadcount(workspaceId, accountId, foto, fonte) {
    const { error } = await admin.rpc('record_account_headcount', {
      p_workspace_id: workspaceId,
      p_target_account_id: accountId,
      p_taken_on: foto.takenOn,
      p_headcount: foto.headcount,
      p_source: fonte,
    })
    if (error) throw falha(error)
  },
  async countJobSignals(workspaceId, accountId, desdeIso) {
    const { data, error } = await admin.rpc('count_account_job_signals', {
      p_workspace_id: workspaceId,
      p_target_account_id: accountId,
      p_since: desdeIso,
    })
    if (error) throw falha(error)
    return Number(data ?? 0)
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
  async rodadaEstouraOLimiteDoDia(monitorId) {
    const { data, error } = await admin.rpc('signal_round_exceeds_daily_cap', { p_monitor_id: monitorId })
    if (error) throw falha(error)
    return data === true
  },
  async escopo(monitorId) {
    const { data, error } = await admin.rpc('signal_monitor_scope', { p_monitor_id: monitorId })
    if (error) throw falha(error)
    return data === 'mercado' ? 'mercado' : 'contas'
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

// A fila do Rodar agora: o pedido de uma pessoa, lido depois das buscas e antes dos Monitoramentos do relógio.
const manuais: Manuais = {
  async claim(limit) {
    const { data, error } = await admin.rpc('claim_signal_run_requests', { p_limit: limit })
    if (error) throw falha(error)
    return ((data ?? []) as {
      request_id: string
      workspace_id: string
      monitor_id: string
      signal_type: string
      criteria: Record<string, unknown> | null
      requested_by: string | null
      requested_at: string
      accounts: PedidoManual['accounts'] | null
    }[]).map((linha) => ({
      pedidoId: linha.request_id,
      workspaceId: linha.workspace_id,
      monitorId: linha.monitor_id,
      signalType: linha.signal_type,
      criteria: linha.criteria ?? {},
      requestedBy: linha.requested_by,
      requestedAt: linha.requested_at,
      accounts: linha.accounts ?? [],
    }))
  },
  async finish(pedidoId, estado, tentadas, erro) {
    const { error } = await admin.rpc('finish_signal_run_request', {
      p_request_id: pedidoId,
      p_state: estado,
      p_attempted: tentadas,
      p_error: erro,
    })
    if (error) throw falha(error)
  },
  async kick() {
    const { error } = await admin.rpc('kick_signal_runner')
    if (error) throw falha(error)
  },
}

// Esta função tem 150 s; cada Conta espera o Apify no máximo 70 s (60 s de execução) e mais 3 s para reler o custo quando
// o Apify ainda não fechou a conta da execução, e uma Conta nova só começa até 72 s.
const contas = contasDeColeta((nome) => Deno.env.get(nome))
const tokens = contas.map((c) => c.token)
const memoria = memoriaDasContasDeColeta(admin as unknown as AdminDeColeta, (campos) => console.log(JSON.stringify(campos)))
const apify = clienteDoApify({
  tokens,
  contas,
  memoria,
  runTimeoutSeconds: 60,
  timeoutMs: 70_000,
  esperaDoCustoMs: 3_000,
})

// Os Sinais em cascata (um Sinal = vários passos) rodam pelo mesmo motor da conversa do Hermes: as mesmas contas do Apify,
// o mesmo banco, o mesmo teto. O Monitoramento de um tipo que é cascata não passa pelo caminho de uma varredura por Conta.
// Os passos que classificam texto (notícia, diário oficial) usam o modelo escolhido por SIGNALS_LLM_PROVIDER (hermes, openai
// ou regra; o padrão é regra, sem modelo).
const llm = escolherLlmDosSinais({
  env: (nome) => Deno.env.get(nome),
  admin: admin as unknown as ClienteRpc,
  log: (campos) => console.log(JSON.stringify(campos)),
})
const cascatas = criarMotorDeCascata({
  admin: admin as unknown as ClienteRpc,
  tokens,
  contas,
  memoria,
  ...(llm ? { llm } : {}),
})

// O mesmo modelo classifica as Publicações da empresa (PR-8); sem ele, o adaptador usa a regra de palavra-chave.
Deno.serve(createHandler({
  db,
  apify,
  adaptadores: ADAPTADORES,
  buscas,
  manuais,
  cascatas,
  aquecer: () => cascatas.aquecer(),
  ...(llm ? { llm } : {}),
}))
