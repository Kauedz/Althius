import { createClient } from 'npm:@supabase/supabase-js@2'
import { bancoDasIntegracoes } from '../_shared/integracoes/banco-supabase.ts'
import { createHandler } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// O retorno do OAuth chega sem JWT (verify_jwt = false em config.toml): o `state` guardado no banco é a autenticação.
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(createHandler({
  db: bancoDasIntegracoes((nome, parametros) => admin.rpc(nome, parametros)),
  ambiente: (nome) => Deno.env.get(nome),
  appOrigin: required('APP_ORIGIN'),
}))
