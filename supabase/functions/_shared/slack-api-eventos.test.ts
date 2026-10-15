import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { assinaturaDoSlackValida, ErroDoSlack, lerUsuarioDoSlack, postarNoThread } from './slack-api.ts'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function slackFalso(responder: (req: Request) => Response | Promise<Response>) {
  const pedidos: Request[] = []
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    pedidos.push(req.clone())
    return await responder(req)
  }) as typeof fetch
  return { fetch: fetchFalso, pedidos }
}

async function assinar(segredo: string, timestamp: string, corpo: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`v0:${timestamp}:${corpo}`)))
  return `v0=${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

Deno.test('a assinatura do Slack confere o HMAC de v0:timestamp:corpo dentro de 5 minutos', async () => {
  const corpo = '{"type":"event_callback"}'
  const assinatura = await assinar('segredo', '1700000000', corpo)
  assert(await assinaturaDoSlackValida({ corpo, timestamp: '1700000000', assinatura, segredo: 'segredo', agoraEmSegundos: 1700000100 }))
  assert(await assinaturaDoSlackValida({ corpo, timestamp: '1700000000', assinatura, segredo: 'segredo', agoraEmSegundos: 1700000300 }))
  assert(!(await assinaturaDoSlackValida({ corpo, timestamp: '1700000000', assinatura, segredo: 'segredo', agoraEmSegundos: 1700000301 })), 'velha')
  assert(!(await assinaturaDoSlackValida({ corpo, timestamp: '1700000000', assinatura, segredo: 'outro', agoraEmSegundos: 1700000000 })), 'outro segredo')
  assert(!(await assinaturaDoSlackValida({ corpo: corpo + ' ', timestamp: '1700000000', assinatura, segredo: 'segredo', agoraEmSegundos: 1700000000 })), 'corpo mudou')
  assert(!(await assinaturaDoSlackValida({ corpo, timestamp: null, assinatura, segredo: 'segredo', agoraEmSegundos: 1700000000 })))
  assert(!(await assinaturaDoSlackValida({ corpo, timestamp: '1700000000', assinatura: null, segredo: 'segredo', agoraEmSegundos: 1700000000 })))
  assert(!(await assinaturaDoSlackValida({ corpo, timestamp: '1700000000', assinatura, segredo: '', agoraEmSegundos: 1700000000 })), 'sem segredo')
  assert(!(await assinaturaDoSlackValida({ corpo, timestamp: 'abc', assinatura, segredo: 'segredo', agoraEmSegundos: 1700000000 })))
})

Deno.test('ler o usuário do Slack devolve o e-mail, o time e se é convidado ou de fora', async () => {
  const slack = slackFalso(() =>
    json({
      ok: true,
      user: {
        id: 'U1',
        team_id: 'T0NORTE',
        is_bot: false,
        deleted: false,
        is_restricted: true,
        is_ultra_restricted: false,
        profile: { email: 'Ana@Norte.test' },
      },
    })
  )
  const usuario = await lerUsuarioDoSlack({ token: 'xoxb-1', usuario: 'U1', fetch: slack.fetch })
  assertEquals(usuario, { email: 'Ana@Norte.test', teamId: 'T0NORTE', convidado: true, deFora: false, bot: false, apagado: false })
  const pedido = slack.pedidos[0]
  assertEquals(pedido.url, 'https://slack.com/api/users.info')
  assertEquals(pedido.headers.get('Authorization'), 'Bearer xoxb-1')
  assertEquals(new URLSearchParams(await pedido.text()).get('user'), 'U1')
})

Deno.test('o usuário estranho (Slack Connect) e o ultra-restrito são marcados', async () => {
  const estranho = slackFalso(() => json({ ok: true, user: { id: 'U2', team_id: 'T0OUTRO', is_stranger: true, profile: {} } }))
  const u = await lerUsuarioDoSlack({ token: 'xoxb-1', usuario: 'U2', fetch: estranho.fetch })
  assertEquals(u.deFora, true)
  assertEquals(u.email, null)
  const ultra = slackFalso(() => json({ ok: true, user: { id: 'U3', team_id: 'T0NORTE', is_ultra_restricted: true, profile: { email: 'x@y.test' } } }))
  assertEquals((await lerUsuarioDoSlack({ token: 'xoxb-1', usuario: 'U3', fetch: ultra.fetch })).convidado, true)
})

Deno.test('ler o usuário recusado pelo Slack vira ErroDoSlack sem o token', async () => {
  const slack = slackFalso(() => json({ ok: false, error: 'user_not_found' }))
  const erro = await assertRejects(() => lerUsuarioDoSlack({ token: 'xoxb-segredo', usuario: 'U9', fetch: slack.fetch }), ErroDoSlack)
  assertEquals(erro.codigo, 'user_not_found')
  assert(!erro.message.includes('xoxb-segredo'))
})

Deno.test('postar no thread manda o canal, o thread_ts e o texto', async () => {
  const slack = slackFalso(() => json({ ok: true, ts: '1700000001.000200' }))
  await postarNoThread({ token: 'xoxb-1', canal: 'C1', threadTs: '1700000000.000100', texto: 'Olá', fetch: slack.fetch })
  const pedido = slack.pedidos[0]
  assertEquals(pedido.url, 'https://slack.com/api/chat.postMessage')
  assertEquals(pedido.headers.get('Authorization'), 'Bearer xoxb-1')
  const corpo = await pedido.json()
  assertEquals(corpo, { channel: 'C1', thread_ts: '1700000000.000100', text: 'Olá' })
})

Deno.test('postar recusado ou fora do ar vira ErroDoSlack', async () => {
  const recusado = slackFalso(() => json({ ok: false, error: 'not_in_channel' }))
  const e1 = await assertRejects(
    () => postarNoThread({ token: 'xoxb-1', canal: 'C1', threadTs: '1.1', texto: 'x', fetch: recusado.fetch }),
    ErroDoSlack,
  )
  assertEquals(e1.tipo, 'recusado')
  const fora = slackFalso(() => new Response('', { status: 503 }))
  const e2 = await assertRejects(() => postarNoThread({ token: 'xoxb-1', canal: 'C1', threadTs: '1.1', texto: 'x', fetch: fora.fetch }), ErroDoSlack)
  assertEquals(e2.tipo, 'indisponivel')
})
