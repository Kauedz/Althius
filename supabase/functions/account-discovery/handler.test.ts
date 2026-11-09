import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// O handler inteiro, com um banco falso. Os filtros do Mercado saem do Contexto da empresa (ação `prepare`, ADR-0035):
// a ação antiga, que lia a seção ICP do Playbook, foi retirada (contexto-da-empresa 07).

function handlerCom(db: Partial<Db>) {
  const base: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1' }),
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

Deno.test('handler criteria: a ação que lia o ICP do Playbook foi retirada e não lê nada', async () => {
  const { status, corpo } = await pedirFiltros({
    lerContexto: () => Promise.reject(new Error('não deve ler nada')),
  })
  assertEquals(status, 400)
  assertEquals(corpo.error, 'Ação desconhecida.')
})
