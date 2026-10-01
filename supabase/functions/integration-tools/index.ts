import { createClient } from 'npm:@supabase/supabase-js@2'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
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

Deno.serve(createHandler({
  acesso: {
    banco: bancoDasIntegracoes((nome, parametros) => admin.rpc(nome, parametros)),
    ambiente: (nome) => Deno.env.get(nome),
  },
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id, email: data.user.email ?? null }
  },
  appOrigin: required('APP_ORIGIN'),
}))
