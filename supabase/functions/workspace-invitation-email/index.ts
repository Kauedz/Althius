import { createClient } from 'npm:@supabase/supabase-js@2'
import { type ConviteParaEnviar, createHandler, type Db, type Mail, MailRequestError } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: sem a chave do provedor, a função não sobe e nenhum e-mail é prometido.
const SUPABASE_URL = required('SUPABASE_URL')
const RESEND_API_KEY = required('RESEND_API_KEY')
const APP_ORIGIN = required('APP_ORIGIN')
const FROM = Deno.env.get('INVITE_EMAIL_FROM') || 'Althius <contato@althius.com.br>'

/** Um cliente com a sessão de quem pede: o banco aplica as regras dela, sem a chave de serviço. */
function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async pendingInvitation({ workspaceId, invitationId, authorization, apikey }) {
    const supabase = clienteDaSessao(authorization, apikey)
    const [convites, workspace, perfil] = await Promise.all([
      supabase.rpc('list_workspace_invitations', { p_workspace_id: workspaceId }),
      supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
      supabase.rpc('get_my_profile'),
    ])
    if (convites.error) return null
    const linha = ((convites.data ?? []) as Record<string, unknown>[]).find((c) => c.id === invitationId)
    if (!linha || linha.status !== 'pendente' || typeof linha.token !== 'string' || !linha.token) return null
    const [quemConvida] = (perfil.data ?? []) as { name: string | null; email: string }[]
    const convite: ConviteParaEnviar = {
      email: String(linha.email),
      role: linha.role === 'admin' ? 'admin' : 'member',
      token: linha.token,
      expiresAt: String(linha.expires_at),
      workspaceName: (workspace.data as { name?: string } | null)?.name || 'Workspace',
      inviterName: quemConvida?.name || quemConvida?.email || 'Uma pessoa da Althius',
    }
    return convite
  },
}

const mail: Mail = {
  async send(email) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: controller.signal,
      })
      const corpo = await resposta.json().catch(() => ({})) as { id?: string; message?: string }
      if (!resposta.ok) throw new MailRequestError(resposta.status, String(corpo.message ?? ''))
      if (!corpo.id) throw new Error('resposta sem id')
      return { id: corpo.id }
    } finally {
      clearTimeout(timer)
    }
  },
}

Deno.serve(createHandler({ db, mail, appOrigin: APP_ORIGIN, from: FROM }))
