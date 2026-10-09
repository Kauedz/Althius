import { createClient } from 'npm:@supabase/supabase-js@2'
import { enviadorDeEmail, type LiberacaoDaResposta } from '../_shared/enviador-de-resposta.ts'
import { comCors } from '../_shared/cors.ts'
import { sendStepDbVia } from '../_shared/send-step-adapters.ts'
import { createUnipileRuntime, unipileUnavailableResponse } from '../_shared/unipile/index.ts'
import type { Conversation } from '../_shared/send-step.ts'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lido na inicialização: uma função sem configuração não libera envio nenhum.
const APP_ORIGIN = required('APP_ORIGIN')

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// A conta Unipile que envia é a conexão ativa (ADR-0024), lida a cada pedido (em cache por 30 s). Sem conexão ativa, a
// função responde 503 antes de liberar qualquer envio.
const unipileRuntime = createUnipileRuntime({ rpc: admin, env: Deno.env })

const db: Db = {
  ingestEmailEvent: sendStepDbVia(admin).ingestEmailEvent,
  async userFromJwt(authorization, apikey) {
    const supabase = createClient(required('SUPABASE_URL'), apikey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async hasActiveMembership(workspaceId, userId) {
    const { data, error } = await admin
      .from('workspace_memberships')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    return !error && !!data
  },
  async conversationForReply(proposalId, userId) {
    const { data, error } = await admin.rpc('conversation_for_reply', { p_proposal_id: proposalId, p_user_id: userId })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as Conversation | undefined
    return row ?? null
  },
  async releaseApprovedReply(proposalId, userId, canais) {
    const { data, error } = await admin.rpc('release_approved_reply', {
      p_proposal_id: proposalId,
      p_user_id: userId,
      p_channels: canais,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as LiberacaoDaResposta | undefined
    if (!row) throw Object.assign(new Error('reply proposal not found'), { code: 'P0002' })
    return row
  },
  async recordReplySendResult(proposalId, resultado) {
    const { error } = await admin.rpc('record_reply_send_result', {
      p_proposal_id: proposalId,
      p_outcome: resultado.outcome,
      p_provider_email_id: resultado.providerEmailId ?? null,
      p_provider_message_id: resultado.providerMessageId ?? null,
      p_provider_thread_id: resultado.providerThreadId ?? null,
      p_error: resultado.error,
    })
    if (error) throw error
  },
}

// O 503 do canal desligado também leva o CORS: sem ele, o navegador veria só uma falha de rede.
const unavailable = comCors(APP_ORIGIN, () => Promise.resolve(unipileUnavailableResponse()))

// Hoje só o E-mail envia respostas. O WhatsApp e o LinkedIn entram aqui, com um enviador de cada, quando o núcleo de chat
// (_shared/send-chat-step.ts) existir na main: o banco passa a liberar o canal assim que ele estiver nesta lista.
Deno.serve(async (req) => {
  const unipile = await unipileRuntime.bridge()
  if (!unipile) return unavailable(req)
  return createHandler({
    db,
    unipile,
    enviadores: [enviadorDeEmail(unipile)],
    appOrigin: APP_ORIGIN,
  })(req)
})
