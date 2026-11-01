// Fase 7b: o que o agente precisa ler do CRM para inferir o ICP pelos negócios ganhos (decisão 6). Tudo leitura.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { PERFIS } from './perfis.ts'
import { pedidoRest } from './rest.ts'

Deno.test('HubSpot: search_deals filtra por estágio e não escreve', () => {
  const hubspot = PERFIS.hubspot.rest!
  const buscar = hubspot.ferramentas.find((f) => f.nome === 'search_deals')!
  assertEquals(buscar.escreve, false)
  const filtro = [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }]
  const { url, init } = pedidoRest(hubspot, buscar, { filterGroups: filtro, properties: ['amount'], limit: 100, apagar: true }, 'pat-1')
  assertEquals(new URL(url).pathname, '/crm/v3/objects/deals/search')
  assertEquals(init.method, 'POST')
  assertEquals(JSON.parse(init.body as string), { filterGroups: filtro, properties: ['amount'], limit: 100 })
})

Deno.test('HubSpot: get_record pede as associações (a empresa de um negócio)', () => {
  const hubspot = PERFIS.hubspot.rest!
  const ler = hubspot.ferramentas.find((f) => f.nome === 'get_record')!
  const { url } = pedidoRest(hubspot, ler, { objeto: 'deals', id: '42', associations: 'companies' }, 'pat-1')
  assertEquals(new URL(url).searchParams.get('associations'), 'companies')
})

Deno.test('Pipedrive: get_organization lê a organização pelo id e não escreve', () => {
  const pipedrive = PERFIS.pipedrive.rest!
  const ler = pipedrive.ferramentas.find((f) => f.nome === 'get_organization')!
  assertEquals(ler.escreve, false)
  assertEquals(ler.metodo, 'GET')
  const { url } = pedidoRest(pipedrive, ler, { id: 7 }, 'pd-1')
  assertEquals(new URL(url).pathname, '/v1/organizations/7')
  assert(ler.esquema.required?.includes('id'))
})
