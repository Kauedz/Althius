// Apaga do Storage as pastas que o banco enfileirou ao apagar dados pessoais (CRM-18). O Storage não deixa remover o
// arquivo por SQL, então o banco só guarda o prefixo (nunca o nome do arquivo) em private.storage_purge_queue e chama esta
// função pelo pg_cron + pg_net quando há pasta vencida. A chamada prova que veio do banco pelo token guardado nele
// (x-purge-token); a resposta sai logo e o trabalho segue em segundo plano. A função reserva as entradas, apaga tudo o que
// há sob o prefixo e dá baixa; uma falha volta para a fila e a próxima rodada tenta de novo. Nenhum log leva o prefixo.

export interface PurgeJob {
  id: number
  bucket: string
  prefix: string
}

/** Uma entrada de uma pasta do Storage: um arquivo ou uma subpasta. */
export interface StorageEntry {
  name: string
  isFolder: boolean
}

export interface PurgeDb {
  /** RPC storage_purge_token_matches: o token que o banco guarda e manda no cabeçalho. */
  tokenMatches(token: string): Promise<boolean>
  /** RPC claim_storage_purge: as pastas vencidas, reservadas por 10 minutos. */
  claim(limit: number): Promise<PurgeJob[]>
  /** RPC finish_storage_purge: dá baixa (sem erro) ou registra o erro e libera a pasta para a próxima rodada. */
  finish(id: number, error?: string): Promise<void>
}

export interface PurgeStorage {
  /** Uma página das entradas diretas de uma pasta (sem barra final). */
  list(bucket: string, folder: string, offset: number, limit: number): Promise<StorageEntry[]>
  /** Remove arquivos pelo caminho completo. Lança se o Storage recusar. */
  remove(bucket: string, paths: string[]): Promise<void>
}

export interface Deps {
  db: PurgeDb
  storage: PurgeStorage
  /** Pastas por chamada. Padrão 10. */
  maxPerRun?: number
  /** Continua o trabalho depois da resposta (EdgeRuntime.waitUntil). Padrão: fire-and-forget. */
  waitUntil?: (work: Promise<unknown>) => void
  log?: (fields: Record<string, unknown>) => void
}

const PAGE = 100

/** Os únicos buckets em que a fila pode apagar: os que guardam dado ligado a um registro (anexos recebidos, CSV da importação, anexos dos passos e anexos das Conversas). */
export const BUCKETS_PERMITIDOS: ReadonlySet<string> = new Set([
  'email-attachments',
  'csv-imports',
  'sequence-attachments',
  'agent-attachments',
])

/**
 * O prefixo tem de apontar para uma pasta de dentro de uma pasta (`recebidos/<id>/`), nunca para a raiz de um bucket nem
 * para uma pasta de primeiro nível: um erro na fila não pode apagar mais do que uma pasta de um registro.
 */
export function validPrefix(prefix: string): boolean {
  if (!prefix.endsWith('/') || prefix.includes('//') || prefix.split('/').includes('..')) return false
  return prefix.split('/').filter(Boolean).length >= 2
}

/** Apaga tudo o que há sob o prefixo, de subpasta em subpasta. Devolve quantos arquivos removeu. */
export async function deleteFolder(storage: PurgeStorage, bucket: string, prefix: string): Promise<number> {
  const pending = [prefix.slice(0, -1)]
  const files: string[] = []
  while (pending.length > 0) {
    const folder = pending.pop()!
    let offset = 0
    while (true) {
      const entries = await storage.list(bucket, folder, offset, PAGE)
      for (const entry of entries) {
        const path = `${folder}/${entry.name}`
        if (entry.isFolder) pending.push(path)
        else files.push(path)
      }
      if (entries.length < PAGE) break
      offset += PAGE
    }
  }
  for (let i = 0; i < files.length; i += PAGE) {
    await storage.remove(bucket, files.slice(i, i + PAGE))
  }
  return files.length
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const waitUntil = deps.waitUntil ?? ((work) => {
    work.catch(() => {})
  })

  function respond(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  async function run() {
    let jobs: PurgeJob[]
    try {
      jobs = await deps.db.claim(deps.maxPerRun ?? 10)
    } catch (error) {
      log({ type: 'storage-purge', outcome: 'claim_failed', message: messageOf(error) })
      return
    }
    for (const job of jobs) {
      try {
        if (!BUCKETS_PERMITIDOS.has(job.bucket) || !validPrefix(job.prefix)) {
          await deps.db.finish(job.id, 'invalid_prefix')
          log({ type: 'storage-purge', jobId: job.id, outcome: 'invalid_prefix' })
          continue
        }
        const removed = await deleteFolder(deps.storage, job.bucket, job.prefix)
        await deps.db.finish(job.id)
        log({ type: 'storage-purge', jobId: job.id, outcome: 'done', removed })
      } catch (error) {
        // A mensagem do Storage não leva o nome do arquivo; o prefixo fica de fora do log e do erro guardado.
        const message = messageOf(error)
        await deps.db.finish(job.id, message).catch(() => {})
        log({ type: 'storage-purge', jobId: job.id, outcome: 'error', message })
      }
    }
  }

  return async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)
    const token = req.headers.get('x-purge-token') ?? ''
    let allowed = false
    try {
      allowed = token.length >= 32 && await deps.db.tokenMatches(token)
    } catch {
      return respond({ error: 'Não foi possível conferir a chamada.' }, 500)
    }
    if (!allowed) return respond({ error: 'Chamada não autorizada.' }, 401)
    waitUntil(run())
    return respond({ accepted: true }, 202)
  }
}
