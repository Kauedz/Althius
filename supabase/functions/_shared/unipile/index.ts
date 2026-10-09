// O contrato da Unipile em TypeScript e Zod (ADR-0024): configuração, pedidos e respostas por versão, eventos de webhook
// e erros tipados. Nada aqui chama a Unipile nem decide regra de negócio. O Zod só entra por ./zod.ts.
export * from './config.ts'
export * from './errors.ts'
export * from './events.ts'
export { readResponse } from './common.ts'
export { v1 } from './v1.ts'
export { v2 } from './v2.ts'

/** As operações que a Althius faz na Unipile; cada versão tem pedido e resposta para todas. */
export const UNIPILE_OPERATIONS = [
  'createAuthLink',
  'listAccounts',
  'disconnectAccount',
  'sendEmail',
  'startChat',
  'sendChatMessage',
  'inviteLinkedIn',
  'resolveProfile',
  'listChatMessages',
] as const

export type UnipileOperation = (typeof UNIPILE_OPERATIONS)[number]
