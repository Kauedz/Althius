import { createClient } from 'npm:@supabase/supabase-js@2'
import { adaptadorCanalDoAmbiente } from '../_shared/canal/index.ts'
import { createHandler, type Db } from './handler.ts'
import { resendMail } from '../workspace-invitation-email/resend.ts'
import { comCors } from '../_shared/cors.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const url = required('SUPABASE_URL')
const anonKey = required('SUPABASE_ANON_KEY')
const appOrigin = required('APP_ORIGIN')
const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const mail = resendMail(required('RESEND_API_KEY'))
const db: Db = {
  async getUser(token) {
    const { data, error } = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token)
    return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? '' }
  },
  async rpc(name, args) {
    const { data, error } = await admin.rpc(name, args)
    if (error) throw new Error('phone operation failed')
    return data
  },
}

Deno.serve(comCors(appOrigin, createHandler({
  db,
  canal: adaptadorCanalDoAmbiente(),
  mail: { send: (email) => mail.send({ from: Deno.env.get('INVITE_EMAIL_FROM') || 'Althius <contato@althius.com.br>', text: '', ...email }) },
  template: Deno.env.get('WHATSAPP_AUTH_TEMPLATE') || 'codigo_verificacao_telefone',
})))
