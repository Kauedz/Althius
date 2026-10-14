import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Db, type PedidoParaAvisar } from './handler.ts'
import { resendMail } from '../workspace-invitation-email/resend.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const RESEND_API_KEY = required('RESEND_API_KEY')
const APP_ORIGIN = required('APP_ORIGIN')
const FROM = Deno.env.get('INVITE_EMAIL_FROM') || 'Althius <contato@althius.com.br>'

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
  async claimSignalRequestNotice({ workspaceId, requestId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('claim_signal_request_notice', {
      p_workspace_id: workspaceId,
      p_request_id: requestId,
    })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as Record<string, unknown>[]
    if (!linha?.evento) return { kind: 'already' }
    const contato = (linha.contato ?? {}) as PedidoParaAvisar['contato']
    return {
      kind: 'reserved',
      pedido: {
        evento: String(linha.evento),
        empresasOuNicho: String(linha.empresas_ou_nicho ?? ''),
        fontesConhecidas: linha.fontes_conhecidas ? String(linha.fontes_conhecidas) : null,
        urgencia: String(linha.urgencia ?? ''),
        contato,
        workspaceName: String(linha.workspace_name ?? ''),
      },
    }
  },
}

Deno.serve(createHandler({ db, mail: resendMail(RESEND_API_KEY), appOrigin: APP_ORIGIN, from: FROM }))
