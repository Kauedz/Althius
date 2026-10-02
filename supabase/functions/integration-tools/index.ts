import { createClient } from 'npm:@supabase/supabase-js@2'
import { bancoDoExecutorDeFerramenta, executarChamadaAprovada } from '../_shared/executor-de-aprovacoes.ts'
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

const rpcDoServico = (nome: string, parametros: Record<string, unknown>) => admin.rpc(nome, parametros)
const acesso = { banco: bancoDasIntegracoes(rpcDoServico), ambiente: (nome: string) => Deno.env.get(nome) }

Deno.serve(createHandler({
  acesso,
  // As Aprovações de ferramenta decididas na Conversa (ADR-0022) saem por aqui, logo depois de aprovadas.
  executarChamada: ({ approvalId, administrador }) =>
    executarChamadaAprovada({ banco: bancoDoExecutorDeFerramenta(rpcDoServico), acesso }, { approvalId, administrador }),
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id, email: data.user.email ?? null }
  },
  appOrigin: required('APP_ORIGIN'),
}))
