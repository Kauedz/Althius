import { createClient } from 'npm:@supabase/supabase-js@2'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
import type { BancoDeDesconexao } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Sem o endereço do app, a função não sobe. Os segredos de cada Integração (HUBSPOT_MCP_CLIENT_ID, …) são opcionais aqui:
// sem eles, só a conexão daquela Integração diz "Precisa configurar".
const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')

const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const db: Db & BancoDeDesconexao = {
  ...bancoDasIntegracoes((nome, parametros) => admin.rpc(nome, parametros)),
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id, email: data.user.email ?? null }
  },
}

Deno.serve(createHandler({
  db,
  acessos: db,
  ambiente: (nome) => Deno.env.get(nome),
  appOrigin: APP_ORIGIN,
  urlDeRetorno: `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/integration-callback`,
}))
