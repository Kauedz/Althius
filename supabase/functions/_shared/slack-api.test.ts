import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoSlack, ESCOPOS_DO_BOT, revogarTokenDoSlack, trocarCodigoDoSlack, urlDeInstalacao } from './slack-api.ts'

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

Deno.test('o endereço de instalação pede só os escopos do bot da spec', () => {
  const url = new URL(urlDeInstalacao({ clientId: 'cid-canal', urlDeRetorno: 'https://proj.supabase.co/functions/v1/slack-channel-callback', state: 'estado-1' }))
  assertEquals(url.origin + url.pathname, 'https://slack.com/oauth/v2/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-canal')
  assertEquals(url.searchParams.get('state'), 'estado-1')
  assertEquals(url.searchParams.get('redirect_uri'), 'https://proj.supabase.co/functions/v1/slack-channel-callback')
  assertEquals(url.searchParams.get('scope')?.split(','), [
    'app_mentions:read',
    'im:history',
    'channels:history',
    'chat:write',
    'users:read',
    'users:read.email',
  ])
  assertEquals(url.searchParams.get('user_scope'), null, 'nenhum escopo de usuário')
  assertEquals(ESCOPOS_DO_BOT.length, 6)
})

Deno.test('a troca do código devolve o token do bot e o workspace Slack', async () => {
  const slack = slackFalso(() =>
    json({
      ok: true,
      access_token: 'xoxb-token-do-bot',
      token_type: 'bot',
      scope: 'app_mentions:read,chat:write',
      bot_user_id: 'U0BOT',
      app_id: 'A0ALTHIUS',
      team: { id: 'T0NORTE', name: 'Norte' },
      authed_user: { id: 'U0ANA' },
    })
  )
  const instalacao = await trocarCodigoDoSlack({
    clientId: 'cid-canal',
    clientSecret: 'segredo-canal',
    codigo: 'codigo-1',
    urlDeRetorno: 'https://x/slack-channel-callback',
    fetch: slack.fetch,
  })
  assertEquals(instalacao, {
    token: 'xoxb-token-do-bot',
    teamId: 'T0NORTE',
    teamName: 'Norte',
    botUserId: 'U0BOT',
    appId: 'A0ALTHIUS',
    escopos: 'app_mentions:read,chat:write',
  })
  const pedido = slack.pedidos[0]
  assertEquals(pedido.url, 'https://slack.com/api/oauth.v2.access')
  assertEquals(pedido.headers.get('Authorization'), `Basic ${btoa('cid-canal:segredo-canal')}`)
  const corpo = new URLSearchParams(await pedido.text())
  assertEquals(corpo.get('code'), 'codigo-1')
  assertEquals(corpo.get('redirect_uri'), 'https://x/slack-channel-callback')
  assertEquals(corpo.get('client_secret'), null, 'o segredo vai só no cabeçalho')
})

Deno.test('a troca recusada, sem time ou sem token de bot vira erro, sem o token na mensagem', async () => {
  const troca = (corpo: unknown, status = 200) =>
    trocarCodigoDoSlack({ clientId: 'c', clientSecret: 's', codigo: 'k', urlDeRetorno: 'https://x', fetch: slackFalso(() => json(corpo, status)).fetch })

  const recusada = await assertRejects(() => troca({ ok: false, error: 'invalid_code' }), ErroDoSlack)
  assertEquals([recusada.tipo, recusada.codigo], ['recusado', 'invalid_code'])

  const semTime = await assertRejects(
    () => troca({ ok: true, access_token: 'xoxb-segredo', token_type: 'bot', bot_user_id: 'U0', is_enterprise_install: true, team: null }),
    ErroDoSlack,
  )
  assertEquals(semTime.tipo, 'resposta_invalida')
  assert(!semTime.message.includes('xoxb-segredo'))

  const deUsuario = await assertRejects(
    () => troca({ ok: true, access_token: 'xoxp-1', token_type: 'user', team: { id: 'T0' } }),
    ErroDoSlack,
  )
  assertEquals(deUsuario.tipo, 'resposta_invalida')

  assertEquals((await assertRejects(() => troca({}, 503), ErroDoSlack)).tipo, 'indisponivel')
})

Deno.test('a rede fora do ar na troca é indisponível', async () => {
  const erro = await assertRejects(
    () =>
      trocarCodigoDoSlack({
        clientId: 'c',
        clientSecret: 's',
        codigo: 'k',
        urlDeRetorno: 'https://x',
        fetch: (() => Promise.reject(new TypeError('rede'))) as typeof fetch,
      }),
    ErroDoSlack,
  )
  assertEquals(erro.tipo, 'indisponivel')
})

Deno.test('revogar o token chama auth.revoke com o próprio token', async () => {
  const slack = slackFalso(() => json({ ok: true, revoked: true }))
  assertEquals(await revogarTokenDoSlack({ token: 'xoxb-1', fetch: slack.fetch }), 'revogado')
  assertEquals(slack.pedidos[0].url, 'https://slack.com/api/auth.revoke')
  assertEquals(slack.pedidos[0].method, 'POST')
  assertEquals(slack.pedidos[0].headers.get('Authorization'), 'Bearer xoxb-1')
})

Deno.test('um token que já não vale conta como revogado; outra recusa e a rede fora do ar não', async () => {
  for (const codigo of ['invalid_auth', 'token_revoked', 'account_inactive']) {
    assertEquals(
      await revogarTokenDoSlack({ token: 'xoxb-1', fetch: slackFalso(() => json({ ok: false, error: codigo })).fetch }),
      'ja_invalido',
    )
  }
  const recusada = await assertRejects(
    () => revogarTokenDoSlack({ token: 'xoxb-1', fetch: slackFalso(() => json({ ok: false, error: 'ratelimited' })).fetch }),
    ErroDoSlack,
  )
  assertEquals(recusada.tipo, 'recusado')
  const fora = await assertRejects(
    () => revogarTokenDoSlack({ token: 'xoxb-1', fetch: slackFalso(() => json({}, 500)).fetch }),
    ErroDoSlack,
  )
  assertEquals(fora.tipo, 'indisponivel')
})
