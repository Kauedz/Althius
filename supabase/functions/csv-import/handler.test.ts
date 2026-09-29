import { assertEquals } from 'jsr:@std/assert@1'
import { type AberturaDoLote, createHandler, type Db, type Store } from './handler.ts'
import type { CsvLido, Registro } from './csv.ts'

const WORKSPACE = '71000000-0000-0000-0000-000000000001'
const LOTE = '72000000-0000-0000-0000-000000000001'
const CAMINHO = `${WORKSPACE}/${LOTE}/arquivo.csv`

function fakeDb(
  { user = true, abertura = { kind: 'created', batchId: LOTE, storagePath: CAMINHO } as AberturaDoLote | Error } = {},
) {
  const aberturas: Parameters<Db['createBatch']>[0][] = []
  const linhas: Registro[] = []
  const lidos: CsvLido[] = []
  const falhas: string[] = []
  const db: Db = {
    userFromJwt: (authorization) =>
      Promise.resolve(user && authorization === 'Bearer jwt-da-beto' ? { userId: 'beto' } : null),
    createBatch: (args) => {
      aberturas.push(args)
      return abertura instanceof Error ? Promise.reject(abertura) : Promise.resolve(abertura)
    },
    stageRows: (_lote, rows) => {
      linhas.push(...rows)
      return Promise.resolve()
    },
    finishUpload: (_lote, lido) => {
      lidos.push(lido)
      return Promise.resolve()
    },
    failUpload: (_lote, code) => {
      falhas.push(code)
      return Promise.resolve()
    },
  }
  return { db, aberturas, linhas, lidos, falhas }
}

function fakeStore(falha?: Error) {
  const gravados: { path: string; bytes: Uint8Array }[] = []
  const store: Store = {
    upload: (path, bytes) => {
      gravados.push({ path, bytes })
      return falha ? Promise.reject(falha) : Promise.resolve()
    },
  }
  return { store, gravados }
}

function pedido(corpo: { workspaceId?: string; arquivo?: BlobPart; nome?: string } = {}, { jwt = 'jwt-da-beto' } = {}) {
  const form = new FormData()
  if (corpo.workspaceId !== undefined || !('workspaceId' in corpo)) {
    form.append('workspaceId', corpo.workspaceId ?? WORKSPACE)
  }
  if (corpo.arquivo !== undefined) {
    form.append('file', new File([corpo.arquivo], corpo.nome ?? 'contas.csv', { type: 'text/csv' }))
  }
  return new Request('https://fn.test/csv-import', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: 'anon', Origin: 'https://app.althius.com.br' },
    body: form,
  })
}

const DEPS = { appOrigin: 'https://app.althius.com.br', log: () => {} }
const CSV = 'Empresa;Site;Contato\nAlfa;alfa.com.br;Maria\nBeta;beta.com.br;\n'

Deno.test('abre o lote com a sessão de quem pede, guarda o arquivo no bucket e entrega os registros ao banco', async () => {
  const { db, aberturas, linhas, lidos } = fakeDb()
  const { store, gravados } = fakeStore()
  const resposta = await createHandler({ ...DEPS, db, store })(pedido({ arquivo: CSV, nome: 'C:\\pasta\\contas.csv' }))

  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { batchId: LOTE })
  assertEquals(aberturas, [{
    workspaceId: WORKSPACE,
    fileName: 'contas.csv',
    fileSize: new TextEncoder().encode(CSV).length,
    authorization: 'Bearer jwt-da-beto',
    apikey: 'anon',
  }])
  assertEquals(gravados.map((g) => g.path), [CAMINHO])
  assertEquals(new TextDecoder().decode(gravados[0].bytes), CSV)
  assertEquals(linhas.map((l) => l.line), [1, 2, 3])
  assertEquals(lidos[0].delimiter, ';')
  assertEquals(lidos[0].mapping, { contact_name: 2, company_url: 1, company_name: 0 })
})

Deno.test('entrega os registros ao banco em blocos de 500', async () => {
  const dados = Array.from({ length: 1200 }, (_, i) => `E${i};e${i}.com.br`).join('\n')
  const chamadas: number[] = []
  const { db } = fakeDb()
  db.stageRows = (_lote, rows) => {
    chamadas.push(rows.length)
    return Promise.resolve()
  }
  const resposta = await createHandler({ ...DEPS, db, store: fakeStore().store })(
    pedido({ arquivo: `Empresa;Site\n${dados}` }),
  )
  assertEquals(resposta.status, 200)
  assertEquals(chamadas, [500, 500, 201])
})

Deno.test('sem sessão válida, nada é aberto nem guardado', async () => {
  const { db, aberturas } = fakeDb({ user: false })
  const { store, gravados } = fakeStore()
  const resposta = await createHandler({ ...DEPS, db, store })(pedido({ arquivo: CSV }))
  assertEquals(resposta.status, 401)
  assertEquals(aberturas, [])
  assertEquals(gravados, [])
})

Deno.test('quem não participa do Workspace é recusado antes de guardar o arquivo', async () => {
  const { db } = fakeDb({ abertura: { kind: 'forbidden' } })
  const { store, gravados } = fakeStore()
  const resposta = await createHandler({ ...DEPS, db, store })(pedido({ arquivo: CSV }))
  assertEquals(resposta.status, 403)
  assertEquals(gravados, [])
})

Deno.test('recusa pedido sem Workspace, sem arquivo, com arquivo vazio ou grande demais', async () => {
  const { db, aberturas } = fakeDb()
  const handler = createHandler({ ...DEPS, db, store: fakeStore().store })
  assertEquals((await handler(pedido({ workspaceId: 'x', arquivo: CSV }))).status, 400)
  assertEquals((await handler(pedido({}))).status, 400)
  assertEquals((await handler(pedido({ arquivo: '' }))).status, 400)
  assertEquals((await handler(pedido({ arquivo: new Uint8Array(5 * 1024 * 1024 + 1) }))).status, 413)
  assertEquals(aberturas, [])
})

Deno.test('só aceita POST', async () => {
  const resposta = await createHandler({ ...DEPS, db: fakeDb().db, store: fakeStore().store })(
    new Request('https://fn.test/csv-import', { method: 'GET' }),
  )
  assertEquals(resposta.status, 405)
})

Deno.test('o arquivo ilegível falha o lote com o motivo, sem registros no banco', async () => {
  const { db, linhas, falhas } = fakeDb()
  const resposta = await createHandler({ ...DEPS, db, store: fakeStore().store })(
    pedido({ arquivo: 'a,b\n"aberta,1\n' }),
  )
  assertEquals(resposta.status, 422)
  assertEquals((await resposta.json()).code, 'malformed_csv')
  assertEquals(falhas, ['malformed_csv'])
  assertEquals(linhas, [])
})

Deno.test('o arquivo só com espaços falha como vazio', async () => {
  const { db, falhas } = fakeDb()
  const resposta = await createHandler({ ...DEPS, db, store: fakeStore().store })(pedido({ arquivo: '   \n  ' }))
  assertEquals(resposta.status, 422)
  assertEquals(falhas, ['empty_file'])
})

Deno.test('o Storage que falha fecha o lote e não lê nem guarda registros', async () => {
  const { db, linhas, falhas } = fakeDb()
  const { store } = fakeStore(new Error('bucket indisponível'))
  const resposta = await createHandler({ ...DEPS, db, store })(pedido({ arquivo: CSV }))
  assertEquals(resposta.status, 502)
  assertEquals(falhas, ['storage_failed'])
  assertEquals(linhas, [])
})

Deno.test('o banco que falha no meio da entrega dos registros fecha o lote', async () => {
  const { db, falhas } = fakeDb()
  db.finishUpload = () => Promise.reject(new Error('banco fora do ar'))
  const resposta = await createHandler({ ...DEPS, db, store: fakeStore().store })(pedido({ arquivo: CSV }))
  assertEquals(resposta.status, 500)
  assertEquals(falhas, ['internal_error'])
})

Deno.test('o banco que não abre o lote responde 500 e nada é guardado', async () => {
  const { db } = fakeDb({ abertura: new Error('banco fora do ar') })
  const { store, gravados } = fakeStore()
  const resposta = await createHandler({ ...DEPS, db, store })(pedido({ arquivo: CSV }))
  assertEquals(resposta.status, 500)
  assertEquals(gravados, [])
})

Deno.test('responde ao preflight do CORS com a origem do app', async () => {
  const resposta = await createHandler({ ...DEPS, db: fakeDb().db, store: fakeStore().store })(
    new Request('https://fn.test/csv-import', { method: 'OPTIONS', headers: { Origin: 'https://app.althius.com.br' } }),
  )
  assertEquals(resposta.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.com.br')
})
