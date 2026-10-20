import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// O Lusha pela autorização no próprio Lusha (conector-lusha 02): o metadado de mcp.lusha.com aponta auth.lusha.com, que
// aceita registro dinâmico só de cliente confidencial (client_secret_post/basic, sem `none`).

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar() {
  const c = { registros: [] as Record<string, unknown>[], clientes: [] as Parameters<Db['salvarClienteOAuth']>[0][], tentativas: [] as Parameters<Db['iniciarTentativa']>[0][] }
  const guardados: { clientId: string; clientSecret: string | null }[] = []
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: (a) => (c.tentativas.push(a), Promise.resolve({ state: 'estado-123', codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789' })),
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: () => Promise.resolve('acesso'),
    clienteOAuth: () => Promise.resolve(guardados[0] ?? null),
    salvarClienteOAuth: (a) => {
      c.clientes.push(a)
      guardados.push({ clientId: a.clientId, clientSecret: a.clientSecret })
      return Promise.resolve(guardados[0])
    },
  }
  const rotas: Record<string, (req: Request) => Response | Promise<Response>> = {
    'POST https://mcp.lusha.com/': () =>
      new Response('invalid_request', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_request", scope="mcp", resource_metadata="https://mcp.lusha.com/.well-known/oauth-protected-resource"' },
      }),
    'GET https://mcp.lusha.com/.well-known/oauth-protected-resource': () =>
      json({ resource: 'https://mcp.lusha.com', authorization_servers: ['https://auth.lusha.com'], scopes_supported: ['mcp'] }),
    'GET https://auth.lusha.com/.well-known/oauth-authorization-server': () =>
      json({
        issuer: 'https://auth.lusha.com',
        authorization_endpoint: 'https://auth.lusha.com/oauth-ui/authorize',
        token_endpoint: 'https://auth.lusha.com/oauth/token',
        registration_endpoint: 'https://auth.lusha.com/oauth/register',
        revocation_endpoint: 'https://auth.lusha.com/oauth/revoke',
        scopes_supported: ['mcp'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      }),
    'POST https://auth.lusha.com/oauth/register': async (req) => {
      c.registros.push(await req.json())
      return json({ client_id: 'cid-lusha', client_secret: 'segredo-do-cliente-lusha' }, 201)
    },
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    const rota = rotas[`${req.method} ${req.url}`]
    return rota ? await rota(req) : json({}, 404)
  }) as typeof fetch
  const handler = createHandler({
    db,
    ambiente: () => undefined,
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: 'https://proj.supabase.co/functions/v1/integration-callback',
    fetch: fetchFalso,
    log: () => {},
  })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/integration-connect', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir }
}

Deno.test('Lusha: registra a Althius como cliente confidencial em auth.lusha.com e manda ao consentimento com escopo mcp', async () => {
  const { c, pedir } = montar()
  const resposta = await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'lusha' })
  assertEquals(resposta.status, 200)
  const corpo = await resposta.text()
  const url = new URL(JSON.parse(corpo).url)
  assertEquals(url.origin + url.pathname, 'https://auth.lusha.com/oauth-ui/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-lusha')
  assertEquals(url.searchParams.get('scope'), 'mcp')
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256')
  assertEquals(url.searchParams.get('resource'), 'https://mcp.lusha.com')
  // O Lusha não aceita cliente público: o registro pede segredo, e o segredo fica guardado para a troca.
  assertEquals(c.registros[0].token_endpoint_auth_method, 'client_secret_post')
  assertEquals(c.clientes.map((k) => [k.issuer, k.clientId, k.clientSecret]), [['https://auth.lusha.com', 'cid-lusha', 'segredo-do-cliente-lusha']])
  assertEquals(c.tentativas[0].tokenEndpoint, 'https://auth.lusha.com/oauth/token')
  assert(!corpo.includes('segredo-do-cliente-lusha'))
})
