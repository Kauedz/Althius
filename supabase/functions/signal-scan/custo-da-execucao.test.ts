import { assertEquals } from 'jsr:@std/assert@1'
import { custoDaExecucaoLida } from './apify.ts'

// Na execução real de 30/09/2026, o custo de um actor que cobra por evento veio 0: o `usageTotalUsd` é só o uso da
// plataforma, e a cobrança do actor está nos eventos (`chargedEventCounts` × preço em `pricingInfo`).

const porEvento = (eventos: Record<string, unknown>) => ({
  pricingModel: 'PAY_PER_EVENT',
  pricingPerEvent: { actorChargeEvents: eventos },
})

Deno.test('custo por evento: soma os eventos cobrados ao uso da plataforma, com o preço da faixa Free quando é por faixa', () => {
  const execucao = {
    usageTotalUsd: 0,
    chargedEventCounts: { 'actor-start': 1, 'short-profile': 3 },
    pricingInfo: porEvento({
      'actor-start': { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.02 }, GOLD: { tieredEventPriceUsd: 0.015 } } },
      'short-profile': { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.003 } } },
    }),
  }
  assertEquals(custoDaExecucaoLida(execucao), 0.029)
})

Deno.test('custo por evento com preço fixo e o uso da plataforma', () => {
  assertEquals(custoDaExecucaoLida({
    usageTotalUsd: 0.001,
    chargedEventCounts: { 'apify-default-dataset-item': 50, 'apify-actor-start': 1 },
    pricingInfo: porEvento({
      'apify-default-dataset-item': { eventPriceUsd: 0.002 },
      'apify-actor-start': { eventPriceUsd: 0.00005 },
    }),
  }), 0.10105)
})

Deno.test('sem eventos vale o uso da plataforma; evento sem preço conhecido deixa o custo em branco', () => {
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0.03 }), 0.03)
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 0.03, chargedEventCounts: {} }), 0.03)
  assertEquals(custoDaExecucaoLida({ usageTotalUsd: 'x' }), null)
  assertEquals(custoDaExecucaoLida({ chargedEventCounts: { novo: 2 }, pricingInfo: porEvento({}) }), null)
  assertEquals(custoDaExecucaoLida(null), null)
})
