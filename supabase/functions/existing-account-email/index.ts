import { createClient } from 'npm:@supabase/supabase-js@2'
import { resendMail } from '../workspace-invitation-email/resend.ts'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Lidos na inicialização: sem a chave do provedor, a função não sobe e nenhum e-mail é prometido.
const SUPABASE_URL = required('SUPABASE_URL')
const RESEND_API_KEY = required('RESEND_API_KEY')
const APP_ORIGIN = required('APP_ORIGIN')
// O mesmo remetente do e-mail do Convite.
const FROM = Deno.env.get('INVITE_EMAIL_FROM') || 'Althius <contato@althius.com.br>'

// Quem pede ainda não tem sessão: a reserva usa a chave de serviço, e a RPC só aceita essa chave.
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db: Db = {
  async claimNotice(email) {
    const { data, error } = await admin.rpc('claim_existing_account_notice', { p_email: email })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    return typeof data === 'string' ? data : null
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para o aviso sair.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (trabalho: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  mail: resendMail(RESEND_API_KEY),
  appOrigin: APP_ORIGIN,
  from: FROM,
  waitUntil: runtime?.waitUntil ? (trabalho) => runtime.waitUntil!(trabalho) : (trabalho) => void trabalho,
}))
