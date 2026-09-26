import { createClient } from 'npm:@supabase/supabase-js@2'
import { ingestEmailEventVia } from '../_shared/ingest-email-event.ts'
import { type AttachmentStore, createHandler, type WebhookDb, type WebhookUnipile } from './handler.ts'

const UNIPILE_API_BASE = 'https://api.unipile.com'
const ATTACHMENTS_BUCKET = 'email-attachments'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Backend is not configured')
  return value
}

const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db: WebhookDb = {
  async completeSenderConnectionAttempt({ attemptId, unipileAccountId, provider, initialStatus }) {
    const { data, error } = await admin.rpc('complete_sender_connection_attempt', {
      p_attempt_id: attemptId,
      p_unipile_account_id: unipileAccountId,
      p_provider: provider,
      p_initial_status: initialStatus,
    })
    if (error) throw error
    return String(data)
  },
  async applyUnipileSenderStatus(unipileAccountId, status) {
    const { data, error } = await admin.rpc('apply_unipile_sender_status', {
      p_unipile_account_id: unipileAccountId,
      p_status: status,
    })
    if (error) throw error
    return data === true
  },
  ingestEmailEvent: ingestEmailEventVia(admin),
  async recordReceivedEmailAttachment({ interactionId, attachmentId, storagePath, status }) {
    const { error } = await admin.rpc('record_received_email_attachment', {
      p_interaction_id: interactionId,
      p_attachment_id: attachmentId,
      p_storage_path: storagePath,
      p_status: status,
    })
    if (error) throw error
  },
}

const unipile: WebhookUnipile = {
  async downloadEmailAttachment(accountId, emailId, attachment) {
    const url = attachment.url && /^https:\/\//.test(attachment.url)
      ? attachment.url
      : `${UNIPILE_API_BASE}/v2/${encodeURIComponent(accountId)}/emails/${encodeURIComponent(emailId)}` +
        `/attachments/${encodeURIComponent(attachment.id)}`
    const upstream = await fetch(url, { headers: { 'X-API-KEY': required('UNIPILE_API_KEY'), accept: '*/*' } })
    if (!upstream.ok) throw new Error(`Unipile respondeu HTTP ${upstream.status} ao baixar o anexo`)
    return { bytes: new Uint8Array(await upstream.arrayBuffer()), contentType: upstream.headers.get('content-type') }
  },
}

const storage: AttachmentStore = {
  async upload(path, bytes, contentType) {
    const { error } = await admin.storage.from(ATTACHMENTS_BUCKET).upload(path, bytes, {
      contentType: contentType ?? 'application/octet-stream',
      upsert: true,
    })
    if (error) throw error
  },
}

// EdgeRuntime.waitUntil mantém a função viva depois da resposta, para os anexos serem baixados.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime

Deno.serve(createHandler({
  secret: Deno.env.get('UNIPILE_WEBHOOK_SECRET') ?? '',
  db,
  unipile,
  storage,
  waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
}))
