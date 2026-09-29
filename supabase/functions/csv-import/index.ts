import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type Db, type Store } from './handler.ts'

const CSV_BUCKET = 'csv-imports'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const SUPABASE_URL = required('SUPABASE_URL')
const APP_ORIGIN = required('APP_ORIGIN')
const admin = createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Um cliente com a sessão de quem pede: o banco aplica as regras dela, sem a chave de serviço. */
function clienteDaSessao(authorization: string, apikey: string) {
  return createClient(SUPABASE_URL, apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function falha(nome: string, error: { code?: string; message: string }) {
  return new Error(`${nome}: ${error.code ?? ''} ${error.message}`)
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await clienteDaSessao(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async createBatch({ workspaceId, fileName, fileSize, authorization, apikey }) {
    const { data, error } = await clienteDaSessao(authorization, apikey).rpc('create_import_batch', {
      p_workspace_id: workspaceId,
      p_file_name: fileName,
      p_file_size: fileSize,
    })
    // 42501: não participa do Workspace.
    if (error?.code === '42501') return { kind: 'forbidden' }
    if (error) throw falha('create_import_batch', error)
    const [linha] = (data ?? []) as { batch_id: string; storage_path: string }[]
    if (!linha?.batch_id) throw new Error('create_import_batch não devolveu o lote')
    return { kind: 'created', batchId: linha.batch_id, storagePath: linha.storage_path }
  },
  async stageRows(batchId, rows) {
    const { error } = await admin.rpc('stage_import_rows', { p_batch_id: batchId, p_rows: rows })
    if (error) throw falha('stage_import_rows', error)
  },
  async finishUpload(batchId, lido) {
    const { error } = await admin.rpc('finish_import_upload', {
      p_batch_id: batchId,
      p_delimiter: lido.delimiter,
      p_has_header: lido.hasHeader,
      p_headers: lido.headers,
      p_mapping: lido.mapping,
    })
    if (error) throw falha('finish_import_upload', error)
  },
  async failUpload(batchId, code) {
    const { error } = await admin.rpc('fail_import_upload', { p_batch_id: batchId, p_error_code: code })
    if (error) throw falha('fail_import_upload', error)
  },
}

const store: Store = {
  async upload(path, bytes) {
    const { error } = await admin.storage.from(CSV_BUCKET).upload(path, bytes, {
      contentType: 'text/csv',
      upsert: false,
    })
    if (error) throw error
  },
}

Deno.serve(createHandler({ db, store, appOrigin: APP_ORIGIN }))
