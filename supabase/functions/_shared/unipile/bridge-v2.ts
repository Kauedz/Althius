// O adaptador da Unipile v2 (https://api.unipile.com, prefixo /v2/{account_id}/…) atrás da ponte (canais-16). É o que
// os adaptadores de e-mail e de conversa faziam, movido para atrás da interface e sobre o cliente único: o contrato de
// cada operação está em v2.ts. Os campos "não confirmados" têm o aviso lá e em readers.ts.
import { readResponse } from './common.ts'
import { UnipileUnreadableResponse } from './errors.ts'
import { UnipileRequestError } from './errors.ts'
import type { UnipileClient } from './client.ts'
import { CHAT_CHECK_MESSAGE_LIMIT, readChatSent, readLinkedInProfile, START_CHAT_USERS_FIELD } from './readers.ts'
import { v2 } from './v2.ts'
import type { AccountState, UnipileAccountSummary, UnipileBridge } from './bridge.ts'

const account = (accountId: string) => `/v2/${encodeURIComponent(accountId)}`

function accountState(status: string | undefined): AccountState {
  if (status === 'running') return 'connected'
  if (status === 'errored' || status === 'disconnected') return 'attention'
  return 'unknown'
}

export function createV2Bridge(client: UnipileClient): UnipileBridge {
  const objects = (list: unknown): Record<string, unknown>[] =>
    Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []

  return {
    version: 'v2',

    // ---- E-mail ----
    async sendEmail(accountId, email, { signal }) {
      // Sem o `id`, o e-mail provavelmente saiu: a resposta é ilegível e o envio fica incerto.
      return await client.json(`${account(accountId)}/emails/send`, { method: 'POST', json: email, signal }, v2.sendEmail.response)
    },
    async getEmail(accountId, emailId) {
      const data = await client.json(`${account(accountId)}/emails/${encodeURIComponent(emailId)}`)
      if (!data || typeof data !== 'object') throw new UnipileUnreadableResponse()
      return data as Record<string, unknown>
    },
    async listThreadEmails(accountId, threadId) {
      const data = await client.json(`${account(accountId)}/threads/${encodeURIComponent(threadId)}`) as
        | Record<string, unknown>
        | unknown[]
        | null
      const list = Array.isArray(data) ? data : data?.emails ?? data?.items ?? data?.messages ?? []
      return objects(list)
    },
    async listEmailSenders(accountId) {
      const data = await client.json(`${account(accountId)}/email-senders`) as Record<string, unknown> | unknown[] | null
      const list = Array.isArray(data) ? data : data?.items ?? data?.senders ?? []
      if (!Array.isArray(list)) return []
      return list
        .map((item) => {
          if (typeof item === 'string') return item
          const entry = item as Record<string, unknown> | null
          return entry?.email ?? entry?.address ?? entry?.identifier
        })
        .filter((value): value is string => typeof value === 'string' && value.includes('@'))
        .map((value) => value.trim().toLowerCase())
    },

    // ---- Conversas ----
    // Os anexos (canais-10) vão no mesmo JSON, com o conteúdo em base64, como no e-mail da v2.
    // não confirmado: o campo `attachments` e o formato de cada item no envio de mensagem da v2.
    async startChat(accountId, { userId, text, attachments }, { signal }) {
      return readChatSent(
        await client.json(`${account(accountId)}/chats/send`, {
          method: 'POST',
          json: { [START_CHAT_USERS_FIELD]: [userId], text, ...(attachments?.length ? { attachments } : {}) },
          signal,
        }),
      )
    },
    async sendChatMessage(accountId, chatId, text, { signal, attachments }) {
      return readChatSent(
        await client.json(`${account(accountId)}/chats/${encodeURIComponent(chatId)}/messages/send`, {
          method: 'POST',
          json: { text, ...(attachments?.length ? { attachments } : {}) },
          signal,
        }),
        chatId,
      )
    },
    async sendInvitation(accountId, { userId, message }, { signal }) {
      return await client.json(
        `${account(accountId)}/users/me/relation-requests`,
        { method: 'POST', json: { user_id: userId, message }, signal },
        v2.inviteLinkedIn.response,
      )
    },
    async getLinkedInProfile(accountId, identifier, { signal }) {
      return readLinkedInProfile(await client.json(`${account(accountId)}/users/${encodeURIComponent(identifier)}`, { signal }))
    },
    async listChatMessages(accountId, chatId) {
      return await client.json(
        `${account(accountId)}/chats/${encodeURIComponent(chatId)}/messages`,
        { query: { limit: CHAT_CHECK_MESSAGE_LIMIT } },
        v2.listChatMessages.response,
      )
    },

    // ---- Contas ----
    async createAuthLink(request, { signal } = {}) {
      const reconnecting = request.type === 'reconnect'
      const data = await client.json('/v2/auth/link', {
        method: 'POST',
        json: {
          expires_on: request.expiresAt.toISOString(),
          // Volta para a origem de onde o pedido saiu: voltar para outra perde a sessão e o Workspace escolhido.
          redirect_uri: request.redirectUrl,
          state: request.attemptId,
          ...(reconnecting ? { account_id: request.reconnectAccountId } : { providers: request.providers }),
        },
        signal,
      })
      return { url: readResponse(v2.createAuthLink.response, data).link }
    },
    async disconnectAccount(accountId, { signal } = {}) {
      try {
        await client.request(`/v2/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE', signal })
        return 'disconnected'
      } catch (error) {
        // Uma conta que a Unipile já não tem está desconectada.
        if (error instanceof UnipileRequestError && error.status === 404) return 'already_gone'
        throw error
      }
    },
    async listAccounts({ signal } = {}) {
      const data = await client.json('/v2/accounts/', { query: { limit: 100 }, signal }, v2.listAccounts.response)
      const accounts: UnipileAccountSummary[] = data.data.map((item) => ({
        id: item.id,
        provider: item.provider,
        state: accountState(item.status),
        createdAt: item.created_at ?? null,
      }))
      return { accounts, complete: data.has_more !== true }
    },
    async listChats(accountId, { limit = 3, signal } = {}) {
      return await client.json(`${account(accountId)}/chats`, { query: { limit }, signal }, v2.listChats.response)
    },
    async downloadEmailAttachment(accountId, emailId, attachment) {
      return await client.bytes(
        attachment.url && /^https:\/\//.test(attachment.url)
          ? attachment.url
          : `${account(accountId)}/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachment.id)}`,
      )
    },
  }
}
