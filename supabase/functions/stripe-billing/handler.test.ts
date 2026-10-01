import { assertEquals } from 'jsr:@std/assert@1'
import { StripeError, type Stripe } from '../_shared/stripe.ts'
import { type ContextoDaCobranca, createHandler, type Db } from './handler.ts'

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

function montar(contexto: ContextoDaCobranca | null, opcoes: { falhaDoStripe?: boolean; quantidadeAtual?: number } = {}) {
  const c = { chamadas: [] as [string, string, Record<string, unknown> | undefined][], clientes: [] as string[] }
  const stripe: Stripe = {
    post(caminho, corpo) {
      c.chamadas.push(['POST', caminho, corpo])
      if (opcoes.falhaDoStripe) return Promise.reject(new StripeError(402, 'card_declined'))
      if (caminho === 'customers') return Promise.resolve({ id: 'cus_novo' })
      return Promise.resolve({ url: `https://stripe.test/${caminho}` })
    },
    get(caminho) {
      c.chamadas.push(['GET', caminho, undefined])
      return Promise.resolve({ items: { data: [{ id: 'si_1', quantity: opcoes.quantidadeAtual ?? 1 }] } })
    },
  }
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    billingContext: () => Promise.resolve(contexto),
    recordCustomer: (_ws, customer) => (c.clientes.push(customer), Promise.resolve()),
  }
  const handler = createHandler({ db, stripe, priceId: 'price_assento', appOrigin: 'https://app.althius.test', log: () => {} })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/stripe-billing', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir }
}

const NOVO: ContextoDaCobranca = { workspaceName: 'Norte', stripeCustomerId: null, stripeSubscriptionId: null, usedSeats: 3 }

Deno.test('quem não é Administrador do Workspace não abre a cobrança e o Stripe nem é chamado', async () => {
  const { c, pedir } = montar(null)
  assertEquals((await pedir({ action: 'checkout', workspaceId: WS })).status, 403)
  assertEquals(c.chamadas, [])
})

Deno.test('o checkout cria o cliente uma vez e assina com um assento por Participante ativo', async () => {
  const { c, pedir } = montar(NOVO)
  const resposta = await pedir({ action: 'checkout', workspaceId: WS })
  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { url: 'https://stripe.test/checkout/sessions' })
  assertEquals(c.clientes, ['cus_novo'])
  const [, caminho, corpo] = c.chamadas[1]
  assertEquals(caminho, 'checkout/sessions')
  assertEquals(corpo?.mode, 'subscription')
  assertEquals(corpo?.customer, 'cus_novo')
  assertEquals(corpo?.line_items, [{ price: 'price_assento', quantity: 3 }])
  assertEquals(corpo?.success_url, 'https://app.althius.test/?assinatura=ok')
})

Deno.test('com assinatura, o checkout é recusado e o portal abre', async () => {
  const { pedir } = montar({ ...NOVO, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
  assertEquals((await pedir({ action: 'checkout', workspaceId: WS })).status, 409)
  assertEquals(await (await pedir({ action: 'portal', workspaceId: WS })).json(), { url: 'https://stripe.test/billing_portal/sessions' })
})

Deno.test('ajustar os assentos muda a quantidade com cobrança proporcional, e não chama o Stripe sem mudança', async () => {
  const comAssinatura = { ...NOVO, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' }
  const { c, pedir } = montar(comAssinatura, { quantidadeAtual: 2 })
  assertEquals(await (await pedir({ action: 'seats', workspaceId: WS })).json(), { seats: 3 })
  assertEquals(c.chamadas[1], ['POST', 'subscription_items/si_1', { quantity: 3, proration_behavior: 'create_prorations' }])
  const igual = montar(comAssinatura, { quantidadeAtual: 3 })
  await igual.pedir({ action: 'seats', workspaceId: WS })
  assertEquals(igual.c.chamadas.length, 1)
})

Deno.test('a recusa do Stripe vira um aviso, sem detalhe do Stripe para o navegador', async () => {
  const { pedir } = montar(NOVO, { falhaDoStripe: true })
  const resposta = await pedir({ action: 'checkout', workspaceId: WS })
  assertEquals(resposta.status, 502)
  assertEquals(await resposta.json(), { error: 'O Stripe recusou o pedido. Tente de novo em instantes.' })
})
