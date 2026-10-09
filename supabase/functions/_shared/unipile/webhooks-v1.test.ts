// O registro dos webhooks da Unipile v1 (canais-17): o plano é puro (o que criar, o que já existe, o que avisar), e o corpo
// do pedido nunca é impresso com o segredo.
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { describeV1Webhook, planV1Webhooks, V1_WEBHOOKS, v1WebhookRequest } from './webhooks-v1.ts'

const URL_ALVO = 'https://projeto.supabase.co/functions/v1/unipile-account-status'
const auth = [{ key: 'Unipile-Auth', value: 'segredo-que-nao-pode-aparecer' }]

Deno.test('v1: são 4 webhooks, os do protótipo: mensagens, e-mail, estado da conta e relações', () => {
  assertEquals(V1_WEBHOOKS.map((hook) => [hook.name, hook.source, hook.events]), [
    ['althius-mensagens', 'messaging', ['message_received']],
    ['althius-email', 'email', ['mail_received']],
    ['althius-contas', 'account_status', ['creation_success', 'reconnected', 'sync_success', 'stopped', 'ok', 'error', 'credentials', 'permissions', 'deleted']],
    ['althius-relacoes', 'users', ['new_relation']],
  ])
})

Deno.test('v1: o pedido leva o segredo no cabeçalho Unipile-Auth e a descrição não o mostra', () => {
  const request = v1WebhookRequest(V1_WEBHOOKS[0], URL_ALVO, 'segredo-de-16-ou-mais')
  assertEquals(request, {
    request_url: URL_ALVO,
    name: 'althius-mensagens',
    source: 'messaging',
    events: ['message_received'],
    format: 'json',
    enabled: true,
    headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Unipile-Auth', value: 'segredo-de-16-ou-mais' }],
  })
  assertEquals(describeV1Webhook(V1_WEBHOOKS[0]).includes('segredo'), false)
  assertThrows(() => v1WebhookRequest(V1_WEBHOOKS[0], URL_ALVO, 'curto'))
  assertThrows(() => v1WebhookRequest(V1_WEBHOOKS[0], 'http://inseguro/x', 'segredo-de-16-ou-mais'))
})

Deno.test('v1: sem webhooks, cria os 4; com o da fonte já apontando para o endereço e com o cabeçalho, não repete', () => {
  assertEquals(planV1Webhooks([], URL_ALVO).create.length, 4)
  const plan = planV1Webhooks(
    [{ id: 'AAA', name: 'AAA', source: 'account_status', request_url: URL_ALVO, headers: auth }],
    URL_ALVO,
  )
  assertEquals(plan.create.map((hook) => hook.source), ['messaging', 'email', 'users'])
  assertEquals(plan.existing.map((hook) => hook.source), ['account_status'])
  assertEquals(plan.unauthenticated, [])
  assertEquals(plan.others, [])
})

Deno.test('v1: webhook da mesma fonte e endereço SEM o cabeçalho é avisado, e webhook de outro endereço também; nada é apagado', () => {
  const plan = planV1Webhooks(
    [
      { id: 'w1', name: 'sem-cabecalho', source: 'messaging', request_url: URL_ALVO, headers: [] },
      { id: 'w2', name: 'antigo', source: 'email', request_url: 'https://antigo.example.com/hook' },
    ],
    URL_ALVO,
  )
  assertEquals(plan.unauthenticated.map((hook) => hook.id), ['w1'])
  assertEquals(plan.others.map((hook) => hook.id), ['w2'])
  assertEquals(plan.create.length, 4)
  assertEquals(Object.keys(plan).sort(), ['create', 'existing', 'others', 'unauthenticated'])
})

Deno.test('v1: se a listagem não devolve os cabeçalhos, o webhook da fonte conta como existente (não duplica o aviso)', () => {
  const plan = planV1Webhooks([{ id: 'AAA', source: 'account_status', request_url: URL_ALVO }], URL_ALVO)
  assertEquals(plan.existing.map((hook) => hook.source), ['account_status'])
  assertEquals(plan.unauthenticated, [])
  assertEquals(plan.create.length, 3)
})
