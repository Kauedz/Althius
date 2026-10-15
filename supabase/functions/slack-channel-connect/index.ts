import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Sem o endereço do app, a função não sobe. Os segredos do app do Canal (SLACK_CHANNEL_CLIENT_ID e
// SLACK_CHANNEL_CLIENT_SECRET) são opcionais aqui: sem eles, Conectar diz "Precisa configurar".
const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')

const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros)
  if (error) throw new ErroDoBanco(error.code ?? '', error.message)
  return data as T
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const sessao = createClient(SUPABASE_URL, apikey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await sessao.auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  iniciarTentativa: (a) =>
    chamar<string>('start_slack_channel_install', { p_workspace_id: a.workspaceId, p_user_id: a.userId, p_return_to: a.returnTo }),
  tokenParaRetirar: (a) =>
    chamar<string>('slack_channel_token_for_withdrawal', { p_workspace_id: a.workspaceId, p_user_id: a.userId }),
  retirar: async (a) => {
    await chamar('withdraw_slack_channel', { p_workspace_id: a.workspaceId, p_user_id: a.userId })
  },
}

Deno.serve(createHandler({
  db,
  ambiente: (nome) => Deno.env.get(nome),
  appOrigin: APP_ORIGIN,
  urlDeRetorno: `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/slack-channel-callback`,
}))
