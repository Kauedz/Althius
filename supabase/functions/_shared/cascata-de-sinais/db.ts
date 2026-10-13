// O banco da cascata pelo Supabase: cada operação é uma função do banco (só da chave de serviço). Aceita qualquer cliente
// com `rpc`, para o teste trocar por um dublê.
import type { CascataDef, ContaDoWorkspace, DbDaCascata, ResultadoDaAbertura } from './tipos.ts'

export interface ClienteRpc {
  rpc(nome: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
}

function falha(nome: string, error: { code?: string; message: string }): Error {
  return new Error(`${nome}: ${error.code ?? ''} ${error.message}`.trim())
}

async function chamar(admin: ClienteRpc, nome: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(nome, args)
  if (error) throw falha(nome, error)
  return data
}

const primeiraLinha = (data: unknown): Record<string, unknown> => {
  const linha = Array.isArray(data) ? data[0] : data
  return linha && typeof linha === 'object' ? linha as Record<string, unknown> : {}
}

export function criarDbDaCascata(admin: ClienteRpc): DbDaCascata {
  return {
    async definicao(signalType) {
      const data = await chamar(admin, 'signal_cascade_for_type', { p_signal_type: signalType })
      if (!data || typeof data !== 'object') return null
      const d = data as Record<string, unknown>
      return { ...d, steps: Array.isArray(d.steps) ? d.steps : [] } as unknown as CascataDef
    },

    async configuracao() {
      const l = primeiraLinha(await chamar(admin, 'signal_cascade_settings'))
      return { usdPorCredito: Number(l.usd_per_credit ?? 0.3), limiteDiario: Number(l.daily_credit_cap ?? 50) }
    },

    async contas(workspaceId, ids, limite) {
      const data = await chamar(admin, 'signal_cascade_accounts', { p_workspace_id: workspaceId, p_account_ids: ids, p_limit: limite })
      return (Array.isArray(data) ? data : []) as ContaDoWorkspace[]
    },

    async abrir(a) {
      const l = primeiraLinha(await chamar(admin, 'begin_cascade_run', {
        p_workspace_id: a.workspaceId,
        p_user_id: a.userId,
        p_signal_type: a.signalType,
        p_origin: a.origem,
        p_monitor_id: a.monitorId,
        p_key: a.chave,
        p_est_usd: a.estimativaUsd,
        p_cap_credits: a.tetoCreditos,
        p_allow_testing: a.permitirTeste,
      }))
      if (typeof l.outcome !== 'string') throw new Error('begin_cascade_run não respondeu')
      return {
        outcome: l.outcome as ResultadoDaAbertura['outcome'],
        runId: typeof l.run_id === 'string' ? l.run_id : null,
        estCredits: Number(l.est_credits ?? 0),
        capUsd: Number(l.cap_usd ?? 0),
      }
    },

    async fechar(a) {
      const l = primeiraLinha(await chamar(admin, 'finish_cascade_run', {
        p_run_id: a.runId,
        p_state: a.estado,
        p_real_cost_usd: a.custoUsd,
        p_matched: a.casados,
        p_signals_new: a.novos,
        p_signals_repeated: a.repetidos,
        p_friendly_error: a.erroAmigavel,
      }))
      return { creditosCobrados: Number(l.credits_charged ?? 0) }
    },

    async gravarAmostraValidacao(a) {
      await chamar(admin, 'record_cascade_validation_sample', { p_run_id: a.runId, p_sample: a.amostra })
    },

    async abrirPasso(a) {
      const id = await chamar(admin, 'start_cascade_step', {
        p_run_id: a.runId,
        p_ordem: a.ordem,
        p_attempt: a.tentativa,
        p_handler: a.handler,
        p_kind: a.kind,
        p_actor_id: a.actorId,
        p_items_in: a.itensEntrada,
      })
      if (typeof id !== 'string') throw new Error('start_cascade_step não respondeu')
      return id
    },

    async fecharPasso(a) {
      await chamar(admin, 'finish_cascade_step', {
        p_step_id: a.passoId,
        p_state: a.estado,
        p_apify_run_id: a.apifyRunId,
        p_build: a.build,
        p_token_index: a.tokenIndex,
        p_items_out: a.itensSaida,
        p_cost_usd: a.custoUsd,
        p_http_status: a.statusHttp,
        p_real_error: a.erroReal,
      })
    },

    async gravarSinalDeMercado({ workspaceId, signalType, sinal }) {
      const data = await chamar(admin, 'record_market_signal', {
        p_workspace_id: workspaceId,
        p_signal_type: signalType,
        p_event_key: sinal.eventKey,
        p_phrase: sinal.phrase,
        p_fired_at: sinal.firedAt,
        p_source: sinal.source || null,
        p_evidence: sinal.evidence || null,
        p_payload: sinal.payload,
      })
      return data === true
    },

    async lerSnapshots({ workspaceId, signalType, chaves, antesDe }) {
      const data = await chamar(admin, 'signal_snapshots_get', {
        p_workspace_id: workspaceId,
        p_signal_type: signalType,
        p_subject_keys: chaves,
        p_before: antesDe ?? null,
      })
      const mapa = new Map<string, { takenAt: string; data: Record<string, unknown> }>()
      for (const l of (Array.isArray(data) ? data : []) as { subject_key: string; taken_at: string; data: Record<string, unknown> }[]) {
        mapa.set(l.subject_key, { takenAt: l.taken_at, data: l.data ?? {} })
      }
      return mapa
    },

    async gravarSnapshots({ workspaceId, signalType, itens }) {
      if (itens.length === 0) return
      await chamar(admin, 'signal_snapshots_put', {
        p_workspace_id: workspaceId,
        p_signal_type: signalType,
        p_items: itens.map((i) => ({ subjectKey: i.chave, data: i.data, ...(i.takenAt ? { takenAt: i.takenAt } : {}) })),
      })
    },

    async gravarSinal({ workspaceId, contaId, monitorId, signalType, sinal }) {
      const data = await chamar(admin, 'record_signal', {
        p_workspace_id: workspaceId,
        p_target_account_id: contaId,
        p_monitor_id: monitorId,
        p_signal_type: signalType,
        p_event_key: sinal.eventKey,
        p_phrase: sinal.phrase,
        p_fired_at: sinal.firedAt,
        p_source: sinal.source || null,
        p_evidence: sinal.evidence || null,
      })
      return data === true
    },
  }
}
