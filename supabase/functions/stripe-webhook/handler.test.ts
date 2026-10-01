import { assertEquals } from 'jsr:@std/assert@1'
import { type AssinaturaDoStripe, createHandler, type Db } from './handler.ts'

const SEGREDO = 'whsec_teste'
const AGORA = 1_790_000_000

async function assinar(corpo: string, t = AGORA, segredo = SEGREDO) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${t}.${corpo}`))
  return `t=${t},v1=${[...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

function montar() {
  const c = { aplicadas: [] as AssinaturaDoStripe[], cotas: [] as [string, string, number | null][], eventos: [] as string[] }
  const db: Db = {
    claimEvent: (id) => (c.eventos.push(id), Promise.resolve(true)),
    workspaceByCustomer: (customer) => Promise.resolve(customer === 'cus_norte' ? 'ws-norte' : null),
    applySubscription: (a) => (c.aplicadas.push(a), Promise.resolve()),
    grantSeatCredits: (invoice, ws, seats) => (c.cotas.push([invoice, ws, seats]), Promise.resolve(200)),
  }
  const handler = createHandler({ db, webhookSecret: SEGREDO, agora: () => AGORA, log: () => {} })
  async function enviar(evento: unknown, cabecalho?: string) {
    const corpo = JSON.stringify(evento)
    return handler(new Request('https://x/stripe-webhook', {
      method: 'POST',
      body: corpo,
      headers: { 'Stripe-Signature': cabecalho ?? (await assinar(corpo)) },
    }))
  }
  return { c, enviar }
}

const assinatura = (tipo: string, extra: Record<string, unknown> = {}) => ({
  id: `evt_${tipo}`, type: tipo, created: AGORA - 10,
  data: { object: { id: 'sub_1', customer: 'cus_norte', status: 'active', items: { data: [{ id: 'si_1', quantity: 3, current_period_end: AGORA + 86400 }] }, ...extra } },
})

Deno.test('sem a assinatura do Stripe certa, nada é lido nem gravado', async () => {
  const { c, enviar } = montar()
  assertEquals((await enviar(assinatura('customer.subscription.updated'), 't=1,v1=errada')).status, 400)
  const corpo = JSON.stringify(assinatura('customer.subscription.updated'))
  assertEquals((await enviar(assinatura('customer.subscription.updated'), await assinar(corpo, AGORA - 3600))).status, 400)
  assertEquals((await enviar(assinatura('customer.subscription.updated'), await assinar(corpo, AGORA, 'outro'))).status, 400)
  assertEquals(c.aplicadas, [])
})

Deno.test('a assinatura criada ou atualizada grava estado, assentos, fim do período e a hora do evento', async () => {
  const { c, enviar } = montar()
  assertEquals((await enviar(assinatura('customer.subscription.updated'))).status, 200)
  assertEquals(c.aplicadas, [{
    workspaceId: 'ws-norte', customerId: 'cus_norte', subscriptionId: 'sub_1', status: 'active', seats: 3,
    periodEnd: new Date((AGORA + 86400) * 1000).toISOString(), eventAt: new Date((AGORA - 10) * 1000).toISOString(),
  }])
  assertEquals(c.eventos, ['evt_customer.subscription.updated'])
})

Deno.test('a assinatura apagada vira cancelada; o workspace do metadata vale antes do cliente', async () => {
  const { c, enviar } = montar()
  await enviar(assinatura('customer.subscription.deleted', { metadata: { workspace_id: 'ws-do-metadata' } }))
  assertEquals([c.aplicadas[0].workspaceId, c.aplicadas[0].status], ['ws-do-metadata', 'canceled'])
})

Deno.test('a fatura paga da criação ou da renovação traz a cota; a do ajuste proporcional, não', async () => {
  const { c, enviar } = montar()
  const fatura = (motivo: string) => ({ id: `evt_${motivo}`, type: 'invoice.paid', created: AGORA, data: { object: { id: `in_${motivo}`, customer: 'cus_norte', billing_reason: motivo } } })
  await enviar(fatura('subscription_create'))
  await enviar(fatura('subscription_cycle'))
  await enviar(fatura('subscription_update'))
  assertEquals(c.cotas, [['in_subscription_create', 'ws-norte', null], ['in_subscription_cycle', 'ws-norte', null]])
})

Deno.test('eventos que a cobrança não usa, ou de um cliente sem Workspace, são aceitos e ignorados', async () => {
  const { c, enviar } = montar()
  assertEquals(await (await enviar({ id: 'evt_x', type: 'charge.succeeded', data: { object: {} } })).json(), { received: true, ignored: true })
  assertEquals(await (await enviar(assinatura('customer.subscription.updated', { customer: 'cus_outro' }))).json(), { received: true, ignored: true })
  assertEquals(c.aplicadas, [])
})

Deno.test('a fatura que falhou fica registrada e não lança crédito nem muda o estado', async () => {
  const { c, enviar } = montar()
  const resposta = await enviar({ id: 'evt_falhou', type: 'invoice.payment_failed', created: AGORA, data: { object: { id: 'in_1', customer: 'cus_norte', attempt_count: 1 } } })
  assertEquals(await resposta.json(), { received: true })
  assertEquals(c.eventos, ['evt_falhou'])
  assertEquals([c.aplicadas, c.cotas], [[], []])
})
