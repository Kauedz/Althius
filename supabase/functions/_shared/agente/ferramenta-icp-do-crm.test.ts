import { assert, assertEquals } from 'jsr:@std/assert@1'
import { ferramentaIcpDoCrm, MAXIMO_DE_GANHOS } from './ferramenta-icp-do-crm.ts'
import type { ServicosDoAgente } from './ferramentas.ts'
import type { ContextoDaFerramenta } from './registro.ts'

const ctx: ContextoDaFerramenta = {
  workspaceId: '11111111-1111-4111-8111-111111111111', userId: 'u', passoId: '22222222-2222-4222-8222-222222222222',
  authorization: 'Bearer x', apikey: 'k',
}

type Chamada = { integrationId: string; ferramenta: string; argumentos: Record<string, unknown> }
const NAO_HABILITADA = () => Promise.reject(new Error('Esta Integração não está habilitada neste Workspace.'))
const ok = (estruturado: unknown) => Promise.resolve({ conteudo: [], estruturado, erro: false })

const ICP_SALVO = { version: 3, sector: 'Varejo', companySize: '11-50', geography: 'SP' }

function servicos(crm: (c: Chamada) => Promise<Record<string, unknown>>) {
  const chamadas: Chamada[] = []
  const rpcs: string[] = []
  const s: ServicosDoAgente = {
    rpc: (_c, nome) => { rpcs.push(nome); return Promise.resolve(nome === 'get_my_workspace_icp' ? ICP_SALVO : null) },
    funcao: (_c, nome, corpo) => {
      assertEquals(nome, 'integration-tools')
      assertEquals(corpo.action, 'chamar')
      assertEquals(corpo.workspaceId, ctx.workspaceId)
      const c = corpo as unknown as Chamada
      chamadas.push({ integrationId: c.integrationId, ferramenta: c.ferramenta, argumentos: c.argumentos })
      return crm(c)
    },
    lerConta: () => Promise.resolve(null),
  }
  return { s, chamadas, rpcs }
}

const hubspot = (c: Chamada) => {
  if (c.integrationId !== 'hubspot') return NAO_HABILITADA()
  if (c.ferramenta === 'search_deals') {
    return ok({ results: [
      { id: 'd1', properties: { amount: '50000', createdate: '2026-01-01T00:00:00Z', closedate: '2026-01-21T00:00:00Z' } },
      { id: 'd2', properties: { amount: '40000', createdate: '2026-02-01T00:00:00Z', closedate: '2026-02-15T00:00:00Z' } },
      { id: 'd3', properties: { amount: '1000' } },
    ] })
  }
  if (c.ferramenta === 'get_record' && c.argumentos.objeto === 'deals') {
    return ok(c.argumentos.id === 'd3' ? { id: 'd3' } : { id: c.argumentos.id, associations: { companies: { results: [{ id: `c-${c.argumentos.id}` }] } } })
  }
  if (c.ferramenta === 'get_record' && c.argumentos.objeto === 'companies') {
    return ok({ properties: { industry: 'LOGISTICS_AND_SUPPLY_CHAIN', numberofemployees: '120', state: 'PR' } })
  }
  return Promise.reject(new Error('inesperado'))
}

Deno.test('ler_icp_do_crm é livre, de graça e só lê', async () => {
  const f = ferramentaIcpDoCrm(servicos(hubspot).s)
  assertEquals(f.nome, 'ler_icp_do_crm')
  assertEquals(f.aprovacao, 'livre')
  assertEquals(await f.cotar(ctx, {}), 0)
})

Deno.test('HubSpot: lê os ganhos, a empresa de cada um e propõe o ICP com as divergências do salvo', async () => {
  const { s, chamadas } = servicos(hubspot)
  const r = await ferramentaIcpDoCrm(s).executar(ctx, {})
  const busca = chamadas.find((c) => c.ferramenta === 'search_deals')!
  assertEquals(busca.argumentos.filterGroups, [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }])
  assertEquals(busca.argumentos.limit, MAXIMO_DE_GANHOS)
  assertEquals(chamadas.find((c) => c.argumentos.objeto === 'deals')!.argumentos.associations, 'companies')
  assert(chamadas.every((c) => ['search_deals', 'get_record', 'list_deals'].includes(c.ferramenta)), 'só leituras')
  assertEquals(r.custo, 0)
  const cartao = r.cartoes[0]
  assertEquals(cartao.tipo, 'icp_proposto')
  assertEquals(cartao.origem, 'crm')
  assertEquals(cartao.crms, ['HubSpot'])
  assertEquals(cartao.negocios, 3)
  assertEquals(cartao.setor, 'Logistics and supply chain')
  assertEquals(cartao.porte, '51-200')
  assertEquals(cartao.geografia, 'PR')
  assertEquals(cartao.divergencias, [
    { campo: 'setor', doCrm: 'Logistics and supply chain', doSite: 'Varejo', sugerido: 'crm' },
    { campo: 'porte', doCrm: '51-200', doSite: '11-50', sugerido: 'crm' },
    { campo: 'regiao', doCrm: 'PR', doSite: 'SP', sugerido: 'crm' },
  ])
  assert(r.resumo.includes('3 negócios ganhos'))
  assert(r.resumo.includes('salvar_icp'))
})

Deno.test('Pipedrive: ganhos e região da organização', async () => {
  const { s, chamadas } = servicos((c) => {
    if (c.integrationId !== 'pipedrive') return NAO_HABILITADA()
    if (c.ferramenta === 'list_deals') {
      return ok({ data: [
        { id: 1, value: 3000, add_time: '2026-03-01 10:00:00', won_time: '2026-03-11 10:00:00', org_id: { value: 7, name: 'A' } },
        { id: 2, value: 2000, org_id: 8 },
        { id: 3, value: 1000, org_id: null },
      ] })
    }
    if (c.ferramenta === 'get_organization') return ok({ data: { address_admin_area_level_1: 'Paraná' } })
    return Promise.reject(new Error('inesperado'))
  })
  const r = await ferramentaIcpDoCrm(s).executar(ctx, {})
  assertEquals(chamadas.find((c) => c.ferramenta === 'list_deals')!.argumentos, { status: 'won', limit: MAXIMO_DE_GANHOS })
  assertEquals(chamadas.filter((c) => c.ferramenta === 'get_organization').map((c) => c.argumentos.id), [7, 8])
  assertEquals(r.cartoes[0].crms, ['Pipedrive'])
  assertEquals(r.cartoes[0].geografia, 'Paraná')
  assertEquals(r.cartoes[0].setor, null)
})

Deno.test('sem CRM conectado avisa e não inventa ICP', async () => {
  const { s, rpcs } = servicos(NAO_HABILITADA)
  const r = await ferramentaIcpDoCrm(s).executar(ctx, {})
  assertEquals(r.cartoes[0].tipo, 'aviso')
  assert(String(r.cartoes[0].texto).includes('HubSpot ou Pipedrive'))
  assertEquals(rpcs, [])
})

Deno.test('CRM conectado sem nenhum ganho avisa', async () => {
  const { s } = servicos((c) => (c.integrationId === 'hubspot' ? ok({ results: [] }) : NAO_HABILITADA()))
  const r = await ferramentaIcpDoCrm(s).executar(ctx, {})
  assertEquals(r.cartoes[0].tipo, 'aviso')
  assert(String(r.cartoes[0].texto).includes('nenhum negócio ganho'))
})

Deno.test('a empresa que falha não derruba a leitura', async () => {
  const { s } = servicos((c) => (c.ferramenta === 'get_record' && c.argumentos.objeto === 'companies' ? Promise.reject(new Error('x')) : hubspot(c)))
  const r = await ferramentaIcpDoCrm(s).executar(ctx, {})
  assertEquals(r.cartoes[0].tipo, 'icp_proposto')
  assertEquals(r.cartoes[0].setor, null)
})
