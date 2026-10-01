// A assinatura do Workspace pelo navegador (creditos-e-planos 05 e 06). O Administrador pede `{ action, workspaceId }`:
//   checkout  abre o Checkout do Stripe para assinar, com um assento por Participante ativo;
//   portal    abre o portal do Stripe (cartão, faturas, cancelar);
//   seats     ajusta os assentos da assinatura aos Participantes ativos de hoje, com cobrança proporcional.
// O banco confere que quem pede é Administrador ativo (billing_context); o Stripe só é chamado depois. A chave secreta
// fica só aqui. Banco e Stripe entram por injeção de dependência, para o teste ir da requisição à resposta sem rede.
import { comCors, origemDoAppParaLink } from '../_shared/cors.ts'
import { type Stripe, StripeError } from '../_shared/stripe.ts'

export interface ContextoDaCobranca {
  workspaceName: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  usedSeats: number
}

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string; email: string | null } | null>
  /** RPC billing_context com a sessão de quem pede; null quando não é Administrador ativo do Workspace. */
  billingContext(args: { workspaceId: string; authorization: string; apikey: string }): Promise<ContextoDaCobranca | null>
  /** RPC record_stripe_customer, com a chave de serviço. */
  recordCustomer(workspaceId: string, customerId: string): Promise<void>
}

export interface Deps {
  db: Db
  stripe: Stripe
  /** O preço por assento no Stripe (R$ 500 por usuário por mês, recorrente). */
  priceId: string
  /**
   * Liga o Stripe Tax no Checkout. Só com um registro ativo no Stripe Tax: sem ele, o Stripe não calcula nem cobra
   * imposto e não dá erro. Desligado por padrão.
   */
  automaticTax?: boolean
  appOrigin: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/** O rótulo deste fluxo de Checkout no painel do Stripe (com o sufixo de 8 letras que o Stripe pede). */
export const IDENTIFICADOR_DO_CHECKOUT = 'althius-plano-por-assento-qkzrmbte'

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const action = body?.action
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    if (!UUID.test(workspaceId)) return respond({ error: 'Workspace obrigatório.' }, 400)
    if (action !== 'checkout' && action !== 'portal' && action !== 'seats') return respond({ error: 'Ação desconhecida.' }, 400)

    const contexto = await deps.db.billingContext({ workspaceId, authorization, apikey })
    if (!contexto) return respond({ error: 'Só um Administrador do Workspace mexe na assinatura.' }, 403)
    const origem = origemDoAppParaLink(req, deps.appOrigin)

    try {
      if (action === 'checkout') {
        if (contexto.stripeSubscriptionId) return respond({ error: 'Este Workspace já tem assinatura. Use o portal.' }, 409)
        let customer = contexto.stripeCustomerId
        if (!customer) {
          const criado = await deps.stripe.post('customers', {
            name: contexto.workspaceName,
            ...(user.email ? { email: user.email } : {}),
            metadata: { workspace_id: workspaceId },
          })
          customer = String(criado.id)
          await deps.db.recordCustomer(workspaceId, customer)
        }
        const sessao = await deps.stripe.post('checkout/sessions', {
          mode: 'subscription',
          customer,
          client_reference_id: workspaceId,
          line_items: [{ price: deps.priceId, quantity: Math.max(1, contexto.usedSeats) }],
          subscription_data: { metadata: { workspace_id: workspaceId } },
          allow_promotion_codes: true,
          integration_identifier: IDENTIFICADOR_DO_CHECKOUT,
          // O CNPJ entra na fatura; o nome e o endereço do Checkout atualizam o cliente.
          tax_id_collection: { enabled: true },
          customer_update: { name: 'auto', address: 'auto' },
          ...(deps.automaticTax ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' } : {}),
          success_url: `${origem}/?assinatura=ok`,
          cancel_url: `${origem}/?assinatura=cancelada`,
        })
        log({ type: 'stripe_billing', action, workspaceId, seats: contexto.usedSeats })
        return respond({ url: sessao.url })
      }

      if (action === 'portal') {
        if (!contexto.stripeCustomerId) return respond({ error: 'Este Workspace ainda não tem assinatura.' }, 409)
        const sessao = await deps.stripe.post('billing_portal/sessions', {
          customer: contexto.stripeCustomerId,
          return_url: `${origem}/`,
        })
        return respond({ url: sessao.url })
      }

      if (!contexto.stripeSubscriptionId) return respond({ error: 'Este Workspace ainda não tem assinatura.' }, 409)
      const assinatura = await deps.stripe.get(`subscriptions/${encodeURIComponent(contexto.stripeSubscriptionId)}`)
      const item = ((assinatura.items as { data?: { id: string; quantity?: number }[] } | undefined)?.data ?? [])[0]
      if (!item) return respond({ error: 'A assinatura não tem item de assento.' }, 409)
      const assentos = Math.max(1, contexto.usedSeats)
      if (item.quantity !== assentos) {
        await deps.stripe.post(`subscription_items/${encodeURIComponent(item.id)}`, {
          quantity: assentos,
          proration_behavior: 'create_prorations',
        })
      }
      log({ type: 'stripe_billing', action, workspaceId, seats: assentos })
      return respond({ seats: assentos })
    } catch (erro) {
      if (erro instanceof StripeError) {
        log({ type: 'stripe_billing_error', action, workspaceId, status: erro.status, code: erro.code })
        return respond({ error: 'O Stripe recusou o pedido. Tente de novo em instantes.' }, 502)
      }
      throw erro
    }
  })
}
