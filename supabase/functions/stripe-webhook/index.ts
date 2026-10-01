import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const STRIPE_WEBHOOK_SECRET = required('STRIPE_WEBHOOK_SECRET')

async function rpc<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros)
  if (error) throw new Error(`${nome}: ${error.code ?? ''} ${error.message}`)
  return data as T
}

const db: Db = {
  claimEvent: (eventId, type) => rpc<boolean>('claim_stripe_event', { p_event_id: eventId, p_event_type: type }),
  workspaceByCustomer: (customerId) => rpc<string | null>('workspace_by_stripe_customer', { p_customer_id: customerId }),
  async applySubscription(a) {
    await rpc('apply_stripe_subscription', {
      p_workspace_id: a.workspaceId,
      p_customer_id: a.customerId,
      p_subscription_id: a.subscriptionId,
      p_stripe_status: a.status,
      p_seats: a.seats,
      p_period_end: a.periodEnd,
      p_event_at: a.eventAt,
    })
  },
  async grantSeatCredits(invoiceId, workspaceId, seats) {
    return Number(await rpc('grant_seat_credits', { p_invoice_id: invoiceId, p_workspace_id: workspaceId, p_seats: seats }))
  },
}

Deno.serve(createHandler({ db, webhookSecret: STRIPE_WEBHOOK_SECRET }))
