import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, criteriosComIcpEstruturado, type Db, type IcpEstruturadoLido } from './handler.ts'

const estruturado: IcpEstruturadoLido = { version: 7, sector: 'SaaS, Fintech', companySize: 'ME; 51-200', geography: 'São Paulo, PR' }

Deno.test('criteria: ICP estruturado sozinho vira setores, portes e regiões', () => {
  const r = criteriosComIcpEstruturado(null, estruturado)
  assertEquals(r.temIcp, true)
  assertEquals(r.icpVersion, 7)
  assertEquals(r.criteria.setores, ['SaaS', 'Fintech'])
  assertEquals(r.criteria.portes, ['ME', '51-200'])
  assertEquals(r.criteria.regioes, ['São Paulo', 'PR'])
})

Deno.test('criteria: ICP estruturado e Playbook são combinados', () => {
  const r = criteriosComIcpEstruturado({ version: 3, conteudo: { texto: 'Setor: Software\nPalavras-chave: dados\nRegião: RJ' } }, estruturado)
  assertEquals(r.criteria.setores, ['Software', 'SaaS', 'Fintech'])
  assertEquals(r.criteria.palavrasChave, ['dados'])
  assertEquals(r.criteria.regioes, ['RJ', 'São Paulo', 'PR'])
  assertEquals(r.icpVersion, 3)
})

Deno.test('criteria: falha na leitura estruturada permite usar o Playbook', () => {
  const r = criteriosComIcpEstruturado({ version: 3, conteudo: { texto: 'Setor: Software' } }, null)
  assertEquals(r.temIcp, true)
  assertEquals(r.criteria.setores, ['Software'])
})

Deno.test('criteria: sem Playbook e sem ICP estruturado informa temIcp falso', () => {
  const r = criteriosComIcpEstruturado(null, null)
  assertEquals(r, { temIcp: false, icpVersion: null, criteria: { fonte: 'linkedin', setores: [], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] } })
})

Deno.test('criteria: Porte estruturado com várias faixas mantém cada faixa inteira', () => {
  const r = criteriosComIcpEstruturado(null, { version: 2, sector: 'Logística', companySize: '1-10, 11-50, EPP', geography: 'Brasil' })
  assertEquals([...r.criteria.portes].sort(), ['1-10', '11-50', 'EPP'])
  assertEquals(r.criteria.setores, ['Logística'])
})

// O handler inteiro, com um banco falso: a falha na leitura do ICP estruturado não derruba a etapa de filtros.

function handlerCom(db: Partial<Db>) {
  const base: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1' }),
    lerIcp: () => Promise.resolve({ version: 4, conteudo: { texto: 'Setor: Seguros' } }),
    actoresDeBusca: () => Promise.resolve([]),
    iniciar: () => Promise.reject(new Error('não deve iniciar')),
    lerProposta: () => Promise.resolve(null),
    gravarCandidatas: () => Promise.resolve({ added: 0, duplicates: 0, ignored: 0 }),
    gravarCusto: () => Promise.resolve(),
    encerrar: () => Promise.resolve(),
    ...db,
  } as Db
  return createHandler({ db: base, apify: {} as never, appOrigin: 'https://app.test', waitUntil: () => {} } as never)
}

async function pedirFiltros(db: Partial<Db>) {
  const req = new Request('https://fn.test/account-discovery', {
    method: 'POST',
    headers: { Authorization: 'Bearer token-falso', apikey: 'chave-falsa', 'Content-Type': 'application/json', Origin: 'https://app.test' },
    body: JSON.stringify({ action: 'criteria', workspaceId: '00000000-0000-4000-8000-000000000001' }),
  })
  const res = await handlerCom(db)(req)
  return { status: res.status, corpo: await res.json() }
}

Deno.test('handler criteria: ICP estruturado entra nos filtros', async () => {
  const { status, corpo } = await pedirFiltros({
    lerIcpEstruturado: () => Promise.resolve({ version: 9, sector: 'Logística', companySize: '11-50', geography: 'SP' }),
  })
  assertEquals(status, 200)
  assertEquals(corpo.temIcp, true)
  assertEquals(corpo.criteria.setores, ['Seguros', 'Logística'])
  assertEquals(corpo.criteria.portes, ['11-50'])
})

Deno.test('handler criteria: falha no ICP estruturado volta ao Playbook, sem erro', async () => {
  const { status, corpo } = await pedirFiltros({ lerIcpEstruturado: () => Promise.reject(new Error('rede')) })
  assertEquals(status, 200)
  assertEquals(corpo.criteria.setores, ['Seguros'])
})
