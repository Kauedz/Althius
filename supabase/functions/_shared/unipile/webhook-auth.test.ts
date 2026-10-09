// A autenticação do webhook da Unipile v1 (canais-17): o cabeçalho Unipile-Auth igual ao segredo da conexão e, só para o
// aviso do link de conexão (que não aceita cabeçalho), a chave ?k= derivada por HMAC do pedido.
import { assertEquals } from 'jsr:@std/assert@1'
import { authenticateV1Webhook, connectionNoticeKey, withConnectionNoticeKey } from './webhook-auth.ts'

const SECRET = 'segredo-v1-de-teste-com-mais-de-16'
const PEDIDO = 'f6000000-0000-0000-0000-000000000001'
const notice = JSON.stringify({ status: 'CREATION_SUCCESS', account_id: 'acc7', name: PEDIDO })
const message = JSON.stringify({ event: 'message_received', account_id: 'acc1', name: PEDIDO })

Deno.test('v1: o cabeçalho Unipile-Auth igual ao segredo vale; diferente, ausente ou sem segredo, não', async () => {
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: SECRET, key: null, secret: SECRET }), 'header')
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: 'outro', key: null, secret: SECRET }), null)
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: null, key: null, secret: SECRET }), null)
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: '', key: null, secret: '' }), null)
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: SECRET, key: null, secret: '' }), null)
  // Um prefixo do segredo não vale (a comparação não para no primeiro caractere igual nem aceita comprimento menor).
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: SECRET.slice(0, -1), key: null, secret: SECRET }), null)
})

Deno.test('v1: a chave do endereço vale só para o pedido citado em name', async () => {
  const key = await connectionNoticeKey(SECRET, PEDIDO)
  assertEquals(await authenticateV1Webhook({ rawBody: notice, header: null, key, secret: SECRET }), 'key')
  assertEquals(
    await authenticateV1Webhook({ rawBody: notice, header: null, key: await connectionNoticeKey(SECRET, 'outro-pedido'), secret: SECRET }),
    null,
  )
  assertEquals(
    await authenticateV1Webhook({ rawBody: notice, header: null, key: await connectionNoticeKey('segredo-errado', PEDIDO), secret: SECRET }),
    null,
  )
  assertEquals(await authenticateV1Webhook({ rawBody: 'não é json', header: null, key, secret: SECRET }), null)
  assertEquals(await authenticateV1Webhook({ rawBody: '[]', header: null, key, secret: SECRET }), null)
})

Deno.test('v1: a chave é hex de HMAC-SHA256 de "conexao:<pedido>" e o endereço de aviso a leva em ?k=', async () => {
  const key = await connectionNoticeKey(SECRET, PEDIDO)
  assertEquals(key.length, 64)
  assertEquals(/^[0-9a-f]+$/.test(key), true)
  assertEquals(key, await connectionNoticeKey(SECRET, PEDIDO))
  const url = await withConnectionNoticeKey('https://p.supabase.co/functions/v1/unipile-account-status', SECRET, PEDIDO)
  assertEquals(url, `https://p.supabase.co/functions/v1/unipile-account-status?k=${key}`)
  // Um endereço que já tem consulta ganha a chave sem perder o resto; o segredo nunca vai no endereço.
  const withQuery = await withConnectionNoticeKey('https://p.supabase.co/x?a=1', SECRET, PEDIDO)
  assertEquals(withQuery, `https://p.supabase.co/x?a=1&k=${key}`)
  assertEquals(url.includes(SECRET), false)
})

Deno.test('v1: a chave do endereço NÃO autoriza outro evento: quem usa confere o tipo (aqui, só o corpo do pedido)', async () => {
  const key = await connectionNoticeKey(SECRET, PEDIDO)
  // A autenticação diz "key"; o handler só aceita esse resultado para o evento de conexão (ver handler-v1.test.ts).
  assertEquals(await authenticateV1Webhook({ rawBody: message, header: null, key, secret: SECRET }), 'key')
})
