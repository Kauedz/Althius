// O contrato da Unipile v1 (endereço próprio por cliente — o DSN —, prefixo /api/v1, a conta no corpo). TUDO aqui é
// "não confirmado": vem do mapa do protótipo (.scratch/handoffs/unipile-port-map.md, §1.3), que por sua vez diz ter
// conferido numa conta real, e a Althius ainda não falou com a v1. Quando uma operação não existe no protótipo
// (desconectar, convidar, resolver perfil, listar mensagens), o formato é o da documentação da v1 como lembrada e
// precisa ser conferido no primeiro envio real. Os chats v1 são multipart: o schema descreve os CAMPOS do formulário.
import {
  acknowledgement,
  chatSentResponse,
  customHeaders,
  emailAddress,
  httpsUrl,
  isoDateTime,
  looseId,
  nonBlank,
  profileDistanceFields,
  recordList,
} from './common.ts'
import { z } from './zod.ts'

/** POST /api/v1/hosted/accounts/link. O pedido volta no aviso do `notify_url` como `name` (não há `state`). */
const createAuthLink = {
  request: z.object({
    type: z.enum(['create', 'reconnect']),
    // Os nomes dos provedores vão em MAIÚSCULAS (LINKEDIN, WHATSAPP, MAIL, GOOGLE_OAUTH, OUTLOOK…).
    providers: z.array(nonBlank).min(1).optional(),
    reconnect_account: nonBlank.optional(),
    api_url: httpsUrl,
    expiresOn: isoDateTime,
    success_redirect_url: z.string().url(),
    notify_url: httpsUrl,
    name: nonBlank,
  }).refine((value) =>
    value.type === 'create' ? value.providers !== undefined && value.reconnect_account === undefined
      : value.reconnect_account !== undefined && value.providers === undefined, {
    message: 'create leva providers; reconnect leva reconnect_account',
  }),
  response: z.object({ url: httpsUrl }),
}

/** GET /api/v1/accounts?limit=250. O estado é uma LISTA de fontes: qualquer problema pede atenção. */
const listAccounts = {
  request: z.object({ limit: z.number().int().min(1).max(250).optional(), cursor: nonBlank.optional() }),
  response: z.object({
    items: z.array(z.object({
      id: nonBlank,
      type: nonBlank,
      created_at: z.string().optional(),
      // OK, CREDENTIALS, ERROR, STOPPED, PERMISSIONS…
      sources: z.array(z.object({ status: z.string() })).optional(),
    })),
    cursor: z.string().nullish(),
  }),
}

/** DELETE /api/v1/accounts/{id}. */
const disconnectAccount = {
  request: z.object({ account_id: nonBlank }),
  response: acknowledgement,
}

/** O cabeçalho `Idempotency-Key` do e-mail v1 é um UUID. */
const sendEmailIdempotencyKey = z.string().uuid()

/** POST /api/v1/emails (JSON): o corpo é HTML (`body`) e o destinatário é `identifier`. */
const sendEmail = {
  request: z.object({
    account_id: nonBlank,
    to: z.array(z.object({ identifier: emailAddress, display_name: z.string().optional() })).min(1),
    subject: z.string(),
    body: z.string(),
    custom_headers: customHeaders.optional(),
  }),
  // não confirmado: o campo do id do e-mail enviado (o protótipo aceita id/message_id nulos; a Althius exige o `id`).
  response: z.object({ id: nonBlank, message_id: z.string().nullish().catch(undefined) })
    .transform((value) => ({ id: value.id, message_id: value.message_id ?? null })),
}

/** POST /api/v1/chats (multipart): abre o chat e envia a primeira mensagem. */
const startChat = {
  request: z.object({ account_id: nonBlank, attendees_ids: z.array(nonBlank).min(1), text: nonBlank }),
  response: chatSentResponse,
}

/** POST /api/v1/chats/{chat_id}/messages (multipart). */
const sendChatMessage = {
  request: z.object({ account_id: nonBlank, text: nonBlank }),
  response: chatSentResponse,
}

/** POST /api/v1/users/invite. não confirmado: não há no protótipo. */
const inviteLinkedIn = {
  request: z.object({ account_id: nonBlank, provider_id: nonBlank, message: z.string().optional() }),
  response: z.object({ invitation_id: looseId, id: looseId })
    .refine((value) => value.invitation_id !== undefined || value.id !== undefined, { message: 'nenhum id' })
    .transform((value) => ({ id: (value.invitation_id ?? value.id) as string })),
}

/** GET /api/v1/users/{identifier}?account_id=. não confirmado: não há no protótipo. */
const resolveProfile = {
  request: z.object({ account_id: nonBlank, identifier: nonBlank }),
  response: z.object({ provider_id: looseId, id: looseId, ...profileDistanceFields })
    .passthrough()
    .refine((value) => value.provider_id !== undefined || value.id !== undefined, { message: 'nenhum id de perfil' }),
}

/** GET /api/v1/chats/{chat_id}/messages?account_id=&limit=. A paginação é por `cursor`. */
const listChatMessages = {
  request: z.object({ account_id: nonBlank, chat_id: nonBlank, limit: z.number().int().min(1).max(250).optional() }),
  response: z.object({ items: recordList.optional(), cursor: z.string().nullish() })
    .transform((value) => value.items ?? []),
}

export const v1 = {
  createAuthLink,
  listAccounts,
  disconnectAccount,
  sendEmail,
  sendEmailIdempotencyKey,
  startChat,
  sendChatMessage,
  inviteLinkedIn,
  resolveProfile,
  listChatMessages,
}
