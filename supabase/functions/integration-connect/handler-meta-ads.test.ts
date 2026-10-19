import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// O Meta Ads pelo app Meta da Althius (conector-meta-ads 01): a documentação oficial manda o cliente de terceiros usar o
// próprio app de desenvolvedor, com o App ID como client_id. O token da Meta aceita cliente público (`none`) com PKCE, então
// o App ID basta; sem ele, "Precisa configurar", sem tentar o registro dinâmico que o metadado também anuncia.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(ambiente: Record<string, string>) {
  const c = { rede: [] as string[], tentativas: [] as Parameters<Db['iniciarTentativa']>[0][] }
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: (a) => (c.tentativas.push(a), Promise.resolve({ state: 'estado-123', codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789' })),
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: () => Promise.resolve('acesso'),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push(`${req.method} ${req.url}`)
    if (req.method === 'POST' && req.url === 'https://mcp.facebook.com/ads') {
      return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.facebook.com/.well-known/oauth-protected-resource/ads"' } })
    }
    if (req.url === 'https://mcp.facebook.com/.well-known/oauth-protected-resource/ads') {
      return json({ resource: 'https://mcp.facebook.com/ads', authorization_servers: ['https://www.facebook.com/ads'] })
    }
    if (req.url === 'https://www.facebook.com/.well-known/oauth-authorization-server/ads') {
      return json({
        issuer: 'https://www.facebook.com/ads',
        authorization_endpoint: 'https://www.facebook.com/v26.0/dialog/oauth',
        token_endpoint: 'https://graph.facebook.com/v26.0/oauth/access_token',
        registration_endpoint: 'https://mcp.facebook.com/.well-known/register/ads',
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
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
      body: JSON.stringify({ action: 'iniciar', workspaceId: WS, integrationId: 'meta-ads' }),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir }
}

Deno.test('Meta Ads: com o App ID e sem segredo, vai ao Facebook Login com PKCE e os escopos mínimos de leitura', async () => {
  const { c, pedir } = montar({ META_ADS_MCP_CLIENT_ID: '123456789012345' })
  const resposta = await pedir()
  assertEquals(resposta.status, 200)
  const url = new URL((await resposta.json()).url)
  assertEquals(url.origin + url.pathname, 'https://www.facebook.com/v26.0/dialog/oauth')
  assertEquals(url.searchParams.get('client_id'), '123456789012345')
  assertEquals(url.searchParams.get('scope'), 'ads_mcp_management ads_read')
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256')
  assertEquals(c.tentativas[0].tokenEndpoint, 'https://graph.facebook.com/v26.0/oauth/access_token')
  assert(!c.rede.some((r) => r.includes('/register/')), 'não tenta o registro dinâmico')
})

Deno.test('Meta Ads: sem o App ID, "Precisa configurar", sem registro dinâmico e sem tentativa', async () => {
  const { c, pedir } = montar({})
  const resposta = await pedir()
  assertEquals(resposta.status, 503)
  assertEquals((await resposta.json()).code, 'nao_configurada')
  assertEquals(c.tentativas.length, 0)
  assert(!c.rede.some((r) => r.includes('/register/')))
})
