import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Db } from './handler.ts'
import { resendMail } from './resend.ts'

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
  async claimInvitationEmail({ workspaceId, invitationId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('claim_invitation_email', {
      p_workspace_id: workspaceId,
      p_invitation_id: invitationId,
    })
    // 42501: não é Administrador ativo; P0002: o Convite não está pendente neste Workspace; 54000: limite de envios.
    if (error?.code === '42501' || error?.code === 'P0002') return { kind: 'not_found' }
    if (error?.code === '54000') return { kind: 'limit_reached' }
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as Record<string, string>[]
    if (!linha?.token) throw new Error('claim_invitation_email não devolveu o convite')
    return {
      kind: 'reserved',
      convite: {
        email: linha.email,
        role: linha.role === 'admin' ? 'admin' : 'member',
        token: linha.token,
        expiresAt: linha.expires_at,
        workspaceName: linha.workspace_name,
        inviterName: linha.inviter_name,
      },
    }
  },
}

Deno.serve(createHandler({ db, mail: resendMail(RESEND_API_KEY), appOrigin: APP_ORIGIN, from: FROM }))
