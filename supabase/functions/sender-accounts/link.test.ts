// Que link a Unipile abre para conectar ou reconectar uma Conta remetente (ADR-0024). Depois da troca de conta Unipile, a
// Conta remetente de antes é de uma conexão que já não é a ativa: reconectar com o id antigo daria 404 na API nova, então
// o link é de conexão NOVA, e o banco grava o id novo na mesma linha (complete_sender_connection_attempt).
import { assertEquals } from 'jsr:@std/assert@1'
import { authLinkFor } from './link.ts'

Deno.test('conectar: link novo com os provedores do canal', () => {
  assertEquals(authLinkFor('connect', 'email', { provider_account_id: null }), {
    type: 'create',
    providers: ['google', 'outlook', 'imap'],
    reconnectAccountId: null,
  })
  assertEquals(authLinkFor('connect', 'whatsapp', { provider_account_id: null }).providers, ['whatsapp'])
  assertEquals(authLinkFor('connect', 'linkedin', { provider_account_id: null }).providers, ['linkedin'])
})

Deno.test('reconectar uma conta da conexão ativa: reconexão com o id dela na Unipile', () => {
  assertEquals(authLinkFor('reconnect', 'email', { provider_account_id: 'conta-v1-9' }), {
    type: 'reconnect',
    providers: undefined,
    reconnectAccountId: 'conta-v1-9',
  })
})

Deno.test('reconectar uma conta de outra conexão (o banco não devolve o id): link novo com os provedores do canal', () => {
  assertEquals(authLinkFor('reconnect', 'email', { provider_account_id: null }), {
    type: 'create',
    providers: ['google', 'outlook', 'imap'],
    reconnectAccountId: null,
  })
  assertEquals(authLinkFor('reconnect', 'linkedin', { provider_account_id: null }).type, 'create')
})
