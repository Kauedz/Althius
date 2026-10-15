import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db, type TentativaDeInstalacao } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// O retorno da instalação chega sem JWT (verify_jwt = false em config.toml): o `state` guardado no banco é a autenticação.
const SUPABASE_URL = required('SUPABASE_URL')
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros)
  if (error) throw new ErroDoBanco(error.code ?? '', error.message)
  return data as T
}

const db: Db = {
  async tentativa(state) {
    const linhas = await chamar<{ status: TentativaDeInstalacao['status']; workspace_id: string; return_to: string | null }[] | null>(
      'slack_channel_install_attempt',
      { p_state: state },
    )
    const linha = linhas?.[0]
    return linha ? { status: linha.status, workspaceId: linha.workspace_id, returnTo: linha.return_to } : null
  },
  async concluir(a) {
    await chamar('complete_slack_channel_install', {
      p_state: a.state,
      p_team_id: a.teamId,
      p_team_name: a.teamName,
      p_bot_user_id: a.botUserId,
      p_app_id: a.appId,
      p_bot_token: a.token,
      p_scopes: a.escopos,
    })
  },
}

Deno.serve(createHandler({
  db,
  ambiente: (nome) => Deno.env.get(nome),
  appOrigin: required('APP_ORIGIN'),
  urlDeRetorno: `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/slack-channel-callback`,
}))
