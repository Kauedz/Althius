import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  bancoDoExecutor,
  bancoDoExecutorDeFerramenta,
  executarChamadaAprovada,
  executarEnvioAprovado,
} from '../_shared/executor-de-aprovacoes.ts'
import { bancoDasFerramentas, type DepsDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
import type { DepsDeAcesso } from '../_shared/integration-access.ts'
import { creditosDoBanco, type SecaoDoPlaybookNaExecucao } from '../_shared/orquestracao.ts'
import { createHandler, type Db, type Inicio, recusaDoEnvioPelosAgentes } from './handler.ts'
import { modeloDaAnthropic } from './model.ts'
import { modeloDoGroq } from './model-groq.ts'
import { type ContaEncontrada, createRunner, ErroDoModelo, type Modelo, type Reserva, type RunDb } from './runner.ts'

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
// O modelo com a chave de IA do cliente: só a Anthropic, por enquanto (a mesma API da ponte).
const modeloDoCliente = (chave: { provider: string; model: string; apiKey: string }): Modelo | null =>
  chave.provider === 'anthropic' ? modeloDaAnthropic({ apiKey: chave.apiKey, modelo: chave.model }) : null
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
  // O Enviar ao CRM pelos Agentes (ADR-0023, migration 20261002112000): a chave de serviço, com quem o JWT identificou; o
  // banco confere a Participação, a responsabilidade, o CRM, o Acesso pela autorização e um Agente que escreve.
  async iniciarEnvioAoCrm(pedido) {
    const { data, error } = await admin.rpc('begin_crm_handoff_by_agents', {
      p_workspace_id: pedido.workspaceId,
      p_target_account_id: pedido.targetAccountId,
      p_user_id: pedido.userId,
      p_integration_id: pedido.integrationId,
      p_client_request_id: pedido.clientRequestId,
    })
    if (error) {
      const recusa = recusaDoEnvioPelosAgentes(error.code ?? '', error.message)
      if (recusa.code === 'indisponivel') throw new Error(`begin_crm_handoff_by_agents: ${error.code ?? ''} ${error.message}`)
      return { kind: 'recusado', ...recusa }
    }
    const [linha] = (data ?? []) as { conversation_id?: string; run_id?: string; status?: string }[]
    if (!linha?.conversation_id || !linha.run_id || !linha.status) throw new Error('begin_crm_handoff_by_agents não devolveu a Execução')
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
  custo: async (runId) => {
    await rpc<void>('record_agent_run_cost', { p_run_id: runId })
  },
  playbook: async (runId, specialty) =>
    (await rpc<SecaoDoPlaybookNaExecucao[] | null>('agent_run_playbook', { p_run_id: runId, p_specialty: specialty })) ?? [],
  creditos: creditosDoBanco(rpc),
  // A chave de IA do cliente do Workspace (créditos 08): lida do Vault só aqui, nunca gravada nem registrada.
  chaveDoCliente: async (runId) => {
    const { data, error } = await admin.rpc('agent_run_ai_key', { p_run_id: runId })
    if (error) {
      // 55000: a chave está ligada ao Workspace, mas o Vault não tem o valor dela.
      if (error.code === '55000') throw new ErroDoModelo('workspace_ai_key_unavailable')
      throw new Error(`agent_run_ai_key: ${error.code ?? ''} ${error.message}`)
    }
    const [linha] = (data ?? []) as { provider: string; model: string; api_key: string }[]
    return linha ? { provider: linha.provider, model: linha.model, apiKey: linha.api_key } : null
  },
}

// As ferramentas dos Agentes (Etapa 5b): ligadas por padrão; `AGENT_TOOLS=off` volta ao modo só de conversa. Sem a
// migration 20261001210000 aplicada, o contexto falha e cada pedido roda como antes.
const rpcDoServico = (nome: string, parametros: Record<string, unknown>) => admin.rpc(nome, parametros)
const acesso: DepsDeAcesso = { banco: bancoDasIntegracoes(rpcDoServico), ambiente: (nome) => Deno.env.get(nome) }
const ferramentas: DepsDasFerramentas | undefined = (Deno.env.get('AGENT_TOOLS') || '').trim().toLowerCase() === 'off'
  ? undefined
  : {
    banco: bancoDasFerramentas(rpcDoServico),
    acesso,
    executarAprovacao: (approvalId) => executarEnvioAprovado({ banco: bancoDoExecutor(rpcDoServico), acesso }, { approvalId }),
    // As Aprovações de ferramenta de conector (ADR-0022) que nascem liberadas saem logo, pelo mesmo Acesso.
    executarChamada: (approvalId) =>
      executarChamadaAprovada({ banco: bancoDoExecutorDeFerramenta(rpcDoServico), acesso }, { approvalId }),
  }

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a Execução terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  executar: comHermes ? () => Promise.resolve() : modelo ? createRunner({ db: runDb, modelo, modeloDoCliente, ferramentas }) : null,
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : (work) => void work,
  appOrigin: APP_ORIGIN,
}))
