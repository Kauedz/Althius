import { assert, assertEquals } from 'jsr:@std/assert@1'
import { PERFIS } from './perfis.ts'
import { pedidoRest } from './rest.ts'

// As ferramentas de escrita que o Envio ao CRM (kanban-de-prospeccao 05) usa: todas escrevem (pedem decisão de quem
// pode), e o corpo vai como cada API espera.

function pedido(integracao: string, nome: string, argumentos: Record<string, unknown>) {
  const rest = PERFIS[integracao].rest!
  const ferramenta = rest.ferramentas.find((f) => f.nome === nome)
  assert(ferramenta, `${integracao} sem ${nome}`)
  assert(ferramenta.escreve, `${integracao}.${nome} escreve`)
  const { url, init } = pedidoRest(rest, ferramenta, argumentos, 'chave-123456')
  return { url: new URL(url), metodo: init.method, corpo: JSON.parse(init.body as string) }
}

Deno.test('HubSpot: o Contact pode nascer associado à Company, e a nota leva corpo, data e associações', () => {
  const associacoes = [{ to: { id: '10' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 279 }] }]
  const contato = pedido('hubspot', 'create_contact', { properties: { email: 'm@x.test' }, associations: associacoes })
  assertEquals(contato.url.pathname, '/crm/v3/objects/contacts')
  assertEquals(contato.corpo, { properties: { email: 'm@x.test' }, associations: associacoes })

  const nota = pedido('hubspot', 'create_note', {
    properties: { hs_note_body: 'Sinais', hs_timestamp: '2026-10-01T12:00:00Z' },
    associations: associacoes,
  })
  assertEquals([nota.metodo, nota.url.pathname], ['POST', '/crm/v3/objects/notes'])
  assertEquals(nota.corpo.properties, { hs_note_body: 'Sinais', hs_timestamp: '2026-10-01T12:00:00Z' })
  assertEquals(nota.corpo.associations, associacoes)
})

Deno.test('Pipedrive: cria a organização pelo nome', () => {
  const org = pedido('pipedrive', 'add_organization', { name: 'Alfa' })
  assertEquals([org.metodo, org.url.pathname], ['POST', '/v1/organizations'])
  assertEquals(org.url.searchParams.get('api_token'), 'chave-123456')
  assertEquals(org.corpo, { name: 'Alfa' })
})

Deno.test('RD Station CRM: empresa e contato vão dentro dos envelopes organization e contact', () => {
  const org = pedido('rd-station', 'create_organization', { name: 'Alfa' })
  assertEquals([org.metodo, org.url.pathname], ['POST', '/api/v1/organizations'])
  assertEquals(org.corpo, { organization: { name: 'Alfa' } })

  const contato = pedido('rd-station', 'create_contact', {
    name: 'Maria',
    title: 'Diretora',
    emails: [{ email: 'm@x.test' }],
    phones: [{ phone: '+55' }],
    organization_id: 'org-1',
  })
  assertEquals(contato.url.pathname, '/api/v1/contacts')
  assertEquals(contato.corpo, {
    contact: { name: 'Maria', title: 'Diretora', emails: [{ email: 'm@x.test' }], phones: [{ phone: '+55' }], organization_id: 'org-1' },
  })
  assert(PERFIS['rd-station'].naoConfirmado.some((p) => p.includes('envelope')))
})
