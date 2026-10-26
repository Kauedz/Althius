import { createClient } from 'npm:@supabase/supabase-js@2'
import type { ChaveDoCliente } from '../_shared/orquestracao.ts'
import { modeloDaAnthropic } from '../agent-conversation/model.ts'
import { modeloDoGroq } from '../agent-conversation/model-groq.ts'
import { ErroDoModelo, type Modelo } from '../agent-conversation/runner.ts'
import {
  type ContextoDaAnalise,
  createHandler,
  type MotivoDoTeto,
  type ResultadoDaAnalise,
  type RodadaDeCredito,
  type RunnerDb,
  type TrabalhoReservado,
} from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Esta função não recebe a chave da Unipile: analisar uma resposta nunca envia nada.
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * O modelo da Althius, pelo mesmo caminho do reply-proposal-runner: `anthropic` (padrão) ou `groq` (só para teste), pelo
 * REPLY_ANALYSIS_PROVIDER ou AGENT_PROVIDER. Sem a chave do provedor, nenhum modelo: o trabalho falha com
 * `model_unavailable` e a tela mostra que a IA não está disponível, em vez de inventar uma classificação.
 */
const provedor = (Deno.env.get('REPLY_ANALYSIS_PROVIDER') || Deno.env.get('AGENT_PROVIDER') || 'anthropic')
  .trim().toLowerCase()

function modeloConfigurado(): Modelo | null {
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

const db: RunnerDb & Required<Pick<RunnerDb, 'consumirTeto' | 'devolverTeto'>> = {
  async tokenMatches(token) {
    const { data, error } = await admin.rpc('reply_analysis_runner_token_matches', { p_token: token })
    if (error) throw error
    return data === true
  },
  claim: async (limit) => (await rpc<TrabalhoReservado[] | null>('claim_reply_analysis_jobs', { p_limit: limit })) ?? [],
  context: (job) =>
    rpc<ContextoDaAnalise>('reply_analysis_context', { p_job_id: job.job_id, p_claim_token: job.claim_token }),
  async chaveDoCliente(job) {
    const { data, error } = await admin.rpc('reply_analysis_ai_key', { p_job_id: job.job_id, p_claim_token: job.claim_token })
    if (error) {
      // 55000: a chave está ligada ao Workspace, mas o Vault não tem o valor dela.
      if ((error as { code?: string }).code === '55000') throw new ErroDoModelo('workspace_ai_key_unavailable')
      throw new Error(`reply_analysis_ai_key: ${(error as { code?: string }).code ?? ''}`)
    }
    const [linha] = (data ?? []) as { provider: string; model: string; api_key: string }[]
    return linha ? { provider: linha.provider, model: linha.model, apiKey: linha.api_key } : null
  },
  consumirTeto: (job) =>
    rpc<'ok' | MotivoDoTeto>('consume_reply_analysis_cap', { p_job_id: job.job_id, p_claim_token: job.claim_token }),
  async devolverTeto(job) {
    await rpc<void>('refund_reply_analysis_cap', { p_job_id: job.job_id, p_claim_token: job.claim_token })
  },
  async abrirCredito(job) {
    const linhas = await rpc<RodadaDeCredito[] | null>('begin_reply_analysis_round', {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
    })
    const linha = linhas?.[0]
    if (!linha) throw new Error('begin_reply_analysis_round não respondeu')
    return linha
  },
  async fecharCredito(reservationId, concluida) {
    await rpc<void>('end_agent_round', { p_reservation_id: reservationId, p_success: concluida })
  },
  async salvar(job, resultado: ResultadoDaAnalise, modelo) {
    await rpc<string>('save_reply_analysis', {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_classification: resultado.classification,
      p_interpretation: resultado.interpretation,
      p_evidence: resultado.evidence,
      p_recommendation: resultado.recommendation,
      p_model: modelo,
    })
  },
  async falhar(job, codigo, passageira) {
    await rpc<string>('fail_reply_analysis_job', {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_error_code: codigo,
      p_retryable: passageira,
    })
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a análise terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  modelo: modeloConfigurado(),
  modeloDoCliente,
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
}))
