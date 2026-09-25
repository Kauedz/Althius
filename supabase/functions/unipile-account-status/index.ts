import { createClient } from 'npm:@supabase/supabase-js@2'

const jsonHeaders = { 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const webhookSecret = Deno.env.get('UNIPILE_WEBHOOK_SECRET')
  const suppliedSecret = req.headers.get('Unipile-Auth')
  if (!webhookSecret || !suppliedSecret || suppliedSecret !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await req.json()
    const statusEvent = body?.AccountStatus
    const accountId = statusEvent?.account_id
    const status = statusEvent?.message
    if (typeof accountId !== 'string' || typeof status !== 'string') {
      return new Response('Invalid event', { status: 400 })
    }
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return new Response('Backend unavailable', { status: 503 })
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await admin.rpc('apply_unipile_sender_status', {
      p_unipile_account_id: accountId,
      p_status: status,
    })
    if (error) return new Response('Event could not be processed', { status: 500 })
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders })
  } catch {
    return new Response('Invalid event', { status: 400 })
  }
})
