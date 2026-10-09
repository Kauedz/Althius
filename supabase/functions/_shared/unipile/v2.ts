// O contrato da Unipile v2 (https://api.unipile.com, prefixo /v2/{account_id}/…): pedido e resposta de cada operação que
// a Althius usa. Vem do que o código já faz; o que o código só presume leva `não confirmado:` e confere no primeiro
// envio real. Os campos "não confirmados" são opcionais: a leitura nunca depende deles sozinha.
import {
  acknowledgement,
  chatSentResponse,
  customHeaders,
  emailAddress,
  httpsUrl,
  isoDateTime,
  looseId,
  nonBlank,
  outgoingAttachment,
  profileDistanceFields,
  recordList,
} from './common.ts'
import { z } from './zod.ts'

/** POST /v2/auth/link: link novo leva `providers`; reconexão leva `account_id`. */
const createAuthLink = {
  request: z.object({
    expires_on: isoDateTime,
    redirect_uri: z.string().url(),
    state: nonBlank,
    providers: z.array(nonBlank).min(1).optional(),
    account_id: nonBlank.optional(),
  }).refine((value) => (value.providers === undefined) !== (value.account_id === undefined), {
    message: 'providers (conexão nova) ou account_id (reconexão), nunca os dois nem nenhum',
  }),
  // O link vem em `link` ou dentro de `data`. Só https.
  response: z.union([
    z.object({ link: httpsUrl }).transform((value) => ({ link: value.link })),
    z.object({ data: z.object({ link: httpsUrl }) }).transform((value) => ({ link: value.data.link })),
  ]),
}

/** GET /v2/accounts/?limit=100. não confirmado: o formato da lista (não há chamador hoje); vem do mapa do protótipo, §1.3. */
const listAccounts = {
  request: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  response: z.object({
    data: z.array(z.object({
      id: nonBlank,
      provider: nonBlank,
      // não confirmado: running | errored | disconnected.
      status: z.string().optional(),
      created_at: z.string().optional(),
    })),
    has_more: z.boolean().optional(),
  }),
}

/** DELETE /v2/accounts/{id}. 404 (conta já removida) é tratado pelo chamador como sucesso. */
const disconnectAccount = {
  request: z.object({ account_id: nonBlank }),
  response: acknowledgement,
}

/** POST /v2/{account_id}/emails/send. */
const sendEmail = {
  request: z.object({
    to: z.array(z.object({ email: emailAddress, display_name: z.string().optional() })).min(1),
    subject: z.string(),
    plain_text: z.string(),
    custom_headers: customHeaders,
    reply_to_message_id: nonBlank.optional(),
    attachments: z.array(outgoingAttachment).optional(),
  }),
  // `{"object":"EmailSent","id","message_id"}`. Sem o `id`, o e-mail provavelmente saiu: a resposta é ilegível.
  response: z.object({
    id: nonBlank,
    message_id: z.string().nullish().catch(undefined),
  }).transform((value) => ({ id: value.id, message_id: value.message_id ?? null })),
}

/**
 * POST /v2/{account_id}/chats/send.
 * não confirmado: `users_ids` (o guia de migração) ou `user_ids` (um exemplo do guia de envio); se a Unipile recusar o
 * campo, é só trocar START_CHAT_USERS_FIELD no adaptador. Confira no primeiro envio real de WhatsApp/LinkedIn.
 * não confirmado: o campo `attachments` e o formato de cada item.
 */
const startChat = {
  request: z.object({
    users_ids: z.array(nonBlank).min(1),
    text: nonBlank,
    attachments: z.array(outgoingAttachment).optional(),
  }),
  // não confirmado: onde vêm os ids. `chat_id` e `message_id` valem sempre; `id` sozinho é o da conversa ao abrir uma.
  response: chatSentResponse,
}

/** POST /v2/{account_id}/chats/{chat_id}/messages/send. não confirmado: `attachments`, como acima. */
const sendChatMessage = {
  request: z.object({ text: nonBlank, attachments: z.array(outgoingAttachment).optional() }),
  // não confirmado: `id` sozinho é o da mensagem ao continuar uma conversa.
  response: chatSentResponse,
}

/** POST /v2/{account_id}/users/me/relation-requests: convite com nota. */
const inviteLinkedIn = {
  request: z.object({ user_id: nonBlank, message: z.string().optional() }),
  // não confirmado: o nome do campo do id do convite (id, invitation_id ou relation_request_id).
  response: z.object({ id: looseId, invitation_id: looseId, relation_request_id: looseId })
    .refine((value) => [value.id, value.invitation_id, value.relation_request_id].some((id) => id !== undefined), {
      message: 'nenhum id',
    })
    .transform((value) => ({ id: (value.id ?? value.invitation_id ?? value.relation_request_id) as string })),
}

/** GET /v2/{account_id}/users/{identifier}: o perfil do LinkedIn. */
const resolveProfile = {
  request: z.object({ account_id: nonBlank, identifier: nonBlank }),
  // não confirmado: onde a v2 diz o id nativo do perfil (id, provider_id ou user_id) e a distância de rede
  // (network_distance, distance, connection_degree, relation ou is_connection). Conferir no primeiro envio real.
  response: z.object({ id: looseId, provider_id: looseId, user_id: looseId, ...profileDistanceFields })
    .passthrough()
    .refine((value) => [value.id, value.provider_id, value.user_id].some((id) => id !== undefined), {
      message: 'nenhum id de perfil',
    }),
}

/** GET /v2/{account_id}/chats/{chat_id}/messages?limit=N. não confirmado: a lista vem pura, ou em items, messages ou data. */
const listChatMessages = {
  request: z.object({ account_id: nonBlank, chat_id: nonBlank, limit: z.number().int().min(1).max(100).optional() }),
  response: z.union([
    recordList,
    z.object({ items: recordList.optional(), messages: recordList.optional(), data: recordList.optional() })
      .transform((value) => value.items ?? value.messages ?? value.data ?? []),
  ]),
}

/** GET /v2/{account_id}/chats?limit=N: as conversas recentes (só para a conferência por conta). não confirmado: a lista vem pura, ou em items, chats ou data. */
const listChats = {
  request: z.object({ account_id: nonBlank, limit: z.number().int().min(1).max(100).optional() }),
  response: z.union([
    recordList,
    z.object({ items: recordList.optional(), chats: recordList.optional(), data: recordList.optional() })
      .transform((value) => value.items ?? value.chats ?? value.data ?? []),
  ]),
}

export const v2 = {
  createAuthLink,
  listAccounts,
  disconnectAccount,
  sendEmail,
  startChat,
  sendChatMessage,
  inviteLinkedIn,
  resolveProfile,
  listChatMessages,
  listChats,
}
