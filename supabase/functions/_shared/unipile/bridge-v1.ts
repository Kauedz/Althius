// O adaptador da Unipile v1 (endereço próprio por cliente — o DSN —, prefixo /api/v1, a conta no corpo) atrás da ponte
// (canais-16). Portado do protótipo (Kauedz/althius-revenue-os: envio.ts, hospedado.ts, sincronizar.ts), que diz ter
// conferido o envio e a listagem numa conta v1 real. TUDO aqui continua "não confirmado" para a Althius até o primeiro
// uso real: o contrato está em v1.ts. O que a v1 ainda não faz (anexo, resposta em conversa de e-mail, ler e-mail e
// conversa de e-mail) recusa ANTES de chamar a Unipile, com um erro definitivo: nada sai pela metade.
import { readResponse } from './common.ts'
import { UnipileRequestError, UnipileUnsupportedOperationError } from './errors.ts'
import type { UnipileClient } from './client.ts'
import { CHAT_CHECK_MESSAGE_LIMIT, readChatSent, readLinkedInProfile } from './readers.ts'
import { v1 } from './v1.ts'
import { withConnectionNoticeKey } from './webhook-auth.ts'
import type { AccountState, ConnectableProvider, UnipileAccountSummary, UnipileBridge } from './bridge.ts'

const API = '/api/v1'

// Os nomes dos provedores no assistente da v1, em maiúsculas. Conferido numa conta v1 real: GOOGLE, OUTLOOK e MAIL dão
// 201; IMAP dá 400 invalid_parameters. E-mail por IMAP é MAIL (e a v1 devolve esse tipo como IMAP na lista de contas).
const V1_PROVIDER: Record<ConnectableProvider, string> = {
  google: 'GOOGLE',
  outlook: 'OUTLOOK',
  imap: 'MAIL',
  whatsapp: 'WHATSAPP',
  linkedin: 'LINKEDIN',
}

/** A v1 espera o corpo do e-mail em HTML: o texto da Althius sai escapado, com <br> nas quebras de linha. */
export function plainTextToHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * A v1 exige a chave de idempotência do e-mail em formato UUID. A nossa (o id do Envio, no cabeçalho X-Althius-Envio) vira
 * um UUID estável: a mesma chave dá o mesmo UUID, e uma repetição do mesmo envio não duplica o e-mail.
 */
export async function idempotencyUuid(key: string): Promise<string> {
  if (UUID.test(key)) return key.toLowerCase()
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key)))
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const WHATSAPP_ID = /^[0-9]{8,15}@(s\.whatsapp\.net|lid)$/

/** O número da própria conta de WhatsApp, no formato do remetente das mensagens: o id da conta ou, sem ele, o telefone. */
export function whatsappOwnId(im: { id?: string; phone_number?: string } | undefined): string | undefined {
  if (im?.id && WHATSAPP_ID.test(im.id)) return im.id
  const digits = (im?.phone_number ?? '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : undefined
}

function accountState(sources: { status: string }[] | undefined): AccountState {
  if (!sources?.length) return 'unknown'
  // OK é a única fonte sã; CREDENTIALS, ERROR, STOPPED, PERMISSIONS… pedem atenção.
  return sources.every((source) => source.status.toUpperCase() === 'OK') ? 'connected' : 'attention'
}

export function createV1Bridge(client: UnipileClient, options: { webhookSecret?: string | null } = {}): UnipileBridge {
  const unsupported = (operation: string): never => {
    throw new UnipileUnsupportedOperationError(operation, 'v1')
  }

  return {
    version: 'v1',

    // ---- E-mail ----
    async sendEmail(accountId, email, { signal }) {
      if (email.attachments?.length) unsupported('sendEmail com anexo')
      if (email.reply_to_message_id) unsupported('sendEmail como resposta na conversa')
      const envio = email.custom_headers.find((header) => header.name.toLowerCase() === 'x-althius-envio')?.value
      return await client.json(`${API}/emails`, {
        method: 'POST',
        json: {
          account_id: accountId,
          to: email.to.map((to) => ({ identifier: to.email, ...(to.display_name ? { display_name: to.display_name } : {}) })),
          subject: email.subject,
          body: plainTextToHtml(email.plain_text),
          custom_headers: email.custom_headers,
        },
        headers: { 'Idempotency-Key': envio ? await idempotencyUuid(envio) : crypto.randomUUID() },
        signal,
      }, v1.sendEmail.response)
    },
    // não confirmado: a v1 lê e-mail e conversa de e-mail por endpoints que o protótipo não usa. Enquanto não houver
    // conta v1 real para conferir, recusam; o núcleo do envio então não confere a conversa antes do próximo e-mail.
    getEmail: () => Promise.reject(new UnipileUnsupportedOperationError('getEmail', 'v1')),
    listThreadEmails: () => Promise.reject(new UnipileUnsupportedOperationError('listThreadEmails', 'v1')),
    listEmailSenders: () => Promise.reject(new UnipileUnsupportedOperationError('listEmailSenders', 'v1')),

    // ---- Conversas (multipart; a conta vai no corpo) ----
    async startChat(accountId, { userId, text, attachments }, { signal }) {
      if (attachments?.length) unsupported('startChat com anexo')
      return readChatSent(
        await client.json(`${API}/chats`, { method: 'POST', form: { account_id: accountId, attendees_ids: userId, text }, signal }),
        null,
        'v1',
      )
    },
    async sendChatMessage(accountId, chatId, text, { signal, attachments }) {
      if (attachments?.length) unsupported('sendChatMessage com anexo')
      return readChatSent(
        await client.json(`${API}/chats/${encodeURIComponent(chatId)}/messages`, {
          method: 'POST',
          form: { account_id: accountId, text },
          signal,
        }),
        chatId,
        'v1',
      )
    },
    // não confirmado: convite, perfil e mensagens da conversa não existem no protótipo; o formato é o da documentação
    // da v1 como lembrada.
    async sendInvitation(accountId, { userId, message }, { signal }) {
      return await client.json(
        `${API}/users/invite`,
        { method: 'POST', json: { account_id: accountId, provider_id: userId, message }, signal },
        v1.inviteLinkedIn.response,
      )
    },
    async getLinkedInProfile(accountId, identifier, { signal }) {
      return readLinkedInProfile(
        await client.json(`${API}/users/${encodeURIComponent(identifier)}`, { query: { account_id: accountId }, signal }),
        'v1',
      )
    },
    async listChatMessages(accountId, chatId) {
      return await client.json(
        `${API}/chats/${encodeURIComponent(chatId)}/messages`,
        { query: { account_id: accountId, limit: CHAT_CHECK_MESSAGE_LIMIT } },
        v1.listChatMessages.response,
      )
    },

    // ---- Contas ----
    async createAuthLink(request, { signal } = {}) {
      if (!request.notifyUrl) throw new UnipileUnsupportedOperationError('createAuthLink sem o endereço de aviso (notify_url)', 'v1')
      const reconnecting = request.type === 'reconnect'
      const data = await client.json(`${API}/hosted/accounts/link`, {
        method: 'POST',
        json: {
          type: request.type,
          ...(reconnecting
            ? { reconnect_account: request.reconnectAccountId }
            : { providers: (request.providers ?? []).map((provider) => V1_PROVIDER[provider]) }),
          // O endereço do cliente (DSN): a Unipile v1 o pede no pedido do link.
          api_url: client.baseUrl,
          expiresOn: request.expiresAt.toISOString(),
          success_redirect_url: request.redirectUrl,
          // O aviso do link não aceita cabeçalho: a chave ?k= do pedido o autentica (webhook-auth.ts, canais-17).
          notify_url: options.webhookSecret
            ? await withConnectionNoticeKey(request.notifyUrl, options.webhookSecret, request.attemptId)
            : request.notifyUrl,
          // Na v1 o pedido volta no aviso do notify_url como `name` (não há `state`).
          name: request.attemptId,
        },
        signal,
      })
      return { url: readResponse(v1.createAuthLink.response, data).url }
    },
    async disconnectAccount(accountId, { signal } = {}) {
      try {
        await client.request(`${API}/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE', signal })
        return 'disconnected'
      } catch (error) {
        if (error instanceof UnipileRequestError && error.status === 404) return 'already_gone'
        throw error
      }
    },
    async listAccounts({ signal } = {}) {
      const data = await client.json(`${API}/accounts`, { query: { limit: 250 }, signal }, v1.listAccounts.response)
      const accounts: UnipileAccountSummary[] = data.items.map((item) => {
        const own = item.type.toUpperCase() === 'WHATSAPP' ? whatsappOwnId(item.connection_params?.im) : undefined
        return {
          id: item.id,
          provider: item.type,
          state: accountState(item.sources),
          createdAt: item.created_at ?? null,
          ...(own ? { ownProviderId: own } : {}),
        }
      })
      return { accounts, complete: !data.cursor }
    },
    async listChats(accountId, { limit = 3, signal } = {}) {
      return await client.json(`${API}/chats`, { query: { account_id: accountId, limit }, signal }, v1.listChats.response)
    },
    // não confirmado: o endereço do anexo recebido na v1.
    async downloadEmailAttachment(accountId, emailId, attachment) {
      return await client.bytes(
        attachment.url && /^https:\/\//.test(attachment.url)
          ? attachment.url
          : `${API}/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachment.id)}?account_id=${encodeURIComponent(accountId)}`,
      )
    },
  }
}
