// A conferência por conta (canais-16): lista as contas da conexão e os últimos chats de cada uma, só lendo. É o que o
// script `unipile:conferir` imprime; mora aqui para ser testado sem rede. Nunca imprime a chave, nem o corpo de uma falha.
import type { ConnectableProvider, UnipileBridge } from './bridge.ts'
import { UnipileRequestError } from './errors.ts'

export interface ConferirConnection {
  name: string
  version: 'v1' | 'v2'
  baseUrl: string
}

export interface ConferirOptions {
  /** Quantos chats recentes mostrar por conta. */
  chats?: number
  /** Gera também um link de conexão (não conecta nada: quem abre o link é que conecta). */
  link?: { provider: ConnectableProvider; redirectUrl: string; notifyUrl?: string }
}

const MAX_ACCOUNTS_WITH_CHATS = 5

function failure(error: unknown): string {
  return error instanceof UnipileRequestError ? `HTTP ${error.status}` : error instanceof Error ? error.name : 'erro'
}

export async function conferir(
  bridge: UnipileBridge,
  connection: ConferirConnection,
  options: ConferirOptions = {},
): Promise<string[]> {
  const lines = [`Conexão: ${connection.name} (${connection.version}) em ${new URL(connection.baseUrl).host}`]
  const { accounts, complete } = await bridge.listAccounts()
  lines.push(`Contas: ${accounts.length}${complete ? '' : ' (há mais contas; só a primeira página)'}`)
  for (const [index, account] of accounts.entries()) {
    lines.push(`- ${account.id} ${account.provider} ${account.state}`)
    if (index >= MAX_ACCOUNTS_WITH_CHATS) continue
    try {
      const chats = await bridge.listChats(account.id, { limit: options.chats ?? 3 })
      const ids = chats.map((chat) => chat.id).filter((id): id is string => typeof id === 'string')
      lines.push(`  chats recentes: ${ids.length ? ids.join(', ') : '(sem chats)'}`)
    } catch (error) {
      lines.push(`  não foi possível listar os chats (${failure(error)})`)
    }
  }
  if (options.link) {
    const { url } = await bridge.createAuthLink({
      type: 'create',
      providers: [options.link.provider],
      attemptId: `conferir-${crypto.randomUUID()}`,
      redirectUrl: options.link.redirectUrl,
      notifyUrl: options.link.notifyUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    })
    lines.push(`Link de conexão (${options.link.provider}): ${url}`)
  }
  return lines
}
