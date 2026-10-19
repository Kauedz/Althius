import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  autenticacaoDoCliente,
  candidatosDoMetadadoDoServidor,
  desafioPkce,
  descobrirServidorDeAutorizacao,
  ErroDeOAuth,
  metadadoDoRecursoNoDesafio,
  registrarClienteDinamico,
  renovarToken,
  revogarToken,
  trocarCodigo,
  urlDeConsentimento,
} from './oauth.ts'

type Rota = (req: Request, corpo: string) => Response | Promise<Response>

/** Um `fetch` com uma tabela de rotas "MÉTODO url" e o registro do que chegou. */
function rede(rotas: Record<string, Rota>) {
  const chamadas: { metodo: string; url: string; cabecalhos: Headers; corpo: string }[] = []
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    const corpo = req.method === 'GET' ? '' : await req.text()
    chamadas.push({ metodo: req.method, url: req.url, cabecalhos: req.headers, corpo })
    const rota = rotas[`${req.method} ${req.url}`]
    return rota ? await rota(req, corpo) : new Response('{}', { status: 404 })
  }) as typeof fetch
  return { fetch: fetchFalso, chamadas }
}

const json = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cabecalhos } })

const META_AS = {
  issuer: 'https://auth.falso.test',
  authorization_endpoint: 'https://auth.falso.test/authorize',
  token_endpoint: 'https://auth.falso.test/token',
  registration_endpoint: 'https://auth.falso.test/register',
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
}

Deno.test('o desafio PKCE S256 bate com o vetor do RFC 7636', async () => {
  assertEquals(
    await desafioPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  )
})

Deno.test('lê o resource_metadata do desafio do 401 e monta os candidatos do metadado do servidor', () => {
  assertEquals(
    metadadoDoRecursoNoDesafio('Bearer realm="mcp", resource_metadata="https://mcp.x.test/.well-known/oauth-protected-resource"'),
    'https://mcp.x.test/.well-known/oauth-protected-resource',
  )
  assertEquals(metadadoDoRecursoNoDesafio(null), null)
  assertEquals(candidatosDoMetadadoDoServidor('https://auth.x.test'), [
    'https://auth.x.test/.well-known/oauth-authorization-server',
    'https://auth.x.test/.well-known/openid-configuration',
  ])
  assertEquals(candidatosDoMetadadoDoServidor('https://auth.x.test/t1')[0], 'https://auth.x.test/.well-known/oauth-authorization-server/t1')
})

Deno.test('descobre pelo desafio do 401: recurso protegido, depois o servidor de autorização', async () => {
  const { fetch, chamadas } = rede({
    'POST https://mcp.falso.test/mcp': () =>
      new Response('{}', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.falso.test/.well-known/oauth-protected-resource/mcp"' },
      }),
    'GET https://mcp.falso.test/.well-known/oauth-protected-resource/mcp': () =>
      json({ resource: 'https://mcp.falso.test/mcp', authorization_servers: ['https://auth.falso.test'] }),
    'GET https://auth.falso.test/.well-known/oauth-authorization-server': () => json(META_AS),
  })
  const achado = await descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.falso.test/mcp', fetch })
  assertEquals(achado.authorization_endpoint, 'https://auth.falso.test/authorize')
  assertEquals(achado.token_endpoint, 'https://auth.falso.test/token')
  assertEquals(achado.registration_endpoint, 'https://auth.falso.test/register')
  assertEquals(achado.resource, 'https://mcp.falso.test/mcp')
  assertEquals(chamadas.length, 3)
})

Deno.test('sem o desafio, descobre pelo endereço conhecido com o caminho do recurso (RFC 9728)', async () => {
  const { fetch } = rede({
    'GET https://mcp.falso.test/.well-known/oauth-protected-resource/mcp': () =>
      json({ resource: 'https://mcp.falso.test/mcp', authorization_servers: ['https://auth.falso.test'] }),
    'GET https://auth.falso.test/.well-known/oauth-authorization-server': () => json(META_AS),
  })
  const achado = await descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.falso.test/mcp', fetch })
  assertEquals(achado.token_endpoint, 'https://auth.falso.test/token')
})

Deno.test('sem metadado do recurso, o servidor MCP é o próprio servidor de autorização (MCP 2025-03-26)', async () => {
  const { fetch } = rede({
    'GET https://mcp.apollo.test/.well-known/oauth-authorization-server': () =>
      json({ ...META_AS, issuer: 'https://mcp.apollo.test', authorization_endpoint: 'https://mcp.apollo.test/authorize', token_endpoint: 'https://mcp.apollo.test/token' }),
  })
  const achado = await descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.apollo.test/mcp', fetch })
  assertEquals(achado.authorization_endpoint, 'https://mcp.apollo.test/authorize')
})

Deno.test('o desafio que aponta para outro servidor não é seguido', async () => {
  const { fetch, chamadas } = rede({
    'POST https://mcp.falso.test/mcp': () =>
      new Response('{}', { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://atacante.test/prm"' } }),
  })
  await assertRejects(() => descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.falso.test/mcp', fetch }), ErroDeOAuth)
  assert(!chamadas.some((c) => c.url.startsWith('https://atacante.test')))
})

Deno.test('endereços explícitos do perfil dispensam a descoberta (HubSpot)', async () => {
  const { fetch, chamadas } = rede({})
  const achado = await descobrirServidorDeAutorizacao({
    urlMcp: 'https://mcp.hubspot.test',
    autorizacao: 'https://mcp.hubspot.test/oauth/authorize',
    token: 'https://mcp.hubspot.test/oauth/v3/token',
    fetch,
  })
  assertEquals(achado.token_endpoint, 'https://mcp.hubspot.test/oauth/v3/token')
  assertEquals(chamadas.length, 0)
})

Deno.test('um servidor sem PKCE S256 é recusado', async () => {
  const { fetch } = rede({
    'GET https://mcp.falso.test/.well-known/oauth-authorization-server': () =>
      json({ ...META_AS, code_challenge_methods_supported: ['plain'] }),
  })
  await assertRejects(() => descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.falso.test', fetch }), ErroDeOAuth, 'PKCE')
})

Deno.test('registra a Althius como cliente público (RFC 7591) e devolve o client_id', async () => {
  const { fetch, chamadas } = rede({
    'POST https://auth.falso.test/register': () => json({ client_id: 'cid-novo' }, 201),
  })
  const cliente = await registrarClienteDinamico({
    endpointDeRegistro: 'https://auth.falso.test/register',
    urlDeRetorno: 'https://proj.supabase.co/functions/v1/integration-callback',
    nomeDoCliente: 'Althius',
    metodosDeAutenticacao: ['none', 'client_secret_post'],
    fetch,
  })
  assertEquals(cliente, { clientId: 'cid-novo', clientSecret: null })
  const corpo = JSON.parse(chamadas[0].corpo)
  assertEquals(corpo.redirect_uris, ['https://proj.supabase.co/functions/v1/integration-callback'])
  assertEquals(corpo.token_endpoint_auth_method, 'none')
  assertEquals(corpo.grant_types, ['authorization_code', 'refresh_token'])
})

Deno.test('quando o servidor só aceita cliente com segredo, registra assim e guarda o segredo', async () => {
  const { fetch, chamadas } = rede({
    'POST https://auth.falso.test/register': () => json({ client_id: 'cid', client_secret: 'segredo-do-cliente' }, 201),
  })
  const cliente = await registrarClienteDinamico({
    endpointDeRegistro: 'https://auth.falso.test/register',
    urlDeRetorno: 'https://x.test/cb',
    nomeDoCliente: 'Althius',
    metodosDeAutenticacao: ['client_secret_post'],
    fetch,
  })
  assertEquals(cliente.clientSecret, 'segredo-do-cliente')
  assertEquals(JSON.parse(chamadas[0].corpo).token_endpoint_auth_method, 'client_secret_post')
})

Deno.test('um registro recusado vira recusado, sem expor o corpo', async () => {
  const { fetch } = rede({ 'POST https://auth.falso.test/register': () => json({ error: 'invalid_redirect_uri' }, 400) })
  const erro = await assertRejects(
    () => registrarClienteDinamico({ endpointDeRegistro: 'https://auth.falso.test/register', urlDeRetorno: 'x', nomeDoCliente: 'A', fetch }),
    ErroDeOAuth,
  )
  assertEquals(erro.tipo, 'recusado')
  assertEquals(erro.codigo, 'invalid_redirect_uri')
})

Deno.test('o endereço de consentimento leva PKCE S256, state, redirect_uri e o recurso', () => {
  const url = new URL(urlDeConsentimento({
    endpointDeAutorizacao: 'https://auth.falso.test/authorize',
    clientId: 'cid',
    urlDeRetorno: 'https://x.test/cb',
    state: 'estado-123',
    desafio: 'desafio-abc',
    recurso: 'https://mcp.falso.test/mcp',
  }))
  assertEquals(url.searchParams.get('response_type'), 'code')
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256')
  assertEquals(url.searchParams.get('code_challenge'), 'desafio-abc')
  assertEquals(url.searchParams.get('state'), 'estado-123')
  assertEquals(url.searchParams.get('redirect_uri'), 'https://x.test/cb')
  assertEquals(url.searchParams.get('resource'), 'https://mcp.falso.test/mcp')
  assertEquals(url.searchParams.get('scope'), null)
})

Deno.test('troca o código com o verificador PKCE e lê os tokens (client_secret_post)', async () => {
  const { fetch, chamadas } = rede({
    'POST https://auth.falso.test/token': () =>
      json({ access_token: 'acc', refresh_token: 'ref', expires_in: 1800, token_type: 'bearer', hub_id: 123 }),
  })
  const tokens = await trocarCodigo({
    tokenEndpoint: 'https://auth.falso.test/token',
    cliente: { clientId: 'cid', clientSecret: 'sec', autenticacao: 'client_secret_post' },
    codigo: 'codigo-1',
    urlDeRetorno: 'https://x.test/cb',
    verificador: 'verificador-1',
    recurso: 'https://mcp.falso.test/mcp',
    fetch,
  })
  assertEquals(tokens.accessToken, 'acc')
  assertEquals(tokens.refreshToken, 'ref')
  assertEquals(tokens.expiraEm, 1800)
  assertEquals(tokens.bruto.hub_id, 123)
  const corpo = new URLSearchParams(chamadas[0].corpo)
  assertEquals(corpo.get('grant_type'), 'authorization_code')
  assertEquals(corpo.get('code'), 'codigo-1')
  assertEquals(corpo.get('code_verifier'), 'verificador-1')
  assertEquals(corpo.get('client_id'), 'cid')
  assertEquals(corpo.get('client_secret'), 'sec')
  assertEquals(corpo.get('resource'), 'https://mcp.falso.test/mcp')
  assertEquals(chamadas[0].cabecalhos.get('Authorization'), null)
})

Deno.test('cliente público manda só o client_id; client_secret_basic usa o cabeçalho', async () => {
  const { fetch, chamadas } = rede({ 'POST https://auth.falso.test/token': () => json({ access_token: 'a' }) })
  const base = { tokenEndpoint: 'https://auth.falso.test/token', codigo: 'c', urlDeRetorno: 'https://x.test/cb', verificador: 'v', fetch }
  await trocarCodigo({ ...base, cliente: { clientId: 'cid', clientSecret: null, autenticacao: autenticacaoDoCliente(null) } })
  const publico = new URLSearchParams(chamadas[0].corpo)
  assertEquals(publico.get('client_id'), 'cid')
  assertEquals(publico.get('client_secret'), null)
  await trocarCodigo({ ...base, cliente: { clientId: 'cid', clientSecret: 'sec', autenticacao: 'client_secret_basic' } })
  assertEquals(chamadas[1].cabecalhos.get('Authorization'), `Basic ${btoa('cid:sec')}`)
  assertEquals(new URLSearchParams(chamadas[1].corpo).get('client_secret'), null)
})

Deno.test('renovar devolve o refresh token novo (HubSpot e Notion trocam a cada renovação)', async () => {
  const { fetch, chamadas } = rede({
    'POST https://auth.falso.test/token': () => json({ access_token: 'acc-2', refresh_token: 'ref-2', expires_in: 1800 }),
  })
  const tokens = await renovarToken({
    tokenEndpoint: 'https://auth.falso.test/token',
    cliente: { clientId: 'cid', clientSecret: 'sec', autenticacao: 'client_secret_post' },
    refreshToken: 'ref-1',
    fetch,
  })
  assertEquals([tokens.accessToken, tokens.refreshToken], ['acc-2', 'ref-2'])
  const corpo = new URLSearchParams(chamadas[0].corpo)
  assertEquals(corpo.get('grant_type'), 'refresh_token')
  assertEquals(corpo.get('refresh_token'), 'ref-1')
})

Deno.test('uma renovação recusada traz o código do OAuth; queda do servidor vira indisponivel; sem token vira protocolo', async () => {
  const cliente = { clientId: 'cid', clientSecret: 'sec-do-cliente', autenticacao: 'client_secret_post' as const }
  const base = { tokenEndpoint: 'https://auth.falso.test/token', cliente, refreshToken: 'ref-secreto-1' }
  const recusa = rede({ 'POST https://auth.falso.test/token': () => json({ error: 'invalid_grant', error_description: 'refresh-secreto-1 expirou' }, 400) })
  const erro = await assertRejects(() => renovarToken({ ...base, fetch: recusa.fetch }), ErroDeOAuth)
  assertEquals([erro.tipo, erro.codigo], ['recusado', 'invalid_grant'])
  assert(!erro.message.includes('ref-secreto-1') && !erro.message.includes('sec-do-cliente'))
  const queda = rede({ 'POST https://auth.falso.test/token': () => json({}, 503) })
  assertEquals((await assertRejects(() => renovarToken({ ...base, fetch: queda.fetch }), ErroDeOAuth)).tipo, 'indisponivel')
  const vazio = rede({ 'POST https://auth.falso.test/token': () => json({ token_type: 'bearer' }) })
  assertEquals((await assertRejects(() => renovarToken({ ...base, fetch: vazio.fetch }), ErroDeOAuth)).tipo, 'protocolo')
})

Deno.test('a descoberta lê o endereço de revogação (RFC 7009) só quando é https', async () => {
  const com = rede({
    'GET https://mcp.falso.test/.well-known/oauth-protected-resource/mcp': () =>
      json({ resource: 'https://mcp.falso.test/mcp', authorization_servers: ['https://auth.falso.test'] }),
    'GET https://auth.falso.test/.well-known/oauth-authorization-server': () =>
      json({ ...META_AS, revocation_endpoint: 'https://auth.falso.test/revoke' }),
  })
  const achado = await descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.falso.test/mcp', fetch: com.fetch })
  assertEquals(achado.revocation_endpoint, 'https://auth.falso.test/revoke')
  const inseguro = rede({
    'GET https://mcp.falso.test/.well-known/oauth-protected-resource/mcp': () =>
      json({ resource: 'https://mcp.falso.test/mcp', authorization_servers: ['https://auth.falso.test'] }),
    'GET https://auth.falso.test/.well-known/oauth-authorization-server': () =>
      json({ ...META_AS, revocation_endpoint: 'http://auth.falso.test/revoke' }),
  })
  const semRevogacao = await descobrirServidorDeAutorizacao({ urlMcp: 'https://mcp.falso.test/mcp', fetch: inseguro.fetch })
  assertEquals(semRevogacao.revocation_endpoint, undefined)
})

Deno.test('revoga o token com a dica do tipo e a autenticação do cliente (RFC 7009)', async () => {
  const { fetch, chamadas } = rede({ 'POST https://auth.falso.test/revoke': () => new Response('', { status: 200 }) })
  await revogarToken({
    endpoint: 'https://auth.falso.test/revoke',
    cliente: { clientId: 'cid', clientSecret: 'sec', autenticacao: 'client_secret_basic' },
    token: 'ref-1',
    dica: 'refresh_token',
    fetch,
  })
  const corpo = new URLSearchParams(chamadas[0].corpo)
  assertEquals([corpo.get('token'), corpo.get('token_type_hint'), corpo.get('client_id')], ['ref-1', 'refresh_token', null])
  assertEquals(chamadas[0].cabecalhos.get('Authorization'), `Basic ${btoa('cid:sec')}`)
  await revogarToken({
    endpoint: 'https://auth.falso.test/revoke',
    cliente: { clientId: 'cid', clientSecret: null, autenticacao: 'none' },
    token: 'acc-1',
    dica: 'access_token',
    fetch,
  })
  assertEquals(new URLSearchParams(chamadas[1].corpo).get('client_id'), 'cid')
})

Deno.test('uma revogação recusada vira recusado e a queda vira indisponivel, sem expor o token', async () => {
  const base = {
    endpoint: 'https://auth.falso.test/revoke',
    cliente: { clientId: 'cid', clientSecret: 'sec-do-cliente', autenticacao: 'client_secret_post' as const },
    token: 'ref-secreto-1',
    dica: 'refresh_token' as const,
  }
  const recusa = rede({ 'POST https://auth.falso.test/revoke': () => json({ error: 'invalid_client' }, 401) })
  const erro = await assertRejects(() => revogarToken({ ...base, fetch: recusa.fetch }), ErroDeOAuth)
  assertEquals([erro.tipo, erro.codigo], ['recusado', 'invalid_client'])
  assert(!erro.message.includes('ref-secreto-1') && !erro.message.includes('sec-do-cliente'))
  const queda = rede({ 'POST https://auth.falso.test/revoke': () => json({}, 503) })
  assertEquals((await assertRejects(() => revogarToken({ ...base, fetch: queda.fetch }), ErroDeOAuth)).tipo, 'indisponivel')
})

Deno.test('TikTok Ads: o emissor com caminho tem o metadado em <emissor>/.well-known/openid-configuration (lido em 19/10/2026)', async () => {
  const emissor = 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth'
  const { fetch, chamadas } = rede({
    'GET https://business-api.tiktok.com/.well-known/oauth-protected-resource/open_mcp/tt-ads-mcp-layer': () =>
      json({ resource: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer', authorization_servers: [emissor], scopes_supported: ['mcp:tt4b'] }),
    [`GET ${emissor}/.well-known/openid-configuration`]: () =>
      json({
        issuer: emissor,
        authorization_endpoint: 'https://business-api.tiktok.com/portal/mcp-tt4b-authorize',
        token_endpoint: `${emissor}/token`,
        registration_endpoint: `${emissor}/register`,
        revocation_endpoint: `${emissor}/revoke`,
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      }),
  })
  const achado = await descobrirServidorDeAutorizacao({ urlMcp: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer', fetch })
  assertEquals(achado.issuer, emissor)
  assertEquals(achado.registration_endpoint, `${emissor}/register`)
  assertEquals(achado.revocation_endpoint, `${emissor}/revoke`)
  assertEquals(achado.resource, 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer')
  assert(chamadas.some((c) => c.url === `${emissor}/.well-known/openid-configuration`))
})

Deno.test('o consentimento leva os parâmetros extras do perfil (access_type=offline), sem deixar sobrescrever os do OAuth', () => {
  const url = new URL(urlDeConsentimento({
    endpointDeAutorizacao: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: 'cid',
    urlDeRetorno: 'https://x.test/cb',
    state: 'estado-1',
    desafio: 'desafio-1',
    escopo: 'openid email',
    extras: { access_type: 'offline', prompt: 'consent', client_id: 'forjado', state: 'forjado', redirect_uri: 'https://mal.test' },
  }))
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('prompt'), 'consent')
  assertEquals(url.searchParams.get('client_id'), 'cid')
  assertEquals(url.searchParams.get('state'), 'estado-1')
  assertEquals(url.searchParams.get('redirect_uri'), 'https://x.test/cb')
  assertEquals(url.searchParams.getAll('client_id').length, 1)
})
