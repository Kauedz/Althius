// A ponte com a Unipile (canais-16, ADR-0024): a ÚNICA porta que o Executor, o `sender-accounts`, o envio de respostas e
// o webhook enxergam. Por trás dela há um adaptador por versão da API (bridge-v2.ts, bridge-v1.ts), e só o da conexão
// ativa roda. Quem usa a ponte nunca sabe a versão nem o endereço: pede "enviar e-mail" e a ponte traduz.
import { createUnipileClient, type UnipileClient } from './client.ts'
import { createV1Bridge } from './bridge-v1.ts'
import { createV2Bridge } from './bridge-v2.ts'
import type { OutgoingEmail, UnipileMail } from '../send-step.ts'
import type { UnipileChat } from '../send-chat-step.ts'

export type UnipileApiVersion = 'v1' | 'v2'

/** Os provedores de conta que a Althius conecta, pelo nome nosso (a v1 os traduz para os dela). */
export type ConnectableProvider = 'google' | 'outlook' | 'imap' | 'whatsapp' | 'linkedin'

export interface AuthLinkRequest {
  type: 'create' | 'reconnect'
  /** Conexão nova: os provedores que o assistente oferece. */
  providers?: ConnectableProvider[]
  /** Reconexão: o id da conta na Unipile. */
  reconnectAccountId?: string | null
  /** O id do pedido no nosso banco: volta no aviso da Unipile (v2: `state`; v1: `name`). */
  attemptId: string
  /** Para onde a pessoa volta depois de conectar. */
  redirectUrl: string
  expiresAt: Date
  /** Só na v1: o endereço que a Unipile avisa quando a conta é conectada. */
  notifyUrl?: string
}

export type AccountState = 'connected' | 'attention' | 'disconnected' | 'unknown'

export interface UnipileAccountSummary {
  id: string
  provider: string
  state: AccountState
  createdAt: string | null
}

export interface DownloadedAttachment {
  bytes: Uint8Array
  contentType: string | null
}

/** O que a ponte faz além de enviar e ler conversas. */
export interface UnipileAccounts {
  /** O link do assistente hospedado de conexão. Só https. */
  createAuthLink(request: AuthLinkRequest, options?: { signal?: AbortSignal }): Promise<{ url: string }>
  /** Uma conta que a Unipile já não tem (404) conta como desconectada. */
  disconnectAccount(accountId: string, options?: { signal?: AbortSignal }): Promise<'disconnected' | 'already_gone'>
  /** A primeira página das contas. `complete` é falso quando há mais páginas: quem usa não conclui que uma conta sumiu. */
  listAccounts(options?: { signal?: AbortSignal }): Promise<{ accounts: UnipileAccountSummary[]; complete: boolean }>
  /** As conversas mais recentes da conta, só para a conferência por conta (diagnóstico). */
  listChats(accountId: string, options?: { limit?: number; signal?: AbortSignal }): Promise<Record<string, unknown>[]>
  /**
   * Baixa um anexo de e-mail recebido. A chave só vai ao endereço da conexão: uma URL que veio no evento, de outro
   * endereço, é baixada sem ela.
   */
  downloadEmailAttachment(
    accountId: string,
    emailId: string,
    attachment: { id: string; url?: string | null },
  ): Promise<DownloadedAttachment>
}

export interface UnipileBridge extends UnipileMail, UnipileChat, UnipileAccounts {
  readonly version: UnipileApiVersion
}

export type { OutgoingEmail }

export interface ActiveBridgeConnection {
  version: UnipileApiVersion
  baseUrl: string
  apiKey: string
}

export interface CreateBridgeOptions {
  fetch?: typeof fetch
  timeoutMs?: number
}

/** O adaptador da versão da conexão ativa, sobre o cliente único. */
export function createBridge(connection: ActiveBridgeConnection, options: CreateBridgeOptions = {}): UnipileBridge {
  const client: UnipileClient = createUnipileClient({
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  })
  return connection.version === 'v1' ? createV1Bridge(client) : createV2Bridge(client)
}
