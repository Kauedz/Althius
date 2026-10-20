import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// A volta do Zapier (conector-zapier 01): cliente público do registro dinâmico e a conta pelo userinfo do Zapier.

const APP = 'https://app.althius.test'

Deno.test('Zapier: troca como cliente público e a conta vem do userinfo com o token novo', async () => {
  const concluidas: Parameters<Db['concluir']>[0][] = []
  const autorizacoes: (string | null)[] = []
  const db: Db = {
    tentativa: () =>
      Promise.resolve({
        status: 'ok',
        workspaceId: 'ws-1',
        userId: 'u-1',
        integrationId: 'zapier',
        issuer: 'https://mcp.zapier.com',
        codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
        redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
        returnTo: APP,
        tokenEndpoint: 'https://mcp.zapier.com/api/v1/oauth/token',
        clientId: 'cid-zap',
        resource: 'https://mcp.zapier.com/api/v1/connect',
      }),
    concluir: (a) => (concluidas.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve({ clientId: 'cid-zap', clientSecret: null }),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://mcp.zapier.com/api/v1/oauth/token') {
      return new Response(JSON.stringify({ access_token: 'acc-zap-1', refresh_token: 'ref-zap-1', expires_in: 3600 }), { status: 200 })
    }
    if (req.url === 'https://mcp.zapier.com/api/v1/oauth/userinfo') {
      autorizacoes.push(req.headers.get('Authorization'))
      return new Response(JSON.stringify({ sub: 'z1', email: 'ana@norte.test' }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const handler = createHandler({ db, ambiente: () => undefined, appOrigin: APP, fetch: fetchFalso, log: () => {} })
  const r = await handler(new Request('https://proj.supabase.co/functions/v1/integration-callback?code=codigo-1&state=estado-1'))
  assertEquals(new URL(r.headers.get('Location')!).searchParams.get('conexao'), 'ok')
  assertEquals(autorizacoes, ['Bearer acc-zap-1'])
  assertEquals(concluidas[0].accountLabel, 'ana@norte.test')
})
