// A ingestão de um e-mail da Unipile pelo banco (RPC ingest_unipile_email_event), compartilhada pelo webhook e
// pela conferência da conversa antes de um envio. Só o adaptador fica aqui; quem decide é a RPC.

export interface EmailAttachmentRef {
  id: string
  /** URL de download que a Unipile pode trazer no objeto Email; sem ela, vale o endpoint por id. */
  url?: string
  name?: string
  mime?: string
  size?: number
  status?: string
}

export interface IngestedEmail {
  outcome: string
  interaction_id: string | null
  send_id: string | null
  attachments: EmailAttachmentRef[]
}

export interface IngestEmailEventInput {
  eventId: string
  eventType: 'email.new' | 'email.new.bounce'
  unipileAccountId: string
  email: Record<string, unknown>
  ownerAddresses: string[]
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function ingestEmailEventVia(admin: RpcClient) {
  return async (input: IngestEmailEventInput): Promise<IngestedEmail> => {
    const { data, error } = await admin.rpc('ingest_unipile_email_event', {
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_unipile_account_id: input.unipileAccountId,
      p_email: input.email,
      p_owner_addresses: input.ownerAddresses,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as IngestedEmail | undefined
    if (!row) throw new Error('ingest_unipile_email_event returned no row')
    return { ...row, attachments: Array.isArray(row.attachments) ? row.attachments : [] }
  }
}
