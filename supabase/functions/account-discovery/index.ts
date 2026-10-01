import { createClient } from 'npm:@supabase/supabase-js@2'
import { tokensDoApify } from '../_shared/apify-ambiente.ts'
import { clienteDoApify } from '../signal-scan/apify.ts'
import { createHandler, type Db, ErroDoBanco, type IcpLido } from './handler.ts'
import type { CriteriosDeBusca } from './criterios.ts'
import { normalizarCriterios } from './criterios.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: sem o token do Apify, a função não sobe e nenhuma busca é prometida.
const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Um cliente com a sessão de quem pede: o banco aplica as regras dela, sem a chave de serviço. */
function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function falha(error: { code?: string; message: string }): ErroDoBanco {
  return new ErroDoBanco(error.code ?? '', error.message)
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async lerIcp({ workspaceId, authorization, apikey }): Promise<IcpLido | null> {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('get_playbook_section', {
      p_workspace_id: workspaceId,
      p_section: 'icp',
    })
    if (error) throw falha(error)
    const secao = data as { version?: number | null; content?: { texto?: unknown; linhas?: unknown } | null } | null
    if (!secao?.content) return null
    return { version: secao.version ?? null, conteudo: secao.content }
  },
  async actoresDeBusca() {
    const { data, error } = await admin.rpc('discovery_actors_for', { p_purpose: 'buscar_contas' })
    if (error) throw falha(error)
    return ((data ?? []) as { actor_id: string; state: 'available' | 'testing' | 'out'; version: string | null; max_cost_usd: number | string }[])
      .map((l) => ({ actorId: l.actor_id, state: l.state, version: l.version, maxCostUsd: Number(l.max_cost_usd) }))
  },
  async iniciar(a) {
    const { data, error } = await clienteDaSessao(a.authorization, a.apikey).rpc('begin_account_discovery', {
      p_workspace_id: a.workspaceId,
      p_request_key: a.requestKey,
      p_criteria: a.criterios,
      p_max_results: a.maxResults,
      p_actor_id: a.actorId,
      p_icp_version: a.icpVersion,
      p_allow_testing: a.allowTesting,
      p_run_id: a.runId ?? null,
    })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as { run_id: string; outcome: 'go' | 'existing'; state: string; actor_version: string | null }[]
    if (!linha) throw new Error('begin_account_discovery não respondeu')
    return { runId: linha.run_id, outcome: linha.outcome, state: linha.state, actorVersion: linha.actor_version }
  },
  async lerProposta({ runId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('get_discovery_proposal', { p_run_id: runId })
    if (error) {
      if (error.code === 'P0002' || error.code === '42501') return null
      throw falha(error)
    }
    const [linha] = (data ?? []) as {
      workspace_id: string
      criteria: unknown
      max_results: number
      icp_version: number | null
    }[]
    if (!linha) return null
    const criterios: CriteriosDeBusca = normalizarCriterios(linha.criteria)
    return { workspaceId: linha.workspace_id, criterios, maxResults: linha.max_results, icpVersion: linha.icp_version }
  },
  async gravarCandidatas(runId, candidatas) {
    const { data, error } = await admin.rpc('record_discovered_accounts', { p_run_id: runId, p_candidates: candidatas })
    if (error) throw falha(error)
    const [linha] = (data ?? []) as { added: number; duplicates: number; ignored: number }[]
    return { added: linha?.added ?? 0, duplicates: linha?.duplicates ?? 0, ignored: linha?.ignored ?? 0 }
  },
  async gravarCusto({ workspaceId, actorId, runId, items, costUsd }) {
    const { error } = await admin.rpc('record_discovery_cost', {
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_run_id: runId,
      p_items: items,
      p_cost_usd: costUsd,
    })
    if (error) throw falha(error)
  },
  async encerrar({ runId, success, apifyRunId, costUsd, error: motivo }) {
    const { error } = await admin.rpc('finish_account_discovery', {
      p_run_id: runId,
      p_success: success,
      p_apify_run_id: apifyRunId,
      p_cost_usd: costUsd,
      p_error: motivo,
    })
    if (error) throw falha(error)
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a busca terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (trabalho: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  // A busca roda em segundo plano: o Actor tem até 100 s e o custo é relido de 3 em 3 s, até 2 vezes.
  apify: clienteDoApify({
    tokens: tokensDoApify((nome) => Deno.env.get(nome)),
    runTimeoutSeconds: 100,
    timeoutMs: 110_000,
    esperaDoCustoMs: 3_000,
    releiturasDoCusto: 2,
  }),
  appOrigin: APP_ORIGIN,
  waitUntil: runtime?.waitUntil ? (trabalho) => runtime.waitUntil!(trabalho) : (trabalho) => void trabalho,
}))
