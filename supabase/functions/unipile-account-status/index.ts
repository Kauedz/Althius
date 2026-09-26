import { createClient } from 'npm:@supabase/supabase-js@2'

const jsonHeaders = { 'Content-Type': 'application/json' }

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Backend is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Unipile v2 assina cada entrega com HMAC-SHA256: header "unipile-signature: t=<epoch
// em segundos>,v0=<hex>", assinatura sobre "${t}.${rawBody}" usando o secret que a própria
// Unipile gerou ao criar o Webhook Endpoint (POST /v2/webhooks/endpoints).
async function verifySignature(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=') as [string, string]))
  const timestamp = parts.t
  const providedSignature = parts.v0
  if (!timestamp || !providedSignature) return false

  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  if (computedSignature.length !== providedSignature.length) return false
  let mismatch = 0
  for (let i = 0; i < computedSignature.length; i++) {
    mismatch |= computedSignature.charCodeAt(i) ^ providedSignature.charCodeAt(i)
  }
  return mismatch === 0
}

// Traduz os event types de conta da v2 para o vocabulário que apply_unipile_sender_status já entende
// (a RPC não muda: CREDENTIALS/ERROR/OK/DELETED já existiam para os mesmos significados na v1).
const STATUS_EVENTS: Record<string, string> = {
  'account.status.running': 'OK',
  'account.status.disconnected': 'CREDENTIALS',
  'account.status.errored': 'ERROR',
  'account.remove': 'DELETED',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('UNIPILE_WEBHOOK_SECRET')
  const signatureHeader = req.headers.get('unipile-signature')
  if (!secret || !signatureHeader) return new Response('Unauthorized', { status: 401 })

  const rawBody = await req.text()
  if (!(await verifySignature(rawBody, signatureHeader, secret))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const event = JSON.parse(rawBody)
    const type = typeof event?.type === 'string' ? event.type : ''
    const accountId = typeof event?.account_id === 'string' ? event.account_id : ''
    if (!type || !accountId) return new Response('Invalid event', { status: 400 })

    const admin = serviceClient()

    if (type === 'account.add' || type === 'account.reconnect') {
      const attemptId = typeof event?.payload?.state === 'string' ? event.payload.state : ''
      const provider = typeof event?.payload?.account?.provider === 'string'
        ? event.payload.account.provider
        : typeof event?.account_provider === 'string'
          ? event.account_provider
          : ''
      if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !provider) {
        return new Response('Invalid event', { status: 400 })
      }
      const { data, error } = await admin.rpc('complete_sender_connection_attempt', {
        p_attempt_id: attemptId,
        p_unipile_account_id: accountId,
        p_provider: provider.toUpperCase(),
        p_initial_status: type === 'account.add' ? 'CREATION_SUCCESS' : 'RECONNECTED',
      })
      if (error) return new Response('Event could not be processed', { status: 500 })
      if (data !== 'completed' && data !== 'ignored') {
        return new Response('Event rejected', { status: 409 })
      }
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders })
    }

    const mappedStatus = STATUS_EVENTS[type]
    if (mappedStatus) {
      const { error } = await admin.rpc('apply_unipile_sender_status', {
        p_unipile_account_id: accountId,
        p_status: mappedStatus,
      })
      if (error) return new Response('Event could not be processed', { status: 500 })
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders })
  } catch {
    return new Response('Invalid event', { status: 400 })
  }
})
