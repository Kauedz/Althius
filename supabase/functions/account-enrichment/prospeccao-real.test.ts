import { assertEquals } from 'jsr:@std/assert@1'
import { clienteDoApify, custoDaExecucaoLida } from '../signal-scan/apify.ts'

Deno.test('custo: relê a cobrança tardia usando a conta que executou o actor', async () => {
  let leituras = 0
  const apify = clienteDoApify({ tokens: ['esgotada', 'ativa'], esperaDoCustoMs: 1, log() {},
    fetchFn: async (_url, init) => {
      const token = new Headers(init?.headers).get('Authorization')
      if (init?.method === 'POST') {
        if (token === 'Bearer esgotada') return new Response('', { status: 402 })
        return Response.json([], { headers: { 'x-apify-run-id': 'run-real' } })
      }
      assertEquals(token, 'Bearer ativa')
      leituras++
      return Response.json({ data: { pricingInfo: { pricingModel: 'PAY_PER_EVENT' },
        usageTotalUsd: leituras === 1 ? 0 : 0.04,
        chargedEventCounts: leituras === 1 ? {} : { profile: 1 } } })
    },
  })
  await apify.run({ actorId: 'fake', input: {}, maxItems: 1, maxTotalChargeUsd: 0.1 })
  assertEquals(await apify.custoDaExecucao?.('run-real'), 0.04)
  assertEquals(leituras, 2)
})

import { apifyDoEnriquecimento } from './apify-do-enriquecimento.ts'
import { contatoParaRevelar } from './contato-para-revelar.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.test('enriquecimento espera a cobrança tardia com a configuração de produção', async () => {
  let leituras = 0
  const apify = apifyDoEnriquecimento({ tokens: ['fake'], log() {}, fetchFn: async (_url, init) => {
    if (init?.method === 'POST') return Response.json([], { headers: { 'x-apify-run-id': 'run' } })
    leituras++
    return Response.json({ data: { pricingInfo: { pricingModel: 'PAY_PER_EVENT' }, usageTotalUsd: leituras === 1 ? 0 : 0.04, chargedEventCounts: leituras === 1 ? {} : { profile: 1 } } })
  } })
  await apify.run({ actorId: 'fake', input: {}, maxItems: 1, maxTotalChargeUsd: 0.1 })
  assertEquals(await apify.custoDaExecucao?.('run'), 0.04)
  assertEquals(leituras, 2)
})

Deno.test('revelar lê a empresa pelo vínculo ativo com a sessão e o Workspace do Contato', async () => {
  const cliente = createClient('https://fake.test', 'fake-key', { auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer sessao' }, fetch: async (input, init) => {
      const url = new URL(String(input))
      assertEquals(new Headers(init?.headers).get('Authorization'), 'Bearer sessao')
      assertEquals(url.searchParams.get('workspace_id'), 'eq.ws')
      if (url.pathname.endsWith('/contacts')) return Response.json({ name: 'CFO', linkedin: 'https://www.linkedin.com/in/ACwAA' })
      assertEquals(url.searchParams.get('contact_id'), 'eq.contato')
      assertEquals(url.searchParams.get('ended_at'), 'is.null')
      assertEquals(url.searchParams.get('select'), 'target_accounts(name)')
      return Response.json({ target_accounts: { name: 'TOTVS' } })
    } },
  })
  assertEquals(await contatoParaRevelar(cliente, 'ws', 'contato'), { name: 'CFO', linkedin: 'https://www.linkedin.com/in/ACwAA', companyName: 'TOTVS' })
})

Deno.test('total positivo do Apify é mantido mesmo sem contagem de eventos', () => {
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0.04, pricingInfo: { pricingModel: 'PAY_PER_EVENT' }, chargedEventCounts: {} }), 0.04)
})
