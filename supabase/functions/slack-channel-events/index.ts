import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { type AberturaDoFio, type AgenteDoSlack, createHandler, type Db } from './handler.ts'

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
  // O fio (slack-canal 03, migration 20261029100000): o banco confere tudo de novo e traduz-se aqui o código da recusa.
  async abrirFio(pedido) {
    const { data, error } = await admin.rpc('start_slack_channel_run', {
      p_workspace_id: pedido.workspaceId,
      p_user_id: pedido.userId,
      p_agent_id: pedido.agentId,
      p_team_id: pedido.teamId,
      p_channel_id: pedido.canal,
      p_thread_ts: pedido.threadTs,
      p_text: pedido.texto,
      p_event_id: pedido.eventId,
    })
    if (error) return { kind: 'recusado', motivo: recusaDoFio(error.code ?? '', error.message) }
    const [linha] = (data ?? []) as { conversation_id?: string; run_id?: string }[]
    if (!linha?.conversation_id || !linha.run_id) throw new Error('start_slack_channel_run não devolveu a Execução')
    return { kind: 'aberto', conversationId: linha.conversation_id, runId: linha.run_id }
  },
  // O fio pela chave (slack-canal 04, migration 20261030100000): o dono e o Agente, para continuar ou recusar.
  async lerFio(chave) {
    const linhas = await chamar<{ owner_id: string; owner_name: string | null; agent_id: string; agent_name: string }[] | null>(
      'slack_channel_thread',
      { p_workspace_id: chave.workspaceId, p_team_id: chave.teamId, p_channel_id: chave.canal, p_thread_ts: chave.threadTs },
    )
    const linha = linhas?.[0]
    return linha
      ? { donoId: linha.owner_id, donoNome: linha.owner_name, agenteId: linha.agent_id, agenteNome: linha.agent_name }
      : null
  },
}

function recusaDoFio(codigo: string, mensagem: string): Extract<AberturaDoFio, { kind: 'recusado' }>['motivo'] {
  if (codigo === '55006') return 'ocupado'
  if (codigo === '55000') return 'sem_instalacao'
  if (codigo === 'P0001' && mensagem.includes('contract')) return 'sem_contrato'
  if (codigo === '42501') return mensagem.includes('thread') ? 'fio_de_outra_pessoa' : 'nao_reconhecido'
  if (codigo === '22023' && mensagem.includes('another agent')) return 'fio_de_outro_agente'
  if (codigo === '22023' && mensagem.includes('slack')) return 'nao_atende_no_slack'
  return 'indisponivel'
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta: o Slack recebe o 200 em menos de 3 segundos.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  segredoDeAssinatura: SEGREDO_DE_ASSINATURA,
  esperarDepois: (trabalho) => (runtime?.waitUntil ? runtime.waitUntil(trabalho) : void trabalho),
}))
