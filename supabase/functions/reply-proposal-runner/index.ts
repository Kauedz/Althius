import { createClient } from 'npm:@supabase/supabase-js@2'
import type { ChaveDoCliente } from '../_shared/orquestracao.ts'
import { modeloDaAnthropic } from '../agent-conversation/model.ts'
import { modeloDoGroq } from '../agent-conversation/model-groq.ts'
import { ErroDoModelo, type Modelo } from '../agent-conversation/runner.ts'
import {
  type ContextoDaResposta,
  createHandler,
  type RodadaDeCredito,
  type RunnerDb,
  type TrabalhoReservado,
} from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Esta função não recebe a chave da Unipile: gerar uma proposta nunca envia nada.
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * O modelo da Althius, pelo mesmo caminho da `agent-conversation`: `anthropic` (padrão) ou `groq` (só para teste), pelo
 * AGENT_PROVIDER. REPLY_PROPOSAL_PROVIDER manda mais, para as Propostas de resposta usarem outro provedor que os Agentes
 * (o Hermes roda fora do Supabase e não atende esta função). Sem a chave do provedor, nenhum modelo: o trabalho falha
 * com `model_unavailable` e a tela diz que a IA não está configurada, em vez de fingir um rascunho.
 */
function modeloConfigurado(): Modelo | null {
  const provedor = (Deno.env.get('REPLY_PROPOSAL_PROVIDER') || Deno.env.get('AGENT_PROVIDER') || 'anthropic')
    .trim().toLowerCase()
  if (provedor === 'groq') {
    const apiKey = Deno.env.get('GROQ_API_KEY') || ''
    const modelo = Deno.env.get('GROQ_MODEL') || ''
    return apiKey && modelo ? modeloDoGroq({ apiKey, modelo }) : null
  }
  if (provedor !== 'anthropic') return null
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
  return apiKey ? modeloDaAnthropic({ apiKey, modelo: Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5' }) : null
}

// O modelo com a chave de IA do cliente: só a Anthropic, por enquanto (a mesma API da ponte).
const modeloDoCliente = (chave: ChaveDoCliente): Modelo | null =>
  chave.provider === 'anthropic' ? modeloDaAnthropic({ apiKey: chave.apiKey, modelo: chave.model }) : null

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, args)
  if (error) throw new Error(`${nome}: ${(error as { code?: string }).code ?? ''} ${(error as { message?: string }).message ?? ''}`)
  return data as T
}

const db: RunnerDb = {
  async tokenMatches(token) {
    const { data, error } = await admin.rpc('reply_proposal_runner_token_matches', { p_token: token })
    if (error) throw error
    return data === true
  },
  claim: async (limit) => (await rpc<TrabalhoReservado[] | null>('claim_reply_proposal_jobs', { p_limit: limit })) ?? [],
  context: (job) =>
    rpc<ContextoDaResposta>('reply_proposal_context', { p_job_id: job.job_id, p_claim_token: job.claim_token }),
  // A chave de IA do cliente do Workspace: lida do Vault só aqui, nunca gravada nem registrada.
  async chaveDoCliente(job) {
    const { data, error } = await admin.rpc('reply_proposal_ai_key', { p_job_id: job.job_id, p_claim_token: job.claim_token })
    if (error) {
      // 55000: a chave está ligada ao Workspace, mas o Vault não tem o valor dela.
      if ((error as { code?: string }).code === '55000') throw new ErroDoModelo('workspace_ai_key_unavailable')
      throw new Error(`reply_proposal_ai_key: ${(error as { code?: string }).code ?? ''}`)
    }
    const [linha] = (data ?? []) as { provider: string; model: string; api_key: string }[]
    return linha ? { provider: linha.provider, model: linha.model, apiKey: linha.api_key } : null
  },
  async abrirCredito(job) {
    const linhas = await rpc<RodadaDeCredito[] | null>('begin_reply_proposal_round', {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
    })
    const linha = linhas?.[0]
    if (!linha) throw new Error('begin_reply_proposal_round não respondeu')
    return linha
  },
  async fecharCredito(reservationId, concluida) {
    await rpc<void>('end_agent_round', { p_reservation_id: reservationId, p_success: concluida })
  },
  async salvar(job, corpo, modelo) {
    await rpc<string>('save_generated_reply', {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_body: corpo,
      p_model: modelo,
    })
  },
  async falhar(job, codigo, passageira) {
    await rpc<string>('fail_reply_proposal_job', {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_error_code: codigo,
      p_retryable: passageira,
    })
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a geração terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  modelo: modeloConfigurado(),
  modeloDoCliente,
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
}))
