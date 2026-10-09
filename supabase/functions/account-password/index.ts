import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')

// O limite de tentativas usa a chave de serviço: só ela chama as RPCs, para ninguém zerar o próprio contador.
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db: Db = {
  async claimAttempt(userId) {
    const { data, error } = await admin.rpc('claim_password_change_attempt', { p_user_id: userId })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    return data === true
  },
  async clearAttempts(userId) {
    const { error } = await admin.rpc('clear_password_change_attempts', { p_user_id: userId })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
  },
}

Deno.serve(createHandler({ db, supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN }))
