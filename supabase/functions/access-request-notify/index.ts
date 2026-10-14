import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Db } from './handler.ts'
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
  async claimAccessRequestNotice({ requestId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('claim_access_request_notice', {
      p_request_id: requestId,
    })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as Record<string, unknown>[]
    if (!linha?.name) return { kind: 'already' }
    return {
      kind: 'reserved',
      pedido: {
        nome: String(linha.name),
        empresa: String(linha.company ?? ''),
        telefone: String(linha.phone ?? ''),
        mensagem: String(linha.message ?? ''),
        email: String(linha.email ?? ''),
      },
    }
  },
  async releaseAccessRequestNotice({ requestId, authorization, apikey }) {
    const { error } = await clienteDaSessao(authorization, apikey).rpc('release_access_request_notice', {
      p_request_id: requestId,
    })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
  },
}

Deno.serve(createHandler({ db, mail: resendMail(RESEND_API_KEY), appOrigin: APP_ORIGIN, from: FROM }))
