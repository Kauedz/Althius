import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type SequenceAttachmentDb, type SequenceAttachmentStorage } from './handler.ts'

export const SEQUENCE_ATTACHMENTS_BUCKET = 'sequence-attachments'

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

const db: SequenceAttachmentDb = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await userClient(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async registerAttachment(authorization, apikey, input) {
    const { data, error } = await userClient(authorization, apikey).rpc('register_sequence_attachment', {
      p_sequence_id: input.sequenceId,
      p_step_id: input.stepId,
      p_file_name: input.fileName,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as { attachment_id?: string; storage_path?: string } | null
    if (!row?.attachment_id || !row.storage_path) throw new Error('attachment not registered')
    return { attachmentId: row.attachment_id, storagePath: row.storage_path }
  },
  async markStored(attachmentId) {
    const { data, error } = await admin.rpc('mark_sequence_attachment_stored', { p_attachment_id: attachmentId })
    if (error || data !== true) throw error ?? new Error('attachment not marked')
  },
  async discardPending(attachmentId) {
    const { error } = await admin.rpc('discard_pending_sequence_attachment', { p_attachment_id: attachmentId })
    if (error) throw error
  },
  async attachmentPathForUser(authorization, apikey, attachmentId) {
    const { data, error } = await userClient(authorization, apikey).rpc('get_sequence_attachment_path', {
      p_attachment_id: attachmentId,
    })
    if (error) throw error
    if (typeof data !== 'string' || !data) throw Object.assign(new Error('attachment not stored'), { code: 'P0002' })
    return data
  },
}

const storage: SequenceAttachmentStorage = {
  async upload(path, bytes, contentType) {
    const { error } = await admin.storage.from(SEQUENCE_ATTACHMENTS_BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    })
    if (error) throw error
  },
  async createSignedUrl(path, expiresInSeconds) {
    const { data, error } = await admin.storage.from(SEQUENCE_ATTACHMENTS_BUCKET).createSignedUrl(path, expiresInSeconds)
    if (error || !data?.signedUrl) throw error ?? new Error('no signed url')
    return data.signedUrl
  },
}

Deno.serve(createHandler({ db, storage, appOrigin: APP_ORIGIN }))
