import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { type Armazenamento, createHandler, type Db } from './handler.ts'

export const AGENT_ATTACHMENTS_BUCKET = 'agent-attachments'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const APP_ORIGIN = required('APP_ORIGIN')
const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function userClient(authorization: string, apikey: string) {
  return createClient(required('SUPABASE_URL'), apikey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const db: Db = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await userClient(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async registrar(authorization, apikey, input) {
    const { data, error } = await userClient(authorization, apikey).rpc('register_agent_attachment', {
      p_workspace_id: input.workspaceId,
      p_file_name: input.fileName,
      p_mime: input.mime,
      p_size: input.size,
      p_extracted_text: input.extractedText,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as { attachment_id?: string; storage_path?: string } | null
    if (!row?.attachment_id || !row.storage_path) throw new Error('attachment not registered')
    return { attachmentId: row.attachment_id, storagePath: row.storage_path }
  },
  async marcarGuardado(attachmentId) {
    const { data, error } = await admin.rpc('mark_agent_attachment_stored', { p_attachment_id: attachmentId })
    if (error || data !== true) throw error ?? new Error('attachment not marked')
  },
  async descartarPendente(attachmentId) {
    const { error } = await admin.rpc('discard_pending_agent_attachment', { p_attachment_id: attachmentId })
    if (error) throw error
  },
  async caminhoDoAnexo(authorization, apikey, attachmentId) {
    const { data, error } = await userClient(authorization, apikey).rpc('get_agent_attachment_path', {
      p_attachment_id: attachmentId,
    })
    if (error) throw error
    if (typeof data !== 'string' || !data) throw Object.assign(new Error('attachment not stored'), { code: 'P0002' })
    return data
  },
  async remover(authorization, apikey, attachmentId) {
    const { data, error } = await userClient(authorization, apikey).rpc('remove_agent_attachment', {
      p_attachment_id: attachmentId,
    })
    if (error) throw error
    return data === true
  },
}

const storage: Armazenamento = {
  async upload(path, bytes, contentType) {
    const { error } = await admin.storage.from(AGENT_ATTACHMENTS_BUCKET).upload(path, bytes, { contentType, upsert: false })
    if (error) throw error
  },
  async createSignedUrl(path, expiresInSeconds) {
    const { data, error } = await admin.storage.from(AGENT_ATTACHMENTS_BUCKET).createSignedUrl(path, expiresInSeconds)
    if (error || !data?.signedUrl) throw error ?? new Error('no signed url')
    return data.signedUrl
  },
}

async function lerPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join('\n') : text
}

Deno.serve(createHandler({ db, storage, appOrigin: APP_ORIGIN, lerPdf }))
