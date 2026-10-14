import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, deleteFolder, type PurgeDb, type PurgeJob, type PurgeStorage, validPrefix } from './handler.ts'

const TOKEN = 'a'.repeat(64)
const INTERACAO = '11111111-2222-3333-4444-555555555555'
const PASTA = `recebidos/${INTERACAO}/`

/** Um Storage em memória: os caminhos completos dos arquivos, e o que já foi removido. */
function fakeStorage(files: string[], failRemove = false) {
  const remaining = new Set(files)
  const removed: string[] = []
  const storage: PurgeStorage = {
    async list(_bucket, folder, offset, limit) {
      const prefix = `${folder}/`
      const names = new Map<string, boolean>()
      for (const path of remaining) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        const [first, ...others] = rest.split('/')
        names.set(first, others.length > 0)
      }
      return [...names].slice(offset, offset + limit).map(([name, isFolder]) => ({ name, isFolder }))
    },
    async remove(_bucket, paths) {
      if (failRemove) throw new Error('storage unavailable')
      for (const path of paths) {
        remaining.delete(path)
        removed.push(path)
      }
    },
  }
  return { storage, removed, remaining }
}

function fakeDb(jobs: PurgeJob[]) {
  const finished: { id: number; error?: string }[] = []
  let claims = 0
  const db: PurgeDb = {
    tokenMatches: async (token) => token === TOKEN,
    claim: async (limit) => {
      claims++
      return jobs.slice(0, limit)
    },
    finish: async (id, error) => {
      finished.push({ id, ...(error ? { error } : {}) })
    },
  }
  return { db, finished, claims: () => claims }
}

function request(headers: Record<string, string> = { 'x-purge-token': TOKEN }, method = 'POST') {
  return new Request('https://x.test/functions/v1/storage-purge', {
    method,
    headers,
    body: method === 'POST' ? '{}' : undefined,
  })
}

/** Roda o handler e espera o trabalho em segundo plano. */
async function call(deps: Parameters<typeof createHandler>[0], req: Request) {
  const pending: Promise<unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const handler = createHandler({
    ...deps,
    waitUntil: (work) => pending.push(work),
    log: (fields) => logs.push(fields),
  })
  const response = await handler(req)
  await Promise.all(pending)
  return { response, logs }
}

Deno.test('só aceita prefixos de uma pasta dentro de outra, nunca a raiz nem o primeiro nível', () => {
  assertEquals(validPrefix(PASTA), true)
  assertEquals(validPrefix('lote/abc/'), true)
  assertEquals(validPrefix('recebidos/'), false)
  assertEquals(validPrefix('/'), false)
  assertEquals(validPrefix('recebidos/abc'), false)
  assertEquals(validPrefix('recebidos/../outro/'), false)
  assertEquals(validPrefix('recebidos//abc/'), false)
})

Deno.test('apaga os arquivos da pasta e das subpastas, e só deles', async () => {
  const { storage, removed, remaining } = fakeStorage([
    `${PASTA}att-1/proposta.pdf`,
    `${PASTA}att-1/outra.pdf`,
    `${PASTA}att-2/contrato.pdf`,
    'recebidos/99999999-2222-3333-4444-555555555555/att-1/vizinho.pdf',
  ])
  const count = await deleteFolder(storage, 'email-attachments', PASTA)
  assertEquals(count, 3)
  assertEquals(removed.length, 3)
  assertEquals([...remaining], ['recebidos/99999999-2222-3333-4444-555555555555/att-1/vizinho.pdf'])
})

Deno.test('apaga em páginas quando a pasta tem mais de cem arquivos', async () => {
  const files = Array.from({ length: 250 }, (_, i) => `${PASTA}att-1/arquivo-${String(i).padStart(3, '0')}.pdf`)
  const { storage, remaining } = fakeStorage(files)
  assertEquals(await deleteFolder(storage, 'email-attachments', PASTA), 250)
  assertEquals(remaining.size, 0)
})

Deno.test('sem o token do banco, ou com outro, a chamada é recusada e nada é reservado', async () => {
  const { db, claims } = fakeDb([{ id: 1, bucket: 'email-attachments', prefix: PASTA }])
  const { storage } = fakeStorage([])
  const recusados: Record<string, string>[] = [{}, { 'x-purge-token': 'curto' }, { 'x-purge-token': 'b'.repeat(64) }]
  for (const headers of recusados) {
    const { response } = await call({ db, storage }, request(headers))
    assertEquals(response.status, 401)
  }
  assertEquals(claims(), 0)
  assertEquals((await call({ db, storage }, request({ 'x-purge-token': TOKEN }, 'GET'))).response.status, 405)
})

Deno.test('com o token certo, apaga a pasta e dá baixa', async () => {
  const { db, finished } = fakeDb([{ id: 7, bucket: 'email-attachments', prefix: PASTA }])
  const { storage, remaining } = fakeStorage([`${PASTA}att-1/proposta.pdf`])
  const { response, logs } = await call({ db, storage }, request())
  assertEquals(response.status, 202)
  assertEquals(remaining.size, 0)
  assertEquals(finished, [{ id: 7 }])
  assertEquals(logs, [{ type: 'storage-purge', jobId: 7, outcome: 'done', removed: 1 }])
})

Deno.test('uma pasta que já não existe também recebe baixa (repetir não muda nada)', async () => {
  const { db, finished } = fakeDb([{ id: 8, bucket: 'email-attachments', prefix: PASTA }])
  const { storage } = fakeStorage([])
  await call({ db, storage }, request())
  assertEquals(finished, [{ id: 8 }])
})

Deno.test('uma falha do Storage volta a pasta para a fila, sem o prefixo no log nem no erro', async () => {
  const { db, finished } = fakeDb([
    { id: 9, bucket: 'email-attachments', prefix: PASTA },
    { id: 10, bucket: 'email-attachments', prefix: 'recebidos/' },
  ])
  const { storage, remaining } = fakeStorage([`${PASTA}att-1/proposta.pdf`], true)
  const { logs } = await call({ db, storage }, request())
  assertEquals(finished, [{ id: 9, error: 'storage unavailable' }, { id: 10, error: 'invalid_prefix' }])
  assertEquals(remaining.size, 1)
  assertEquals(JSON.stringify(logs).includes(INTERACAO), false)
})

Deno.test('um bucket fora da lista não é apagado, mesmo com um prefixo válido', async () => {
  const { db, finished } = fakeDb([{ id: 11, bucket: 'avatars', prefix: PASTA }])
  const { storage, remaining } = fakeStorage([`${PASTA}att-1/proposta.pdf`])
  const { logs } = await call({ db, storage }, request())
  assertEquals(remaining.size, 1)
  assertEquals(finished, [{ id: 11, error: 'invalid_prefix' }])
  assertEquals(logs, [{ type: 'storage-purge', jobId: 11, outcome: 'invalid_prefix' }])
})

Deno.test('a fila também apaga os anexos das Conversas, e só eles além dos de antes', async () => {
  const { BUCKETS_PERMITIDOS } = await import('./handler.ts')
  assertEquals([...BUCKETS_PERMITIDOS].sort(), ['agent-attachments', 'csv-imports', 'email-attachments', 'sequence-attachments'])
})
