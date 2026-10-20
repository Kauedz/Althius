import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// A Integração Slack (conector-slack 01), com o metadado lido em 19/10/2026: sem registro dinâmico (app Slack da Althius,
// o mesmo do Canal), consentimento de usuário em slack.com/oauth/v2_user/authorize, PKCE e os escopos de usuário que o
// servidor MCP anuncia.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(ambiente: Record<string, string>) {
  const c = { rede: [] as string[] }
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: () => Promise.resolve({ state: 'estado-123', codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789' }),
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: () => Promise.resolve('acesso'),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push(`${req.method} ${req.url}`)
    if (req.method === 'POST' && req.url === 'https://mcp.slack.com/mcp') {
      return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.slack.com/.well-known/oauth-protected-resource"' } })
    }
    if (req.url === 'https://mcp.slack.com/.well-known/oauth-protected-resource') {
      return json({ resource: 'https://mcp.slack.com', authorization_servers: ['https://mcp.slack.com'] })
    }
    if (req.url === 'https://mcp.slack.com/.well-known/oauth-authorization-server') {
      return json({
        issuer: 'https://mcp.slack.com',
        authorization_endpoint: 'https://slack.com/oauth/v2_user/authorize',
        token_endpoint: 'https://slack.com/api/oauth.v2.user.access',
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256'],
      })
    }
    return json({}, 404)
  }) as typeof fetch
  const handler = createHandler({
    db,
    ambiente: (nome) => ambiente[nome],
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: 'https://proj.supabase.co/functions/v1/integration-callback',
    fetch: fetchFalso,
    log: () => {},
  })
  const pedir = () =>
    handler(new Request('https://x/integration-connect', {
      method: 'POST',
      body: JSON.stringify({ action: 'iniciar', workspaceId: WS, integrationId: 'slack' }),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir }
}

Deno.test('Slack: com o app da Althius, vai ao consentimento de usuário com PKCE e os escopos que o MCP anuncia', async () => {
  const { pedir } = montar({ SLACK_MCP_CLIENT_ID: 'cid-slack', SLACK_MCP_CLIENT_SECRET: 'segredo-slack' })
  const resposta = await pedir()
  assertEquals(resposta.status, 200)
  const url = new URL((await resposta.json()).url)
  assertEquals(url.origin + url.pathname, 'https://slack.com/oauth/v2_user/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-slack')
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256')
  const escopos = url.searchParams.get('scope')!.split(' ')
  assertEquals(escopos.length, 30)
  for (const e of ['chat:write', 'search:read.public', 'users:read.email', 'emoji:read']) assert(escopos.includes(e), e)
  assertEquals(url.searchParams.get('resource'), null)
})

Deno.test('Slack: sem o app cadastrado, "Precisa configurar", sem tentar registro', async () => {
  const { c, pedir } = montar({})
  const resposta = await pedir()
  assertEquals(resposta.status, 503)
  assertEquals((await resposta.json()).code, 'nao_configurada')
  assert(!c.rede.some((r) => r.includes('register')))
})
