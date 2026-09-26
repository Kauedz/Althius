// Webhook v1 de e-mail da Unipile (mail_received, mail_sent, mail_moved).
// A autenticação é o segredo configurado no header Unipile-Auth: o contrato v1 não usa o HMAC da v2 e tem segredo
// próprio, separado do webhook de ciclo de vida. O evento é persistido antes da resposta 200, que a Unipile espera
// em menos de 30 segundos; o processamento roda depois e é idempotente no banco.
import { type Rpc, RpcError } from './rpc.ts'

const EMAIL_EVENTS = new Set(['mail_received', 'mail_sent', 'mail_moved'])

export interface MailWebhookDeps {
  secret: string | undefined
  rpc: Rpc
  /** Continua o trabalho depois da resposta (EdgeRuntime.waitUntil). */
  background(task: () => Promise<unknown>): void
}

function sameSecret(supplied: string, expected: string) {
  const a = new TextEncoder().encode(supplied)
  const b = new TextEncoder().encode(expected)
  let difference = a.length ^ b.length
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return difference === 0
}

export function createMailWebhookHandler(deps: MailWebhookDeps) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const supplied = request.headers.get('Unipile-Auth')
    if (!deps.secret || !supplied || !sameSecret(supplied, deps.secret)) {
      return new Response('Unauthorized', { status: 401 })
    }

    let event: Record<string, unknown>
    try {
      event = await request.json()
    } catch {
      return new Response('Invalid event', { status: 400 })
    }
    if (!event || typeof event !== 'object' || typeof event.event !== 'string') {
      return new Response('Invalid event', { status: 400 })
    }
    // Leitura, rastreamento e mensageria não são deste webhook: confirmar evita retentativas inúteis.
    if (!EMAIL_EVENTS.has(event.event)) return json({ received: true, ignored: true })

    let recorded: { event_id: string; is_new: boolean }
    try {
      recorded = await deps.rpc('record_unipile_mail_event', { p_event: event }) as typeof recorded
    } catch (error) {
      if (error instanceof RpcError && error.code === '22023') return new Response('Invalid event', { status: 400 })
      return new Response('Event could not be stored', { status: 500 })
    }

    if (recorded.is_new) {
      deps.background(async () => {
        try {
          await deps.rpc('process_unipile_mail_event', { p_event_id: recorded.event_id })
          // Aproveita a chamada para retomar eventos que ficaram sem processar.
          await deps.rpc('process_pending_unipile_mail_events', { p_limit: 5 })
        } catch {
          // O evento segue persistido e pendente; o processamento posterior tenta de novo.
        }
      })
    }
    return json({ received: true })
  }
}
