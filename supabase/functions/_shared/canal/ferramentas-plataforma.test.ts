import { assertEquals } from 'jsr:@std/assert@1'
import { classificarFerramentaWhatsApp, CATALOGO_FERRAMENTAS_WHATSAPP } from './ferramentas-plataforma.ts'

Deno.test('catálogo inicial descreve as leituras com RPC, papéis e risco definidos pelo código', () => {
  const saldo = CATALOGO_FERRAMENTAS_WHATSAPP.find((f) => f.nome === 'consultar_saldo_de_creditos')
  assertEquals(saldo, {
    nome: 'consultar_saldo_de_creditos',
    rpc: 'get_credit_balance',
    papeis: ['administrador', 'membro'],
    risco: 'leitura',
    area: 'creditos',
  })
  assertEquals(CATALOGO_FERRAMENTAS_WHATSAPP.every((f) => f.risco === 'leitura'), true)
})

Deno.test('relatório de custo pertence ao catálogo de Créditos e não a uma área de relatórios', () => {
  const relatorios = CATALOGO_FERRAMENTAS_WHATSAPP.filter((f) =>
    ['get_cost_report', 'send_outcome_rates', 'send_outcome_rates_by_approach'].includes(f.rpc)
  )
  assertEquals(relatorios.length, 3)
  assertEquals(relatorios.every((relatorio) => relatorio.area === 'creditos'), true)
  assertEquals(String(CATALOGO_FERRAMENTAS_WHATSAPP.map((f) => f.area)).includes('relatorios'), false)
})

Deno.test('o risco devolvido é o do descritor, sem aceitar classificação enviada pelo modelo', () => {
  assertEquals(classificarFerramentaWhatsApp('apagar_conta', { risco: 'leitura' }), null)
  assertEquals(classificarFerramentaWhatsApp('consultar_saldo_de_creditos', { risco: 'irreversivel' })?.risco, 'leitura')
  assertEquals(
    classificarFerramentaWhatsApp('consultar_saldo_de_creditos', { risco: 'irreversivel' }, 'membro')?.papeis,
    ['administrador', 'membro'],
  )
})
