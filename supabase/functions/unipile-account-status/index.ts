import { createClient } from 'npm:@supabase/supabase-js@2'
import { ingestEmailEventVia } from '../_shared/ingest-email-event.ts'
import { ingestChatEventVia } from '../_shared/ingest-chat-event.ts'
import { createAccountDirectory } from '../_shared/unipile/account-directory.ts'
import { createUnipileRuntime, type UnipileBridge, unipileUnavailableResponse } from '../_shared/unipile/index.ts'
import { type AttachmentStore, createHandler, type WebhookDb } from './handler.ts'

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
  async holdSequencesOfLostSender(unipileAccountId) {
    const { data, error } = await admin.rpc('hold_sequences_of_lost_sender', { p_unipile_account_id: unipileAccountId })
    if (error) throw error
    return typeof data === 'number' ? data : 0
  },
  ingestEmailEvent: ingestEmailEventVia(admin),
  ingestChatEvent: ingestChatEventVia(admin),
  async learnSenderOwnProviderId(unipileAccountId, ownProviderId) {
    const { error } = await admin.rpc('learn_sender_own_provider_id', {
      p_unipile_account_id: unipileAccountId,
      p_own_provider_id: ownProviderId,
    })
    if (error) throw error
  },
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

// A conta Unipile é a conexão ativa (ADR-0024): o segredo do webhook e o endereço para baixar anexos vêm dela, lida a cada
// pedido (em cache por 30 s). Sem conexão ativa, o aviso recebe 503 e a Unipile o reentrega.
const unipileRuntime = createUnipileRuntime({ rpc: admin, env: Deno.env })

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

// Quais contas são da conexão ativa vem da lista de contas dela; uma lista por ponte, e a troca de conexão traz uma nova.
let directory: { bridge: UnipileBridge; accounts: ReturnType<typeof createAccountDirectory> } | null = null
const accountsOf = (bridge: UnipileBridge) => {
  if (directory?.bridge !== bridge) {
    directory = { bridge, accounts: createAccountDirectory({ list: () => bridge.listAccounts() }) }
  }
  return directory.accounts
}

Deno.serve(async (req) => {
  const connection = await unipileRuntime.connection()
  const bridge = await unipileRuntime.bridge()
  if (!connection || !bridge) return unipileUnavailableResponse()
  return createHandler({
    // v2: HMAC do corpo com este segredo. v1: o cabeçalho Unipile-Auth igual a ele (ou a chave ?k= do aviso do link de conexão).
    secret: connection.webhookSecret ?? '',
    version: connection.version,
    accounts: accountsOf(bridge),
    db,
    unipile: {
      downloadEmailAttachment: (accountId, emailId, attachment) =>
        bridge.downloadEmailAttachment(accountId, emailId, attachment),
    },
    storage,
    waitUntil: runtime?.waitUntil ? (work) => runtime.waitUntil!(work) : undefined,
  })(req)
})
