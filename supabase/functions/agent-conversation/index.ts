import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SecaoDoPlaybookNaExecucao } from '../_shared/orquestracao.ts'
import { createHandler, type Db, type Inicio } from './handler.ts'
import { modeloDaAnthropic } from './model.ts'
import { modeloDoGroq } from './model-groq.ts'
import { type ContaEncontrada, createRunner, type Modelo, type Reserva, type RunDb } from './runner.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')

/**
 * O provedor do modelo, pelo segredo AGENT_PROVIDER: `anthropic` (padrão), `groq` (só para teste) ou `hermes` (ADR-0018). Sem a
 * chave do provedor escolhido (e, no Groq, sem o modelo), a função sobe e diz que as Conversas estão indisponíveis, em
 * vez de fingir uma resposta.
 */
function modeloConfigurado(): Modelo | null {
  const provedor = (Deno.env.get('AGENT_PROVIDER') || 'anthropic').trim().toLowerCase()
  if (provedor === 'groq') {
    const apiKey = Deno.env.get('GROQ_API_KEY') || ''
    const modelo = Deno.env.get('GROQ_MODEL') || ''
    return apiKey && modelo ? modeloDoGroq({ apiKey, modelo }) : null
  }
  if (provedor !== 'anthropic') return null
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
  return apiKey ? modeloDaAnthropic({ apiKey, modelo: Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5' }) : null
}

const modelo = modeloConfigurado()
// Com AGENT_PROVIDER=hermes, a função só guarda o pedido: quem roda é o worker do Hermes (`_hermes-worker`), que busca
// a fila. As Conversas aparecem disponíveis; sem o worker ligado, o pedido vira falha por prazo em 10 minutos.
const comHermes = (Deno.env.get('AGENT_PROVIDER') || '').trim().toLowerCase() === 'hermes'

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

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async startRun(pedido): Promise<Inicio> {
    const { data, error } = await clienteDaSessao(pedido.authorization, pedido.apikey).rpc('start_agent_run', {
      p_workspace_id: pedido.workspaceId,
      p_conversation_id: pedido.conversationId,
      p_agent_id: pedido.agentId,
      p_text: pedido.text,
      p_mentions: pedido.mentions,
      p_client_request_id: pedido.clientRequestId,
    })
    if (error?.code === '55006') return { kind: 'busy' }
    if (error?.code === 'P0002') return { kind: 'not_found' }
    if (error?.code === '42501') return { kind: 'forbidden' }
    if (error?.code === '22023') return { kind: 'invalid' }
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as { conversation_id?: string; run_id?: string; status?: string }[]
    if (!linha?.conversation_id || !linha.run_id || !linha.status) {
      throw new Error('start_agent_run não devolveu a Execução')
    }
    return { kind: 'started', conversationId: linha.conversation_id, runId: linha.run_id, status: linha.status }
  },
}

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, args)
  if (error) throw new Error(`${nome}: ${error.code ?? ''} ${error.message}`)
  return data as T
}

const runDb: RunDb = {
  claim: (runId) => rpc<Reserva | null>('claim_agent_run', { p_run_id: runId }),
  append: (runId, kind, agentId, payload) =>
    rpc<number>('append_agent_run_event', { p_run_id: runId, p_kind: kind, p_agent_id: agentId, p_payload: payload }),
  finish: (runId, status, errorCode, model) =>
    rpc<void>('finish_agent_run', { p_run_id: runId, p_status: status, p_error_code: errorCode, p_model: model }),
  searchAccounts: async (runId, termo) =>
    (await rpc<ContaEncontrada[] | null>('agent_search_target_accounts', { p_run_id: runId, p_query: termo })) ?? [],
  playbook: async (runId, specialty) =>
    (await rpc<SecaoDoPlaybookNaExecucao[] | null>('agent_run_playbook', { p_run_id: runId, p_specialty: specialty })) ?? [],
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a Execução terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  executar: comHermes ? () => Promise.resolve() : modelo ? createRunner({ db: runDb, modelo }) : null,
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : (work) => void work,
  appOrigin: APP_ORIGIN,
}))
