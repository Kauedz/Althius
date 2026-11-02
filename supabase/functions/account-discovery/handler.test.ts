import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// O handler inteiro, com um banco falso: os filtros saem só da seção ICP do Playbook (ADR-0034).

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

Deno.test('handler criteria: os filtros saem da seção ICP do Playbook', async () => {
  const { status, corpo } = await pedirFiltros({})
  assertEquals(status, 200)
  assertEquals(corpo.temIcp, true)
  assertEquals(corpo.icpVersion, 4)
  assertEquals(corpo.criteria.setores, ['Seguros'])
})

Deno.test('handler criteria: sem a seção ICP do Playbook, temIcp é falso e os filtros vêm vazios', async () => {
  const { status, corpo } = await pedirFiltros({ lerIcp: () => Promise.resolve(null) })
  assertEquals(status, 200)
  assertEquals(corpo.temIcp, false)
  assertEquals(corpo.icpVersion, null)
  assertEquals(corpo.criteria, { fonte: 'linkedin', setores: [], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] })
})
