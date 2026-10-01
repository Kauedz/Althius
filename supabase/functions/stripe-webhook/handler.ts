// Os avisos do Stripe sobre a assinatura do Workspace (creditos-e-planos 05 e 06). O Stripe chama sem JWT; a função
// confere o cabeçalho Stripe-Signature com o segredo do webhook antes de ler qualquer coisa. Tratar o mesmo evento de
// novo não muda nada (o Stripe reenvia): a assinatura ignora evento mais velho que o último aplicado e a cota entra uma
// vez por fatura; o evento fica registrado depois de tratado (claim_stripe_event). O que muda:
//   customer.subscription.created/updated/deleted  o estado, os assentos e o fim do período (apply_stripe_subscription);
//   invoice.paid (criação ou renovação)            a cota de créditos dos assentos entra no saldo (grant_seat_credits);
//   invoice.payment_failed                          fica registrado (o estado atrasado chega pela assinatura).
// A fatura de um ajuste de assentos (proporcional) não traz cota: só a criação e a renovação. Banco entra por injeção de
// dependência, para o teste ir da requisição à resposta sem rede.
import { assinaturaDoStripeValida } from '../_shared/stripe.ts'

export interface AssinaturaDoStripe {
  workspaceId: string
  customerId: string | null
  subscriptionId: string
  status: string
  seats: number | null
  periodEnd: string | null
  /** Quando o Stripe criou o evento: um mais velho que o último aplicado não muda nada. */
  eventAt: string | null
}

export interface Db {
  claimEvent(eventId: string, type: string): Promise<boolean>
  workspaceByCustomer(customerId: string): Promise<string | null>
  applySubscription(assinatura: AssinaturaDoStripe): Promise<void>
  grantSeatCredits(invoiceId: string, workspaceId: string, seats: number | null): Promise<number>
}

export interface Deps {
  db: Db
  webhookSecret: string
  agora?: () => number
  log?: (fields: Record<string, unknown>) => void
}

type Objeto = Record<string, unknown>

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor ? valor : null
}

/** O fim do período: na assinatura (versões antigas da API) ou no primeiro item (versões novas). */
function fimDoPeriodo(assinatura: Objeto, item: Objeto | undefined): string | null {
  const segundos = Number(assinatura.current_period_end ?? item?.current_period_end)
  return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : null
}

const RENOVACOES = new Set(['subscription_create', 'subscription_cycle'])

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const agora = deps.agora ?? (() => Math.floor(Date.now() / 1000))
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  async function workspaceDo(objeto: Objeto): Promise<string | null> {
    const metadata = (objeto.metadata ?? {}) as Objeto
    const doMetadata = texto(metadata.workspace_id)
    if (doMetadata) return doMetadata
    const customer = texto(objeto.customer)
    return customer ? await deps.db.workspaceByCustomer(customer) : null
  }

  return async (req) => {
    if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405)
    const corpo = await req.text()
    if (!(await assinaturaDoStripeValida(corpo, req.headers.get('Stripe-Signature'), deps.webhookSecret, agora()))) {
      return respond({ error: 'invalid signature' }, 400)
    }
    let evento: Objeto
    try {
      evento = JSON.parse(corpo)
    } catch {
      return respond({ error: 'invalid body' }, 400)
    }
    const id = texto(evento.id)
    const tipo = texto(evento.type)
    const objeto = ((evento.data as Objeto | undefined)?.object ?? {}) as Objeto
    if (!id || !tipo) return respond({ error: 'invalid event' }, 400)

    const tratado = tipo.startsWith('customer.subscription.') || tipo === 'invoice.paid' || tipo === 'invoice.payment_failed'
    if (!tratado) return respond({ received: true, ignored: true })
    const criadoEm = Number(evento.created)

    const workspaceId = await workspaceDo(objeto)
    if (!workspaceId) {
      log({ type: 'stripe_webhook_sem_workspace', event: tipo, eventId: id })
      return respond({ received: true, ignored: true })
    }

    if (tipo.startsWith('customer.subscription.')) {
      const item = ((objeto.items as { data?: Objeto[] } | undefined)?.data ?? [])[0]
      const quantidade = Number(item?.quantity)
      await deps.db.applySubscription({
        workspaceId,
        customerId: texto(objeto.customer),
        subscriptionId: String(objeto.id),
        status: tipo === 'customer.subscription.deleted' ? 'canceled' : String(objeto.status ?? ''),
        seats: Number.isFinite(quantidade) ? quantidade : null,
        periodEnd: fimDoPeriodo(objeto, item),
        eventAt: Number.isFinite(criadoEm) && criadoEm > 0 ? new Date(criadoEm * 1000).toISOString() : null,
      })
      await deps.db.claimEvent(id, tipo)
      log({ type: 'stripe_webhook', event: tipo, workspaceId, status: objeto.status })
      return respond({ received: true })
    }

    if (tipo === 'invoice.payment_failed') {
      await deps.db.claimEvent(id, tipo)
      log({ type: 'stripe_webhook', event: tipo, workspaceId, invoice: objeto.id, attempt: objeto.attempt_count })
      return respond({ received: true })
    }

    // invoice.paid: só a criação e a renovação trazem a cota; um ajuste proporcional de assentos, não.
    if (!RENOVACOES.has(String(objeto.billing_reason ?? ''))) return respond({ received: true, ignored: true })
    const creditos = await deps.db.grantSeatCredits(String(objeto.id), workspaceId, null)
    await deps.db.claimEvent(id, tipo)
    log({ type: 'stripe_webhook', event: tipo, workspaceId, credits: creditos })
    return respond({ received: true, credits: creditos })
  }
}
