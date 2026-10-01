import { createClient } from 'npm:@supabase/supabase-js@2'
import { stripeHttp } from '../_shared/stripe.ts'
import { createHandler, type Db } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

// Sem a chave do Stripe ou o preço do assento, a função não sobe e nenhuma cobrança é prometida.
const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')
const STRIPE_SECRET_KEY = required('STRIPE_SECRET_KEY')
const STRIPE_PRICE_ID = required('STRIPE_PRICE_ID')

const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id, email: data.user.email ?? null }
  },
  async billingContext({ workspaceId, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('billing_context', { p_workspace_id: workspaceId })
    if (error?.code === '42501') return null
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
    const [linha] = (data ?? []) as {
      workspace_name: string
      stripe_customer_id: string | null
      stripe_subscription_id: string | null
      used_seats: number
    }[]
    if (!linha) return null
    return {
      workspaceName: linha.workspace_name,
      stripeCustomerId: linha.stripe_customer_id,
      stripeSubscriptionId: linha.stripe_subscription_id,
      usedSeats: Number(linha.used_seats),
    }
  },
  async recordCustomer(workspaceId, customerId) {
    const { error } = await admin.rpc('record_stripe_customer', { p_workspace_id: workspaceId, p_customer_id: customerId })
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`)
  },
}

Deno.serve(createHandler({ db, stripe: stripeHttp(STRIPE_SECRET_KEY), priceId: STRIPE_PRICE_ID, appOrigin: APP_ORIGIN }))
