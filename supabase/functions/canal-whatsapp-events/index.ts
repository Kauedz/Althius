import { createClient } from 'npm:@supabase/supabase-js@2'
import { adaptadorCanalDoAmbiente } from '../_shared/canal/index.ts'
import { createHandler, type Db, type SessaoWhatsApp } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const segredoWebhook = required('WHATSAPP_APP_SECRET')
const adaptador = adaptadorCanalDoAmbiente()

async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros)
  if (error) throw new Error(`${nome}: ${error.code ?? ''}`)
  return data as T
}

const db: Db = {
  reservarEvento: (eventId, telefone) => chamar<boolean>('claim_whatsapp_channel_event', { p_event_id: eventId, p_phone: telefone }),
  registrarStatus: async (evento) => {
    await chamar('record_whatsapp_channel_status', {
      p_message_id: evento.id,
      p_status: evento.estado,
      p_updated_at: new Date(Number(evento.atualizadoEm) * 1000).toISOString(),
      p_pricing: evento.pricing,
    })
  },
  contaPorTelefone: (telefone) => chamar<string | null>('whatsapp_channel_account_by_phone', { p_phone: telefone }),
  async workspacesElegiveis(userId) {
    const linhas = await chamar<{ workspace_id: string; workspace_name: string }[] | null>('whatsapp_channel_eligible_workspaces', { p_user_id: userId })
    return (linhas ?? []).map((linha) => ({ id: linha.workspace_id, nome: linha.workspace_name }))
  },
  respostaPendente: (userId) => chamar<string | null>('claim_whatsapp_pending_answer', { p_user_id: userId }),
  async sessao(userId) {
    const linhas = await chamar<{ workspace_id: string | null; awaiting_workspace: boolean; new_conversation: boolean }[] | null>(
      'get_whatsapp_channel_session', { p_user_id: userId },
    )
    const linha = linhas?.[0]
    return linha
      ? { workspaceId: linha.workspace_id, aguardandoWorkspace: linha.awaiting_workspace, novaConversa: linha.new_conversation }
      : { workspaceId: null, aguardandoWorkspace: false, novaConversa: false }
  },
  salvarSessao: async (userId, sessao: SessaoWhatsApp) => {
    await chamar('set_whatsapp_channel_session', {
      p_user_id: userId, p_workspace_id: sessao.workspaceId,
      p_awaiting_workspace: sessao.aguardandoWorkspace, p_new_conversation: sessao.novaConversa,
    })
  },
  alterarPreferenciaDeAvisos: async (userId, parar) => {
    await chamar('set_whatsapp_channel_notices_stopped', { p_user_id: userId, p_stopped: parar })
  },
  registrarRecusaDesconhecido: (telefone) => chamar<boolean>('claim_whatsapp_unknown_reply', { p_phone: telefone }),
  async abrirExecucao(pedido) {
    const { data, error } = await admin.rpc('start_channel_run', {
      p_workspace_id: pedido.workspaceId, p_user_id: pedido.userId, p_text: pedido.texto, p_event_id: pedido.eventId,
      p_new_conversation: pedido.novaConversa,
    })
    if (error) {
      if (error.code === '55006') return { kind: 'recusado', motivo: 'ocupado' }
      if (error.code === '42501' || error.code === 'P0001') return { kind: 'recusado', motivo: 'nao_elegivel' }
      return { kind: 'recusado', motivo: 'indisponivel' }
    }
    const [linha] = (data ?? []) as { conversation_id?: string; run_id?: string }[]
    if (!linha?.conversation_id || !linha.run_id) throw new Error('start_channel_run não devolveu a Execução')
    return { kind: 'aberto', conversationId: linha.conversation_id, runId: linha.run_id }
  },
}

const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime
Deno.serve(createHandler({ db, adaptador, segredoWebhook, esperarDepois: (trabalho) => runtime?.waitUntil ? runtime.waitUntil(trabalho) : void trabalho }))
