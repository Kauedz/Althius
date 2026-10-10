// Que link a Unipile abre para conectar ou reconectar uma Conta remetente (ADR-0024).
//
// Reconectar pede o id da conta na Unipile ATIVA. Depois da troca de conta, a linha antiga é de uma conexão que já não é a
// ativa e o banco não devolve o id (create_sender_connection_attempt): o link então é de conexão NOVA, com os provedores do
// canal, e a tentativa continua ligada à mesma linha, que recebe o id novo (complete_sender_connection_attempt).
import type { ConnectableProvider } from '../_shared/unipile/index.ts'

export type Channel = 'email' | 'whatsapp' | 'linkedin'

export function providerNames(channel: Channel): ConnectableProvider[] {
  if (channel === 'email') return ['google', 'outlook', 'imap']
  if (channel === 'whatsapp') return ['whatsapp']
  return ['linkedin']
}

export function authLinkFor(
  action: 'connect' | 'reconnect',
  channel: Channel,
  attempt: { provider_account_id: string | null },
): { type: 'create' | 'reconnect'; providers: ConnectableProvider[] | undefined; reconnectAccountId: string | null } {
  if (action === 'reconnect' && attempt.provider_account_id) {
    return { type: 'reconnect', providers: undefined, reconnectAccountId: attempt.provider_account_id }
  }
  return { type: 'create', providers: providerNames(channel), reconnectAccountId: null }
}
