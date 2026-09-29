// Envio do CSV da importação de Contas e Contatos (CRM-07). O navegador manda o arquivo aqui e nunca grava linha
// comercial: a função abre o lote com a sessão de quem pede (create_import_batch confere a Participação ativa e devolve
// o caminho no bucket privado), guarda o arquivo no Storage com a chave de serviço, lê os registros e os entrega ao banco
// (stage_import_rows e finish_import_upload, só service_role). O mapeamento, a prévia, a confirmação e o processamento
// são funções do banco chamadas pelo navegador. Banco e Storage entram por injeção de dependência, para o teste ir da
// requisição à resposta sem rede.
import { comCors } from '../_shared/cors.ts'
import { CsvInvalido, type CsvLido, lerCsv, type Registro } from './csv.ts'

export type AberturaDoLote =
  | { kind: 'created'; batchId: string; storagePath: string }
  /** Quem pede não participa do Workspace. */
  | { kind: 'forbidden' }

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC create_import_batch, com a sessão de quem pede. Lança quando o banco falha por outro motivo. */
  createBatch(args: {
    workspaceId: string
    fileName: string
    fileSize: number
    authorization: string
    apikey: string
  }): Promise<AberturaDoLote>
  /** RPC stage_import_rows (service_role). */
  stageRows(batchId: string, rows: Registro[]): Promise<void>
  /** RPC finish_import_upload (service_role): o lote passa a esperar o mapeamento. */
  finishUpload(batchId: string, lido: CsvLido): Promise<void>
  /** RPC fail_import_upload (service_role): o lote falha com o motivo e as linhas guardadas saem. */
  failUpload(batchId: string, code: string): Promise<void>
}

export interface Store {
  /** Grava o arquivo no bucket privado csv-imports. */
  upload(path: string, bytes: Uint8Array): Promise<void>
}

export interface Deps {
  db: Db
  store: Store
  appOrigin: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const TAMANHO_MAXIMO = 5 * 1024 * 1024
const REGISTROS_POR_BLOCO = 500

const MENSAGEM_DO_CSV: Record<string, string> = {
  empty_file: 'O arquivo está vazio ou não tem nenhuma linha de dados.',
  malformed_csv: 'O arquivo tem um campo entre aspas que não fecha. Confira as aspas e envie de novo.',
  too_many_rows: 'O arquivo tem mais de 5.000 linhas de dados. Divida-o em arquivos menores.',
  too_many_columns: 'O arquivo tem mais de 100 colunas.',
  invalid_encoding: 'Não foi possível ler os caracteres do arquivo. Salve-o como CSV em UTF-8 e envie de novo.',
}

/** O nome do arquivo como a pessoa o enviou, sem caminho e sem caracteres de controle, em até 255 caracteres. */
function nomeDoArquivo(nome: string): string {
  // deno-lint-ignore no-control-regex
  const limpo = nome.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return (limpo || 'arquivo.csv').slice(0, 255)
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return respond({ error: 'Envie o arquivo CSV.' }, 400)
    }
    const workspaceId = form.get('workspaceId')
    const arquivo = form.get('file')
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) {
      return respond({ error: 'Workspace obrigatório.' }, 400)
    }
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return respond({ error: 'Envie um arquivo CSV com conteúdo.' }, 400)
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      return respond({ error: 'O arquivo passa de 5 MB. Divida-o em arquivos menores.' }, 413)
    }

    let lote: AberturaDoLote
    try {
      lote = await deps.db.createBatch({
        workspaceId,
        fileName: nomeDoArquivo(arquivo.name),
        fileSize: arquivo.size,
        authorization,
        apikey,
      })
    } catch (error) {
      log({ type: 'csv_import', outcome: 'create_failed', message: String(error) })
      return respond({ error: 'Não foi possível iniciar a importação agora.' }, 500)
    }
    if (lote.kind === 'forbidden') {
      return respond({ error: 'Só quem participa do Workspace importa arquivos nele.' }, 403)
    }

    const { batchId, storagePath } = lote
    // Qualquer falha daqui em diante fecha o lote com o motivo, para a tela não esperar para sempre.
    const falhar = async (code: string, status: number, error: string) => {
      try {
        await deps.db.failUpload(batchId, code)
      } catch (falha) {
        log({ type: 'csv_import', batchId, outcome: 'fail_not_recorded', message: String(falha) })
      }
      log({ type: 'csv_import', batchId, outcome: code })
      return respond({ error, code, batchId }, status)
    }

    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      try {
        await deps.store.upload(storagePath, bytes)
      } catch (error) {
        log({ type: 'csv_import', batchId, outcome: 'storage_failed', message: String(error) })
        return await falhar('storage_failed', 502, 'Não foi possível guardar o arquivo agora. Tente de novo.')
      }

      let lido: CsvLido
      try {
        lido = lerCsv(bytes)
      } catch (error) {
        if (error instanceof CsvInvalido) return await falhar(error.code, 422, MENSAGEM_DO_CSV[error.code])
        throw error
      }

      for (let i = 0; i < lido.records.length; i += REGISTROS_POR_BLOCO) {
        await deps.db.stageRows(batchId, lido.records.slice(i, i + REGISTROS_POR_BLOCO))
      }
      await deps.db.finishUpload(batchId, lido)
      log({ type: 'csv_import', batchId, outcome: 'ready', rows: lido.records.length, delimiter: lido.delimiter })
      return respond({ batchId })
    } catch (error) {
      log({ type: 'csv_import', batchId, outcome: 'read_failed', message: String(error) })
      return await falhar('internal_error', 500, 'Não foi possível ler o arquivo agora. Tente de novo.')
    }
  })
}
