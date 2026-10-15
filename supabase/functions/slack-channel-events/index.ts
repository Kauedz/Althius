import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { type AgenteDoSlack, createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// O Slack chama sem JWT (verify_jwt = false em config.toml): a assinatura com o segredo do app do Canal é a autenticação.
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const SEGREDO_DE_ASSINATURA = required('SLACK_CHANNEL_SIGNING_SECRET')

async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros)
  if (error) throw new ErroDoBanco(error.code ?? '', error.message)
  return data as T
}

const db: Db = {
  reservarEvento: (eventId, teamId, tipo) =>
    chamar<boolean>('claim_slack_channel_event', { p_event_id: eventId, p_team_id: teamId, p_event_type: tipo }),
  async instalacaoAtiva(teamId) {
    const linhas = await chamar<{ workspace_id: string; bot_user_id: string; bot_token: string }[] | null>(
      'slack_channel_active_installation',
      { p_team_id: teamId },
    )
    const linha = linhas?.[0]
    return linha ? { workspaceId: linha.workspace_id, botUserId: linha.bot_user_id, token: linha.bot_token } : null
  },
  contaPorEmail: (workspaceId, email) =>
    chamar<string | null>('slack_channel_account_by_email', { p_workspace_id: workspaceId, p_email: email }),
  async agentes(workspaceId) {
    const linhas = await chamar<{ agent_id: string; name: string; in_slack: boolean }[] | null>('slack_channel_agents', {
      p_workspace_id: workspaceId,
    })
    return (linhas ?? []).map((l): AgenteDoSlack => ({ id: l.agent_id, nome: l.name, noSlack: l.in_slack }))
  },
  retirarPeloSlack: (teamId, motivo) => chamar<boolean>('withdraw_slack_channel_by_slack', { p_team_id: teamId, p_reason: motivo }),
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta: o Slack recebe o 200 em menos de 3 segundos.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  segredoDeAssinatura: SEGREDO_DE_ASSINATURA,
  esperarDepois: (trabalho) => (runtime?.waitUntil ? runtime.waitUntil(trabalho) : void trabalho),
}))
