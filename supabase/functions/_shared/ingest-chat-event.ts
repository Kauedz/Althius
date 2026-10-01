// A ingestão de um evento de conversa da Unipile pelo banco (RPC ingest_unipile_chat_event), compartilhada pelo webhook e
// pela conferência da conversa antes de um envio. Só o adaptador fica aqui; quem decide é a RPC.

/** `message.new` traz o objeto Message (recebida E enviada); `relation.new` é uma nova conexão no LinkedIn. */
export type ChatEventType = 'message.new' | 'chat.update' | 'relation.new' | 'new_relation'

// Os tipos de evento de conversa que o webhook entrega ao banco, num lugar só.
// não confirmado: o nome do evento de nova relação do LinkedIn é `relation.new` na documentação v2 que a busca achou
// (payload = User Relation; a Unipile avisa que ele pode chegar até 8 horas depois do aceite); `new_relation` é o
// apelido da v1 e fica aceito. Nenhum dos dois é resposta: o banco só os registra.
export const CHAT_MESSAGE_EVENTS: ReadonlySet<string> = new Set(['message.new'])
export const CHAT_RELATION_EVENTS: ReadonlySet<string> = new Set(['relation.new', 'new_relation'])

export interface IngestChatEventInput {
  eventId: string
  eventType: ChatEventType
  unipileAccountId: string
  payload: Record<string, unknown>
}

export interface IngestedChat {
  outcome: string
  interaction_id: string | null
  send_id: string | null
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function ingestChatEventVia(admin: RpcClient) {
  return async (input: IngestChatEventInput): Promise<IngestedChat> => {
    const { data, error } = await admin.rpc('ingest_unipile_chat_event', {
      p_event_id: input.eventId,
      p_unipile_account_id: input.unipileAccountId,
      p_event_type: input.eventType,
      p_payload: input.payload,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as IngestedChat | undefined
    if (!row) throw new Error('ingest_unipile_chat_event returned no row')
    return row
  }
}
