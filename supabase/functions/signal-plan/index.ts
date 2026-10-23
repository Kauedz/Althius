import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ClienteRpc, escolherLlmDosSinais } from '../_shared/cascata-de-sinais/index.ts'
import { LIMITES_DO_PLANO } from '../_shared/plano-do-sinal/index.ts'
import { createHandler, type Db, ErroDoPedido, type ResultadoDoPedido } from './handler.ts'

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

// O Plano espera o motor no máximo 25 s (o prazo do ambiente, 45 s, não vale aqui); depois cai na regra.
const llm = escolherLlmDosSinais({
  env: (nome) => (nome === 'SIGNALS_LLM_TIMEOUT_MS' ? String(LIMITES_DO_PLANO.esperaDoMotorMs) : Deno.env.get(nome)),
  admin: admin as unknown as ClienteRpc,
  log: (campos) => console.log(JSON.stringify(campos)),
})

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
  async abrirPedido({ workspaceId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('begin_signal_plan_request', { p_workspace_id: workspaceId })
    if (error) {
      // Só o código do banco decide; o texto do erro não sai daqui.
      console.log(JSON.stringify({ type: 'signal_plan', outcome: 'begin_falhou', code: error.code }))
      throw new ErroDoPedido(error.code === '54000' ? 'limite' : error.code === '42501' ? 'sem_participacao' : 'indisponivel')
    }
    const resposta = data as { requestId?: unknown; tipos?: unknown } | null
    if (typeof resposta?.requestId !== 'string' || !Array.isArray(resposta.tipos)) throw new ErroDoPedido('indisponivel')
    return { pedidoId: resposta.requestId, tipos: resposta.tipos.filter((t): t is string => typeof t === 'string') }
  },
  async fecharPedido({ workspaceId, pedidoId, resultado, authorization, apikey }: {
    workspaceId: string
    pedidoId: string
    resultado: ResultadoDoPedido
    authorization: string
    apikey: string
  }) {
    const { error } = await clienteDaSessao(authorization, apikey).rpc('finish_signal_plan_request', {
      p_workspace_id: workspaceId,
      p_request_id: pedidoId,
      p_outcome: resultado,
    })
    if (error) throw new Error(`${error.code ?? ''}`)
  },
}

Deno.serve(createHandler({ db, llm, appOrigin: APP_ORIGIN, log: (campos) => console.log(JSON.stringify(campos)) }))
