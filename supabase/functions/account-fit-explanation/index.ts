import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ClienteRpc, escolherLlmDosSinais } from '../_shared/cascata-de-sinais/index.ts'
import { createHandler, type Db, type LeituraDaDescoberta } from './handler.ts'

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

// A explicação espera o motor no máximo 20 s; depois cai na regra.
const llm = escolherLlmDosSinais({
  env: (nome) => (nome === 'SIGNALS_LLM_TIMEOUT_MS' ? '20000' : Deno.env.get(nome)),
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
  async lerDescoberta({ id, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey)
      .rpc('get_discovered_account_fit_explanation', { p_discovered_account_id: id })
    if (error) {
      if (error.code === 'P0002' || error.code === '42501') return null
      throw new Error(`rpc ${error.code ?? 'erro'}`)
    }
    return (data ?? null) as LeituraDaDescoberta | null
  },
  async guardarExplicacao({ id, texto, origem }) {
    const { error } = await admin.rpc('save_discovered_account_fit_explanation', {
      p_discovered_account_id: id,
      p_explanation: texto,
      p_source: origem,
    })
    if (error) throw new Error(`rpc ${error.code ?? 'erro'}`)
  },
}

Deno.serve(createHandler({ db, llm, appOrigin: APP_ORIGIN, log: (campos) => console.log(JSON.stringify(campos)) }))
