import { assert, assertEquals } from 'jsr:@std/assert@1'
import { servidorMcpFalso } from '../_shared/integracoes/servidor-mcp-falso.ts'
import { createHandler, type Db } from './handler.ts'

// Make e Zapier (conector-make 01, conector-zapier 01), com os metadados lidos ao vivo em 19/10/2026.
// Make: o emissor tem caminho (https://www.make.com/mcp) e o metadado fica em /.well-known/oauth-authorization-server/mcp;
// registro dinâmico só confidencial (client_secret_post). Zapier: registro dinâmico, e o token de conexão como chave,
// validado listando as ferramentas do servidor MCP com Bearer.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(tokenValido = 'token-conexao-zapier-1') {
  const c = { registros: [] as Record<string, unknown>[], chaves: [] as string[], rede: [] as string[] }
  const zapier = servidorMcpFalso({ token: tokenValido })
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: () => Promise.resolve({ state: 'estado-123', codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789' }),
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: (a) => (c.chaves.push(a.apiKey), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push(`${req.method} ${req.url}`)
    if (req.url === 'https://mcp.make.com/.well-known/oauth-protected-resource') {
      return json({ resource: 'https://mcp.make.com/', authorization_servers: ['https://www.make.com/mcp'] })
    }
    if (req.url === 'https://www.make.com/.well-known/oauth-authorization-server/mcp') {
      return json({
        issuer: 'https://www.make.com/mcp',
        authorization_endpoint: 'https://www.make.com/oauth/v2/authorize',
        token_endpoint: 'https://www.make.com/oauth/v2/token',
        registration_endpoint: 'https://www.make.com/oauth/v2/register/mcp',
        revocation_endpoint: 'https://www.make.com/oauth/v2/revoke',
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      })
    }
    if (req.url === 'https://www.make.com/oauth/v2/register/mcp') {
      c.registros.push(await req.json())
      return json({ client_id: 'cid-make', client_secret: 'segredo-make' }, 201)
    }
    if (req.url === 'https://mcp.zapier.com/api/v1/connect') return await zapier.fetch(req)
    return json({}, 404)
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

Deno.test('Make: descobre o metadado do emissor com caminho, registra como cliente confidencial e vai ao consentimento', async () => {
  const { c, pedir } = montar()
  const resposta = await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'make' })
  assertEquals(resposta.status, 200)
  const url = new URL((await resposta.json()).url)
  assertEquals(url.origin + url.pathname, 'https://www.make.com/oauth/v2/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-make')
  assertEquals(url.searchParams.get('resource'), 'https://mcp.make.com/')
  assertEquals(c.registros[0].token_endpoint_auth_method, 'client_secret_post')
})

Deno.test('Zapier: o token de conexão é validado no servidor MCP e guardado; o recusado não', async () => {
  const valida = montar()
  const r = await valida.pedir({ action: 'chave', workspaceId: WS, integrationId: 'zapier', chave: 'token-conexao-zapier-1' })
  assertEquals(r.status, 200)
  assert(!(await r.text()).includes('token-conexao-zapier-1'))
  assertEquals(valida.c.chaves, ['token-conexao-zapier-1'])

  const recusada = montar('outro-token')
  const r2 = await recusada.pedir({ action: 'chave', workspaceId: WS, integrationId: 'zapier', chave: 'token-conexao-zapier-1' })
  assertEquals((await r2.json()).code, 'chave_recusada')
  assertEquals(recusada.c.chaves.length, 0)
})
