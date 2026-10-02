import { createClient } from 'npm:@supabase/supabase-js@2'
import { comCors, origemDoAppParaLink, origensPermitidas } from '../_shared/cors.ts'

const UNIPILE_API_BASE = 'https://api.unipile.com'

type Channel = 'email' | 'whatsapp' | 'linkedin'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Backend is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function unipileConfig() {
  const apiKey = Deno.env.get('UNIPILE_API_KEY')
  // A primeira origem do APP_ORIGIN (a publicada) só valida a configuração; o retorno usa a origem do pedido.
  const appOrigin = origensPermitidas(Deno.env.get('APP_ORIGIN') ?? '')[0]
  if (!apiKey || !appOrigin) throw new Error('Backend is not configured')
  const origin = new URL(appOrigin)
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('Backend is not configured')
  }
  return { apiKey, appOrigin: origin.origin }
}

function providerNames(channel: Channel) {
  if (channel === 'email') return ['google', 'outlook', 'imap']
  if (channel === 'whatsapp') return ['whatsapp']
  return ['linkedin']
}

async function caller(req: Request) {
  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization?.startsWith('Bearer ') || !apikey) return null

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(authorization.slice(7))
  if (error || !data.user) return null
  return { userId: data.user.id, supabase }
}

Deno.serve(comCors(Deno.env.get('APP_ORIGIN') ?? '', async (req) => {
  if (req.method !== 'POST') return response({ error: 'Método não permitido.' }, 405)

  const auth = await caller(req)
  if (!auth) return response({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

  try {
    const body = await req.json()
    const action = body?.action
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    if (!workspaceId) return response({ error: 'Workspace obrigatório.' }, 400)

    const admin = serviceClient()
    const { data: membership, error: membershipError } = await admin
      .from('workspace_memberships')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', auth.userId)
      .eq('active', true)
      .maybeSingle()
    if (membershipError || !membership) {
      return response({ error: 'Participação ativa no Workspace não encontrada.' }, 403)
    }

    if (action === 'list') {
      const { data, error } = await auth.supabase.rpc('list_owned_sender_accounts', {
        p_workspace_id: workspaceId,
      })
      if (error) return response({ error: 'Não foi possível carregar suas Contas remetentes.' }, 403)
      return response({ accounts: data ?? [] })
    }

    if (action === 'connect' || action === 'reconnect') {
      const channel = body?.channel as Channel
      if (!['email', 'whatsapp', 'linkedin'].includes(channel)) {
        return response({ error: 'Canal de abordagem não suportado.' }, 400)
      }
      const reconnectId = action === 'reconnect' && typeof body?.senderAccountId === 'string'
        ? body.senderAccountId
        : null
      if (action === 'reconnect' && !reconnectId) {
        return response({ error: 'Conta remetente obrigatória para reconectar.' }, 400)
      }

      const { data: attempts, error: attemptError } = await auth.supabase.rpc(
        'create_sender_connection_attempt',
        {
          p_workspace_id: workspaceId,
          p_channel: channel,
          p_reconnect_sender_account_id: reconnectId,
        },
      )
      const attempt = attempts?.[0]
      if (attemptError || !attempt) return response({ error: 'Não foi possível iniciar a conexão.' }, 403)

      const config = unipileConfig()
      const reconnecting = action === 'reconnect'
      const payload: Record<string, unknown> = {
        expires_on: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        // Volta para a origem de onde o pedido saiu (ex.: o app local), se ela está no APP_ORIGIN: voltar para outra
        // origem perde a sessão e o Workspace escolhido, e a próxima conexão cai noutro Workspace.
        redirect_uri: `${origemDoAppParaLink(req, Deno.env.get('APP_ORIGIN') ?? '')}/conexoes`,
        state: attempt.attempt_id,
      }
      if (reconnecting) {
        payload.account_id = attempt.provider_account_id
      } else {
        payload.providers = providerNames(channel)
      }

      const upstream = await fetch(`${UNIPILE_API_BASE}/v2/auth/link`, {
        method: 'POST',
        headers: {
          'X-API-KEY': config.apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!upstream.ok) return response({ error: 'A Unipile não conseguiu iniciar a conexão. Tente novamente.' }, 502)
      const result = await upstream.json()
      const link = typeof result?.link === 'string' ? result.link : result?.data?.link
      if (typeof link !== 'string' || !link.startsWith('https://')) {
        return response({ error: 'A Unipile retornou um link de autenticação inválido.' }, 502)
      }
      return response({ url: link })
    }

    if (action === 'disconnect') {
      const senderAccountId = typeof body?.senderAccountId === 'string' ? body.senderAccountId : ''
      if (!senderAccountId) return response({ error: 'Conta remetente obrigatória.' }, 400)
      const { data: account, error: accountError } = await auth.supabase.rpc(
        'get_owned_sender_account_for_disconnect', {
          p_sender_account_id: senderAccountId,
          p_workspace_id: workspaceId,
        },
      )
      if (accountError || !account?.[0]?.unipile_account_id) {
        return response({ error: 'Conta remetente não encontrada.' }, 403)
      }
      const config = unipileConfig()
      const upstream = await fetch(
        `${UNIPILE_API_BASE}/v2/accounts/${encodeURIComponent(account[0].unipile_account_id)}`,
        { method: 'DELETE', headers: { 'X-API-KEY': config.apiKey, accept: 'application/json' } },
      )
      if (!upstream.ok && upstream.status !== 404) {
        return response({ error: 'A Unipile não confirmou a desconexão. Tente novamente.' }, 502)
      }
      const { data: markedDisconnected, error: updateError } = await admin.rpc('mark_owned_sender_account_disconnected', {
        p_sender_account_id: senderAccountId,
        p_owner_user_id: auth.userId,
        p_workspace_id: workspaceId,
      })
      if (updateError || markedDisconnected !== true) {
        return response({ error: 'A desconexão ocorreu, mas o estado ainda não foi atualizado.' }, 502)
      }
      // canais-11: as Sequências que usavam a conta pausam com o motivo; reconectar não as retoma. Se falhar, o
      // Executor pausa quando o próximo passo for barrado.
      await admin.rpc('hold_sequences_of_lost_sender', { p_unipile_account_id: account[0].unipile_account_id })
      return response({ ok: true })
    }

    return response({ error: 'Ação não reconhecida.' }, 400)
  } catch {
    return response({ error: 'Não foi possível concluir a solicitação.' }, 500)
  }
}))
