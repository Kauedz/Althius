import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ClienteRpc, escolherLlmDosSinais } from '../_shared/cascata-de-sinais/index.ts'
import { createHandler, type Db, LIMITES, VERSAO_DO_PROMPT } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// O mesmo motor do signal-plan e da leitura do onboarding; nenhum segredo ou fornecedor novo.
const llm = escolherLlmDosSinais({
  env: (nome) => (nome === 'SIGNALS_LLM_TIMEOUT_MS' ? String(LIMITES.esperaDoMotorMs) : Deno.env.get(nome)),
  admin: admin as unknown as ClienteRpc,
  log: (campos) => console.log(JSON.stringify(campos)),
})
const provedor = (Deno.env.get('SIGNALS_LLM_PROVIDER') ?? 'regra').trim().toLowerCase()
const motor = provedor === 'openai' ? `openai:${Deno.env.get('OPENAI_MODEL') ?? ''}` : provedor

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
  async iniciar({ workspaceId, site, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('start_company_context_generation', {
      p_workspace_id: workspaceId,
      p_site: site,
    })
    if (error) throw error
    const inicio = data as Record<string, unknown>
    return {
      generationId: String(inicio.generation_id),
      site: String(inicio.site),
      reaproveitada: inicio.reused === true,
    }
  },
  async concluir(generationId, resultado, motorUsado) {
    const { error } = await admin.rpc('finish_company_context_generation', {
      p_generation_id: generationId,
      p_empresa: resultado.textos?.empresa ?? null,
      p_icp: resultado.textos?.icp ?? null,
      p_personas: resultado.textos?.personas ?? null,
      p_sources: resultado.fontes,
      p_engine: motorUsado,
      p_prompt_version: VERSAO_DO_PROMPT,
      p_cost_usd: resultado.custoUsd,
      p_failure: resultado.falha,
    })
    if (error) throw new Error(error.message)
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a leitura terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (trabalho: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  llm,
  motor,
  appOrigin: APP_ORIGIN,
  emSegundoPlano: (trabalho) => (runtime?.waitUntil ? runtime.waitUntil(trabalho) : void trabalho),
  log: (campos) => console.log(JSON.stringify(campos)),
}))
