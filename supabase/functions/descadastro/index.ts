import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type UnsubscribeOutcome } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(createHandler({
  appOrigin: required('APP_ORIGIN'),
  db: {
    async unsubscribe(token) {
      const { data, error } = await admin.rpc('unsubscribe_by_token', { p_token: token })
      if (error) throw error
      return data as UnsubscribeOutcome
    },
  },
}))
