import { assert, assertEquals } from 'jsr:@std/assert@1'
import { desafioPkce } from '../_shared/integracoes/oauth.ts'
import { servidorMcpFalso } from '../_shared/integracoes/servidor-mcp-falso.ts'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const URL_DE_RETORNO = 'https://proj.supabase.co/functions/v1/integration-callback'

interface Montagem {
  ambiente?: Record<string, string>
  /** Erro que o banco devolve ao abrir a tentativa ou guardar a chave. */
  erroDoBanco?: ErroDoBanco
  rotas?: Record<string, () => Response>
  mcp?: Parameters<typeof servidorMcpFalso>[0]
  semSessao?: boolean
}

function montar(m: Montagem = {}) {
  const c = {
    tentativas: [] as Parameters<Db['iniciarTentativa']>[0][],
    chaves: [] as Parameters<Db['salvarChave']>[0][],
    clientes: [] as Parameters<Db['salvarClienteOAuth']>[0][],
    rede: [] as string[],
    logs: [] as Record<string, unknown>[],
  }
  const clientesGuardados: { clientId: string; clientSecret: string | null }[] = []
  const mcp = servidorMcpFalso(m.mcp)
  const db: Db = {
    userFromJwt: () => Promise.resolve(m.semSessao ? null : { userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: (a) => {
      if (m.erroDoBanco) return Promise.reject(m.erroDoBanco)
      c.tentativas.push(a)
      return Promise.resolve({ state: 'estado-123', codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789' })
    },
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: (a) => {
      if (m.erroDoBanco) return Promise.reject(m.erroDoBanco)
      c.chaves.push(a)
      return Promise.resolve('acesso-1')
    },
    clienteOAuth: () => Promise.resolve(clientesGuardados[0] ?? null),
    salvarClienteOAuth: (a) => {
      c.clientes.push(a)
      clientesGuardados.push({ clientId: a.clientId, clientSecret: a.clientSecret })
      return Promise.resolve(clientesGuardados[0])
    },
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push(`${req.method} ${req.url}`)
    const rota = m.rotas?.[`${req.method} ${req.url}`]
    if (rota) return rota()
    if (req.url.startsWith('https://mcp.lusha.com')) return await mcp.fetch(req)
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const ambiente = m.ambiente ?? {}
  const handler = createHandler({
    db,
    ambiente: (nome) => ambiente[nome],
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: URL_DE_RETORNO,
    fetch: fetchFalso,
    log: (campos) => c.logs.push(campos),
  })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/integration-connect', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir, handler }
}

const HUBSPOT = { HUBSPOT_MCP_CLIENT_ID: 'cid-hubspot', HUBSPOT_MCP_CLIENT_SECRET: 'segredo-hubspot-xyz' }
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.test('sem sessão, sem Integração conhecida e sem ação válida, nada é feito', async () => {
  assertEquals((await montar({ semSessao: true }).pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'hubspot' })).status, 401)
  const { pedir, c } = montar({ ambiente: HUBSPOT })
  assertEquals((await pedir({ action: 'iniciar', workspaceId: 'x', integrationId: 'hubspot' })).status, 400)
  assertEquals((await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'kommo' })).status, 404)
  assertEquals((await pedir({ action: 'apagar', workspaceId: WS, integrationId: 'hubspot' })).status, 400)
  assertEquals(c.tentativas, [])
})

Deno.test('HubSpot: devolve o endereço de consentimento com PKCE, e o verificador nunca sai da função', async () => {
  const { pedir, c } = montar({ ambiente: HUBSPOT })
  const resposta = await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals(resposta.status, 200)
  const texto = await resposta.text()
  const { url } = JSON.parse(texto)
  assert(!texto.includes('verificador-secreto'))
  assert(!texto.includes('segredo-hubspot-xyz'))
  const consentimento = new URL(url)
  assertEquals(consentimento.origin + consentimento.pathname, 'https://mcp.hubspot.com/oauth/authorize/user')
  assertEquals(consentimento.searchParams.get('client_id'), 'cid-hubspot')
  assertEquals(consentimento.searchParams.get('state'), 'estado-123')
  assertEquals(consentimento.searchParams.get('redirect_uri'), URL_DE_RETORNO)
  assertEquals(consentimento.searchParams.get('code_challenge_method'), 'S256')
  assertEquals(
    consentimento.searchParams.get('code_challenge'),
    await desafioPkce('verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789'),
  )
  assertEquals(consentimento.searchParams.get('resource'), null)
  assertEquals(c.tentativas[0], {
    workspaceId: WS,
    userId: 'u1',
    integrationId: 'hubspot',
    issuer: 'https://mcp.hubspot.com',
    redirectUri: URL_DE_RETORNO,
    tokenEndpoint: 'https://mcp.hubspot.com/oauth/v3/token',
    clientId: 'cid-hubspot',
    resource: null,
    returnTo: 'https://app.althius.test',
  })
  assertEquals(c.rede, [], 'o HubSpot tem endereços no perfil: nenhuma descoberta')
})

Deno.test('HubSpot sem os segredos do MCP Auth App: "Precisa configurar", sem abrir tentativa', async () => {
  const { pedir, c } = montar()
  const resposta = await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals(resposta.status, 503)
  const corpo = await resposta.json()
  assertEquals(corpo.code, 'nao_configurada')
  assert(corpo.error.startsWith('Precisa configurar'))
  assertEquals(c.tentativas, [])
  // Só o client id, sem o secret, também não vale: o app do HubSpot é confidencial.
  const meio = montar({ ambiente: { HUBSPOT_MCP_CLIENT_ID: 'cid' } })
  assertEquals((await meio.pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'hubspot' })).status, 503)
})

Deno.test('Notion: descobre o servidor, registra o cliente uma vez e o reaproveita na segunda conexão', async () => {
  let registros = 0
  const rotas: Record<string, () => Response> = {
    'GET https://mcp.notion.com/.well-known/oauth-protected-resource/mcp': () =>
      json({ resource: 'https://mcp.notion.com/mcp', authorization_servers: ['https://mcp.notion.com'] }),
    'GET https://mcp.notion.com/.well-known/oauth-authorization-server': () =>
      json({
        issuer: 'https://mcp.notion.com',
        authorization_endpoint: 'https://mcp.notion.com/authorize',
        token_endpoint: 'https://mcp.notion.com/token',
        registration_endpoint: 'https://mcp.notion.com/register',
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      }),
    'POST https://mcp.notion.com/register': () => (registros++, json({ client_id: 'cid-notion' }, 201)),
  }
  const { pedir, c } = montar({ rotas })
  const primeira = await (await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'notion' })).json()
  const url = new URL(primeira.url)
  assertEquals(url.origin + url.pathname, 'https://mcp.notion.com/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-notion')
  assertEquals(url.searchParams.get('resource'), 'https://mcp.notion.com/mcp')
  await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'notion' })
  assertEquals(registros, 1, 'o registro dinâmico é feito uma vez só')
  assertEquals(c.clientes.length, 1)
  assertEquals(c.tentativas.map((t) => t.clientId), ['cid-notion', 'cid-notion'])
})

Deno.test('servidor de autorização que não responde: indisponível, sem tentativa', async () => {
  const { pedir, c } = montar()
  const resposta = await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'notion' })
  assertEquals(resposta.status, 502)
  assertEquals(c.tentativas, [])
})

Deno.test('Integração não habilitada ou Participação inativa: o erro do banco vira 409 e 403, sem detalhe', async () => {
  const naoHabilitada = montar({ ambiente: HUBSPOT, erroDoBanco: new ErroDoBanco('22023', 'integration not enabled') })
  const r1 = await naoHabilitada.pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals([r1.status, (await r1.json()).code], [409, 'nao_habilitada'])
  const inativa = montar({ ambiente: HUBSPOT, erroDoBanco: new ErroDoBanco('42501', 'active workspace membership required') })
  assertEquals((await inativa.pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'hubspot' })).status, 403)
})

Deno.test('chave de API do Pipedrive: valida no app, guarda com o portal e a conta, e a chave nunca volta', async () => {
  const chave = 'pd-token-secreto-123456'
  const rotas = {
    [`GET https://api.pipedrive.com/v1/users/me?api_token=${chave}`]: () =>
      json({ success: true, data: { name: 'Ana', email: 'ana@norte.test', company_id: 98765 } }),
  }
  const { pedir, c } = montar({ rotas })
  const resposta = await pedir({ action: 'chave', workspaceId: WS, integrationId: 'pipedrive', chave: `  ${chave}  ` })
  assertEquals(resposta.status, 200)
  const texto = await resposta.text()
  assertEquals(JSON.parse(texto), { ok: true, conta: 'ana@norte.test', portal: '98765' })
  assert(!texto.includes(chave))
  assertEquals(c.chaves, [{ workspaceId: WS, userId: 'u1', integrationId: 'pipedrive', apiKey: chave, accountLabel: 'ana@norte.test', appPortal: '98765' }])
  assert(!JSON.stringify(c.logs).includes(chave))
})

Deno.test('chave recusada pelo app não é guardada; mal formada nem chega ao app', async () => {
  const recusada = montar({ rotas: { 'GET https://api.pipedrive.com/v1/users/me?api_token=chave-errada-1': () => json({}, 401) } })
  const r = await recusada.pedir({ action: 'chave', workspaceId: WS, integrationId: 'pipedrive', chave: 'chave-errada-1' })
  assertEquals([r.status, (await r.json()).code], [422, 'chave_recusada'])
  assertEquals(recusada.c.chaves, [])

  const curta = montar()
  const r2 = await curta.pedir({ action: 'chave', workspaceId: WS, integrationId: 'pipedrive', chave: 'abc def' })
  assertEquals(r2.status, 422)
  assertEquals(curta.c.rede, [])
})

Deno.test('chave de um portal diferente do fixado: o banco recusa e a tela recebe a mensagem do portal', async () => {
  const chave = 'pd-token-de-outra-empresa'
  const { pedir } = montar({
    rotas: { [`GET https://api.pipedrive.com/v1/users/me?api_token=${chave}`]: () => json({ data: { company_id: 1, email: 'x@y.test' } }) },
    erroDoBanco: new ErroDoBanco('P0001', 'integration portal mismatch'),
  })
  const r = await pedir({ action: 'chave', workspaceId: WS, integrationId: 'pipedrive', chave })
  const corpo = await r.json()
  assertEquals([r.status, corpo.code], [409, 'portal_diferente'])
  assert(!JSON.stringify(corpo).includes(chave))
})

Deno.test('uma Integração que fixa o portal e não o identifica não conecta por chave', async () => {
  const chave = 'pat-na-sem-portal-1'
  const { pedir, c } = montar({
    rotas: { 'GET https://api.hubapi.com/account-info/v3/details': () => json({ outraCoisa: 1 }) },
  })
  const r = await pedir({ action: 'chave', workspaceId: WS, integrationId: 'hubspot', chave })
  assertEquals([r.status, (await r.json()).code], [422, 'portal_nao_identificado'])
  assertEquals(c.chaves, [])
})

Deno.test('Lusha: a chave é validada listando as ferramentas do MCP com x-api-key', async () => {
  const valida = montar({ mcp: { chave: { cabecalho: 'x-api-key', valor: 'chave-lusha-123' } } })
  const r = await valida.pedir({ action: 'chave', workspaceId: WS, integrationId: 'lusha', chave: 'chave-lusha-123' })
  assertEquals(r.status, 200)
  assertEquals(valida.c.chaves[0].apiKey, 'chave-lusha-123')
  assertEquals(valida.c.chaves[0].appPortal, null)

  const recusada = montar({ mcp: { chave: { cabecalho: 'x-api-key', valor: 'outra-chave-lusha' } } })
  const r2 = await recusada.pedir({ action: 'chave', workspaceId: WS, integrationId: 'lusha', chave: 'chave-lusha-123' })
  assertEquals([r2.status, (await r2.json()).code], [422, 'chave_recusada'])
  assertEquals(recusada.c.chaves, [])
})

Deno.test('a Integração sem o caminho pedido responde que não conecta assim', async () => {
  const { pedir } = montar({ ambiente: HUBSPOT })
  assertEquals((await pedir({ action: 'chave', workspaceId: WS, integrationId: 'notion', chave: 'qualquer-chave-1' })).status, 400)
  assertEquals((await pedir({ action: 'iniciar', workspaceId: WS, integrationId: 'rd-station' })).status, 400)
})

Deno.test('o preflight do app é respondido com a origem permitida', async () => {
  const { handler } = montar()
  const r = await handler(new Request('https://x/integration-connect', { method: 'OPTIONS', headers: { Origin: 'https://app.althius.test' } }))
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.test')
})
