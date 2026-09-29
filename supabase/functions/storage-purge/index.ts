import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type PurgeDb, type PurgeJob, type PurgeStorage } from './handler.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db: PurgeDb = {
  async tokenMatches(token) {
    const { data, error } = await admin.rpc('storage_purge_token_matches', { p_token: token })
    if (error) throw error
    return data === true
  },
  async claim(limit) {
    const { data, error } = await admin.rpc('claim_storage_purge', { p_limit: limit })
    if (error) throw error
    return (data ?? []) as PurgeJob[]
  },
  async finish(id, message) {
    const { error } = await admin.rpc('finish_storage_purge', { p_id: id, p_error: message ?? null })
    if (error) throw error
  },
}

const storage: PurgeStorage = {
  async list(bucket, folder, offset, limit) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit, offset })
    if (error) throw error
    // O Storage devolve as subpastas sem `id`.
    return (data ?? []).map((entry) => ({ name: entry.name, isFolder: entry.id === null }))
  },
  async remove(bucket, paths) {
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) throw error
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para a limpeza terminar.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  db,
  storage,
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
}))
