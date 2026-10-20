import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// A volta da Integração Slack (conector-slack 01): a troca com client_secret_post e a conta pelo auth.test do Slack com o
// token de usuário novo.

const APP = 'https://app.althius.test'

Deno.test('Slack: troca com client_secret_post e a conta vem do auth.test', async () => {
  const concluidas: Parameters<Db['concluir']>[0][] = []
  const trocas: URLSearchParams[] = []
  const autorizacoes: (string | null)[] = []
  const db: Db = {
    tentativa: () =>
      Promise.resolve({
        status: 'ok',
        workspaceId: 'ws-1',
        userId: 'u-1',
        integrationId: 'slack',
        issuer: 'https://mcp.slack.com',
        codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
        redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
        returnTo: APP,
        tokenEndpoint: 'https://slack.com/api/oauth.v2.user.access',
        clientId: 'cid-slack',
        resource: null,
      }),
    concluir: (a) => (concluidas.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://slack.com/api/oauth.v2.user.access') {
      trocas.push(new URLSearchParams(await req.text()))
      return new Response(JSON.stringify({ ok: true, access_token: 'xoxp-1', refresh_token: 'xoxe-1', expires_in: 43200 }), { status: 200 })
    }
    if (req.url === 'https://slack.com/api/auth.test') {
      autorizacoes.push(req.headers.get('Authorization'))
      return new Response(JSON.stringify({ ok: true, user: 'marina', team: 'Norte', user_id: 'U1', team_id: 'T1' }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const ambiente: Record<string, string> = { SLACK_MCP_CLIENT_ID: 'cid-slack', SLACK_MCP_CLIENT_SECRET: 'segredo-slack' }
  const handler = createHandler({ db, ambiente: (n) => ambiente[n], appOrigin: APP, fetch: fetchFalso, log: () => {} })
  const r = await handler(new Request('https://proj.supabase.co/functions/v1/integration-callback?code=codigo-1&state=estado-1'))
  assertEquals(new URL(r.headers.get('Location')!).searchParams.get('conexao'), 'ok')
  assertEquals([trocas[0].get('client_id'), trocas[0].get('client_secret')], ['cid-slack', 'segredo-slack'])
  assertEquals(autorizacoes, ['Bearer xoxp-1'])
  assertEquals(concluidas[0].accountLabel, 'marina')
})
