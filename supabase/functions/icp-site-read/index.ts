import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ClienteRpc, escolherLlmDosSinais } from '../_shared/cascata-de-sinais/index.ts'
import { createHandler, type Db, LIMITES } from './handler.ts'

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

// Mesmo motor do signal-plan; a leitura espera no máximo 25 s.
const llm = escolherLlmDosSinais({
  env: (nome) => (nome === 'SIGNALS_LLM_TIMEOUT_MS' ? String(LIMITES.esperaDoMotorMs) : Deno.env.get(nome)),
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
  async lerDay0({ workspaceId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('get_my_day0', { p_workspace_id: workspaceId })
    if (error || !data || typeof data !== 'object') return null
    const day0 = data as Record<string, unknown>
    return {
      ramo: typeof day0.ramo === 'string' ? day0.ramo : '',
      dominio: typeof day0.dominio === 'string' ? day0.dominio : '',
    }
  },
}

Deno.serve(createHandler({ db, llm, appOrigin: APP_ORIGIN, log: (campos) => console.log(JSON.stringify(campos)) }))
