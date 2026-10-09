// Cada operação, por versão: um pedido e uma resposta de exemplo válidos e um par inválido. Os exemplos v2 vêm do que o
// código já manda e lê; os v1 vêm do mapa do protótipo (.scratch/handoffs/unipile-port-map.md, §1.3) e são "não confirmados".
import { assertEquals } from 'jsr:@std/assert@1'
import type { ZodTypeAny } from './zod.ts'
import { UNIPILE_OPERATIONS, v1, v2 } from './index.ts'

interface Example {
  request: unknown
  badRequest: unknown
  response: unknown
  badResponse: unknown
  /** O que a resposta válida vira depois do parse, quando o schema normaliza. */
  parsed?: unknown
}

const attachment = { filename: 'proposta.pdf', content_type: 'application/pdf', content: 'JVBERi0=' }
const messages = [{ id: 'm1', text: 'oi' }]

const examples: Record<'v1' | 'v2', Record<(typeof UNIPILE_OPERATIONS)[number], Example>> = {
  v2: {
    createAuthLink: {
      request: {
        expires_on: '2026-10-09T12:15:00.000Z',
        redirect_uri: 'https://app.althius.com.br/conexoes',
        state: '6f1c9f64-3d0b-4f43-8a4b-0c8a8d5b7e11',
        providers: ['linkedin'],
      },
      badRequest: { expires_on: 'amanhã', redirect_uri: 'https://app.althius.com.br/conexoes', state: 's' },
      response: { link: 'https://account.unipile.com/abc' },
      parsed: { link: 'https://account.unipile.com/abc' },
      badResponse: { link: 'http://inseguro.example/abc' },
    },
    listAccounts: {
      request: { limit: 100 },
      badRequest: { limit: 0 },
      response: { data: [{ id: 'acc-1', provider: 'linkedin', status: 'running', created_at: '2026-10-01T00:00:00Z' }], has_more: false },
      badResponse: { data: [{ provider: 'linkedin' }] },
    },
    disconnectAccount: {
      request: { account_id: 'acc-1' },
      badRequest: { account_id: '' },
      response: { object: 'AccountDeleted' },
      badResponse: 'ok',
    },
    sendEmail: {
      request: {
        to: [{ email: 'maria@empresa.com.br', display_name: 'Maria' }],
        subject: 'Olá',
        plain_text: 'Corpo',
        custom_headers: [{ name: 'X-Althius-Envio', value: 'send-1' }],
        attachments: [attachment],
      },
      badRequest: { to: [], subject: 'Olá', plain_text: 'Corpo', custom_headers: [] },
      response: { object: 'EmailSent', id: 'em-1', message_id: '<abc@mail>' },
      parsed: { id: 'em-1', message_id: '<abc@mail>' },
      badResponse: { object: 'EmailSent', message_id: '<abc@mail>' },
    },
    startChat: {
      request: { users_ids: ['5511988887777@s.whatsapp.net'], text: 'Olá', attachments: [attachment] },
      badRequest: { users_ids: [], text: 'Olá' },
      response: { chat_id: 'chat-1', message_id: 'msg-1' },
      parsed: { chat_id: 'chat-1', message_id: 'msg-1', id: null },
      badResponse: { object: 'ChatSent' },
    },
    sendChatMessage: {
      request: { text: 'Oi de novo' },
      badRequest: { text: '' },
      response: { id: 'msg-2' },
      parsed: { chat_id: null, message_id: null, id: 'msg-2' },
      badResponse: {},
    },
    inviteLinkedIn: {
      request: { user_id: 'ACoAAMaria', message: 'Vamos nos conectar?' },
      badRequest: { message: 'sem destinatário' },
      response: { id: 'inv-1' },
      parsed: { id: 'inv-1' },
      badResponse: { object: 'RelationRequestSent' },
    },
    resolveProfile: {
      request: { account_id: 'acc-1', identifier: 'maria-souza' },
      badRequest: { account_id: 'acc-1' },
      response: { id: 'ACoAAMaria', network_distance: 'FIRST_DEGREE' },
      badResponse: { network_distance: 'FIRST_DEGREE' },
    },
    listChatMessages: {
      request: { account_id: 'acc-1', chat_id: 'chat-1', limit: 50 },
      badRequest: { account_id: 'acc-1' },
      response: { items: messages },
      parsed: messages,
      badResponse: 'texto solto',
    },
    listChats: {
      request: { account_id: 'acc-1', limit: 3 },
      badRequest: { account_id: 'acc-1', limit: 0 },
      response: { items: [{ id: 'chat-1' }] },
      parsed: [{ id: 'chat-1' }],
      badResponse: 'texto solto',
    },
  },
  v1: {
    createAuthLink: {
      request: {
        type: 'create',
        providers: ['LINKEDIN'],
        api_url: 'https://api68.unipile.com:19840',
        expiresOn: '2026-10-09T12:15:00.000Z',
        success_redirect_url: 'https://app.althius.com.br/conexoes',
        notify_url: 'https://xyz.supabase.co/functions/v1/unipile-account-status?k=abc',
        name: '6f1c9f64-3d0b-4f43-8a4b-0c8a8d5b7e11',
      },
      badRequest: {
        type: 'reconnect',
        api_url: 'https://api68.unipile.com:19840',
        expiresOn: '2026-10-09T12:15:00.000Z',
        success_redirect_url: 'https://app.althius.com.br/conexoes',
        notify_url: 'https://xyz.supabase.co/functions/v1/unipile-account-status',
        name: 'n',
      },
      response: { url: 'https://account.unipile.com/v1/abc' },
      badResponse: { link: 'https://account.unipile.com/v1/abc' },
    },
    listAccounts: {
      request: { limit: 250 },
      badRequest: { limit: 1000 },
      response: { items: [{ id: 'acc-1', type: 'LINKEDIN', sources: [{ status: 'OK' }] }], cursor: null },
      badResponse: { items: [{ type: 'LINKEDIN' }] },
    },
    disconnectAccount: {
      request: { account_id: 'acc-1' },
      badRequest: {},
      response: { object: 'AccountDeleted' },
      badResponse: 'ok',
    },
    sendEmail: {
      request: {
        account_id: 'acc-1',
        to: [{ identifier: 'maria@empresa.com.br' }],
        subject: 'Olá',
        body: '<p>Corpo</p>',
        custom_headers: [{ name: 'X-Althius-Envio', value: 'send-1' }],
      },
      badRequest: { account_id: 'acc-1', to: [{ email: 'maria@empresa.com.br' }], subject: 'Olá', body: 'x' },
      response: { id: 'em-1' },
      parsed: { id: 'em-1', message_id: null },
      badResponse: {},
    },
    startChat: {
      request: { account_id: 'acc-1', attendees_ids: ['5511988887777@s.whatsapp.net'], text: 'Olá' },
      badRequest: { account_id: 'acc-1', attendees_ids: [], text: 'Olá' },
      response: { chat_id: 'chat-1', message_id: 'msg-1' },
      parsed: { chat_id: 'chat-1', message_id: 'msg-1', id: null },
      badResponse: { object: 'ChatStarted' },
    },
    sendChatMessage: {
      request: { account_id: 'acc-1', text: 'Oi de novo' },
      badRequest: { text: 'sem conta' },
      response: { message_id: 'msg-2' },
      parsed: { chat_id: null, message_id: 'msg-2', id: null },
      badResponse: {},
    },
    inviteLinkedIn: {
      request: { account_id: 'acc-1', provider_id: 'ACoAAMaria', message: 'Vamos nos conectar?' },
      badRequest: { account_id: 'acc-1', message: 'sem destinatário' },
      response: { invitation_id: 'inv-1' },
      parsed: { id: 'inv-1' },
      badResponse: { object: 'UserInvitationSent' },
    },
    resolveProfile: {
      request: { account_id: 'acc-1', identifier: 'maria-souza' },
      badRequest: { identifier: 'maria-souza' },
      response: { provider_id: 'ACoAAMaria', network_distance: 'FIRST_DEGREE' },
      badResponse: { network_distance: 'FIRST_DEGREE' },
    },
    listChatMessages: {
      request: { account_id: 'acc-1', chat_id: 'chat-1', limit: 50 },
      badRequest: { account_id: 'acc-1' },
      response: { items: messages, cursor: null },
      parsed: messages,
      badResponse: 'texto solto',
    },
    listChats: {
      request: { account_id: 'acc-1', limit: 3 },
      badRequest: { account_id: '', limit: 3 },
      response: { items: [{ id: 'chat-1' }], cursor: null },
      parsed: [{ id: 'chat-1' }],
      badResponse: 'texto solto',
    },
  },
}

const contracts = { v1, v2 } as unknown as Record<'v1' | 'v2', Record<string, { request: ZodTypeAny; response: ZodTypeAny }>>

for (const version of ['v2', 'v1'] as const) {
  for (const operation of UNIPILE_OPERATIONS) {
    const example = examples[version][operation]
    const schemas = contracts[version][operation]
    Deno.test(`${version} ${operation}: pedido e resposta válidos passam, inválidos não`, () => {
      assertEquals(schemas.request.safeParse(example.request).success, true, 'pedido válido')
      assertEquals(schemas.request.safeParse(example.badRequest).success, false, 'pedido inválido')
      const response = schemas.response.safeParse(example.response)
      assertEquals(response.success, true, 'resposta válida')
      if (response.success && 'parsed' in example) assertEquals(response.data, example.parsed)
      assertEquals(schemas.response.safeParse(example.badResponse).success, false, 'resposta inválida')
    })
  }
}

Deno.test('v2: a resposta do link também vem dentro de data', () => {
  const parsed = v2.createAuthLink.response.parse({ data: { link: 'https://account.unipile.com/abc' } })
  assertEquals(parsed, { link: 'https://account.unipile.com/abc' })
})

Deno.test('v2: o link de conexão leva providers (novo) ou account_id (reconexão), nunca os dois nem nenhum', () => {
  const base = { expires_on: '2026-10-09T12:15:00.000Z', redirect_uri: 'https://app.althius.com.br/conexoes', state: 's' }
  assertEquals(v2.createAuthLink.request.safeParse({ ...base, account_id: 'acc-1' }).success, true)
  assertEquals(v2.createAuthLink.request.safeParse({ ...base, providers: ['x'], account_id: 'acc-1' }).success, false)
  assertEquals(v2.createAuthLink.request.safeParse(base).success, false)
})

Deno.test('v2: ids numéricos viram texto, como o firstString de antes', () => {
  assertEquals(v2.inviteLinkedIn.response.parse({ id: 42 }), { id: '42' })
})

Deno.test('v2: a lista de mensagens aceita lista pura, items, messages ou data, e descarta o que não é objeto', () => {
  assertEquals(v2.listChatMessages.response.parse([{ id: 'm1' }, 'lixo', null]), [{ id: 'm1' }])
  assertEquals(v2.listChatMessages.response.parse({ messages: [{ id: 'm2' }] }), [{ id: 'm2' }])
  assertEquals(v2.listChatMessages.response.parse({ data: [{ id: 'm3' }] }), [{ id: 'm3' }])
  assertEquals(v2.listChatMessages.response.parse({}), [])
})

Deno.test('v1: reconexão leva reconnect_account; criação leva providers', () => {
  const base = {
    api_url: 'https://api68.unipile.com:19840',
    expiresOn: '2026-10-09T12:15:00.000Z',
    success_redirect_url: 'https://app.althius.com.br/conexoes',
    notify_url: 'https://xyz.supabase.co/functions/v1/unipile-account-status',
    name: 'n',
  }
  assertEquals(v1.createAuthLink.request.safeParse({ ...base, type: 'reconnect', reconnect_account: 'acc-1' }).success, true)
  assertEquals(v1.createAuthLink.request.safeParse({ ...base, type: 'create', providers: ['LINKEDIN'] }).success, true)
  assertEquals(v1.createAuthLink.request.safeParse({ ...base, type: 'create' }).success, false)
})

Deno.test('v1: o cabeçalho Idempotency-Key do e-mail é um UUID', () => {
  assertEquals(v1.sendEmailIdempotencyKey.safeParse('6f1c9f64-3d0b-4f43-8a4b-0c8a8d5b7e11').success, true)
  assertEquals(v1.sendEmailIdempotencyKey.safeParse('send-1').success, false)
})

Deno.test('v1: o estado da conta é uma lista; qualquer fonte com problema pede atenção', () => {
  const parsed = v1.listAccounts.response.parse({ items: [{ id: 'a', type: 'MAIL', sources: [{ status: 'OK' }, { status: 'CREDENTIALS' }] }] })
  assertEquals(parsed.items[0].sources?.map((source) => source.status), ['OK', 'CREDENTIALS'])
})
