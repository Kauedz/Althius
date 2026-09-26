import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabaseRpc } from '../_shared/rpc.ts'
import { createSequenceEmailStepsHandler } from '../_shared/sequence-email-steps.ts'
import { createUnipileEmail, readUnipileConfig } from '../_shared/unipile-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})
const unipileConfig = readUnipileConfig((name) => Deno.env.get(name))

async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization')
  const apikey = request.headers.get('apikey')
  if (!authorization?.startsWith('Bearer ') || !apikey) return null

  const supabase = createClient(supabaseUrl, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(authorization.slice(7))
  if (error || !data.user) return null
  return { userId: data.user.id, rpc: supabaseRpc(supabase) }
}

Deno.serve(createSequenceEmailStepsHandler({
  authenticate,
  serviceRpc: supabaseRpc(admin),
  unipile: unipileConfig ? createUnipileEmail(unipileConfig) : null,
  corsHeaders,
}))
