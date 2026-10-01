import { createClient } from 'npm:@supabase/supabase-js@2'
import { bancoDoExecutor } from '../_shared/executor-de-aprovacoes.ts'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
import { bancoDoEnvio } from './banco.ts'
import { createHandler } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')

const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const rpc = (nome: string, parametros: Record<string, unknown>) => admin.rpc(nome, parametros)

Deno.serve(createHandler({
  banco: bancoDoEnvio(rpc),
  aprovacoes: bancoDoExecutor(rpc),
  acesso: {
    banco: bancoDasIntegracoes(rpc),
    ambiente: (nome) => Deno.env.get(nome),
  },
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  appOrigin: required('APP_ORIGIN'),
}))
