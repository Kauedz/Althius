import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// A volta do Meta Ads (conector-meta-ads 01): a troca do código em graph.facebook.com como cliente público, com o App ID
// do app Meta da Althius e o verificador PKCE, sem segredo.

const APP = 'https://app.althius.test'

Deno.test('Meta Ads: troca o código como cliente público, só com o App ID e o PKCE', async () => {
  const concluidas: Parameters<Db['concluir']>[0][] = []
  const trocas: URLSearchParams[] = []
  const db: Db = {
    tentativa: () =>
      Promise.resolve({
        status: 'ok',
        workspaceId: 'ws-1',
        userId: 'u-1',
        integrationId: 'meta-ads',
        issuer: 'https://www.facebook.com/ads',
        codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
        redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
        returnTo: APP,
        tokenEndpoint: 'https://graph.facebook.com/v26.0/oauth/access_token',
        clientId: '123456789012345',
        resource: 'https://mcp.facebook.com/ads',
      }),
    concluir: (a) => (concluidas.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://graph.facebook.com/v26.0/oauth/access_token') {
      trocas.push(new URLSearchParams(await req.text()))
      return new Response(JSON.stringify({ access_token: 'acc-meta-1', token_type: 'bearer', expires_in: 5183944 }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const handler = createHandler({
    db,
    ambiente: (nome) => ({ META_ADS_MCP_CLIENT_ID: '123456789012345' } as Record<string, string>)[nome],
    appOrigin: APP,
    fetch: fetchFalso,
    log: () => {},
  })
  const r = await handler(new Request('https://proj.supabase.co/functions/v1/integration-callback?code=codigo-1&state=estado-1'))
  assertEquals(new URL(r.headers.get('Location')!).searchParams.get('conexao'), 'ok')
  assertEquals(
    [trocas[0].get('client_id'), trocas[0].get('client_secret'), trocas[0].get('code_verifier')],
    ['123456789012345', null, 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789'],
  )
  assertEquals(concluidas[0].accessToken, 'acc-meta-1')
})
