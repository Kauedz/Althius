import { createClient } from 'npm:@supabase/supabase-js@2'

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Backend is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  try {
    const body = await req.json()
    const attemptId = typeof body?.name === 'string' ? body.name : ''
    const accountId = typeof body?.account_id === 'string' ? body.account_id : ''
    const status = typeof body?.status === 'string' ? body.status : ''
    if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !accountId || !['CREATION_SUCCESS', 'RECONNECTED'].includes(status)) {
      return new Response('Invalid callback', { status: 400 })
    }

    const dsn = Deno.env.get('UNIPILE_DSN')
    const apiKey = Deno.env.get('UNIPILE_API_KEY')
    if (!dsn || !apiKey) return new Response('Backend unavailable', { status: 503 })
    const apiOrigin = new URL(dsn.includes('://') ? dsn : `https://${dsn}`)
    if (apiOrigin.protocol !== 'https:' || !apiOrigin.hostname.endsWith('.unipile.com')) {
      return new Response('Backend unavailable', { status: 503 })
    }

    // A hosted-auth callback only supplies a correlation name and account id.
    // Fetch the account with the private API key before accepting that claim.
    const upstream = await fetch(
      `${apiOrigin.origin}/api/v1/accounts/${encodeURIComponent(accountId)}`,
      { headers: { 'X-API-KEY': apiKey, accept: 'application/json' } },
    )
    if (!upstream.ok) return new Response('Account could not be verified', { status: 422 })
    const account = await upstream.json()
    const provider = account?.account_type
    if (typeof provider !== 'string') return new Response('Account could not be verified', { status: 422 })

    const { data, error } = await serviceClient().rpc('complete_sender_connection_attempt', {
      p_attempt_id: attemptId,
      p_unipile_account_id: accountId,
      p_provider: provider.toUpperCase(),
      p_initial_status: status,
    })
    if (error) return new Response('Callback could not be processed', { status: 500 })
    if (data !== 'completed' && data !== 'ignored') {
      return new Response('Callback rejected', { status: 409 })
    }
    return new Response('ok', { status: 200 })
  } catch {
    return new Response('Invalid callback', { status: 400 })
  }
})
