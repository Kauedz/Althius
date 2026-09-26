import { createClient } from 'npm:@supabase/supabase-js@2'
import { type AttachmentDb, type AttachmentSigner, createHandler } from './handler.ts'

const ATTACHMENTS_BUCKET = 'email-attachments'

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

const db: AttachmentDb = {
  async userFromJwt(authorization, apikey) {
    const { data, error } = await userClient(authorization, apikey).auth.getUser(authorization.slice(7))
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
  async attachmentPathForUser(authorization, apikey, interactionId, attachmentId) {
    const { data, error } = await userClient(authorization, apikey).rpc('get_received_email_attachment_path', {
      p_interaction_id: interactionId,
      p_attachment_id: attachmentId,
    })
    if (error) throw error
    if (typeof data !== 'string' || !data) throw Object.assign(new Error('attachment not stored'), { code: 'P0002' })
    return data
  },
}

const signer: AttachmentSigner = {
  async createSignedUrl(path, expiresInSeconds) {
    const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, expiresInSeconds)
    if (error || !data?.signedUrl) throw error ?? new Error('no signed url')
    return data.signedUrl
  },
}

Deno.serve(createHandler({ db, signer, appOrigin: APP_ORIGIN }))
