import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// "Conectar no Pipedrive" pelo conector oficial (migration 20261002111000): a função descobre o servidor de autorização a
// partir de mcp.pipedrive.ai, registra o cliente quando o servidor anuncia registro dinâmico e, quando não anuncia, usa o
// app pré-registrado pelos segredos PIPEDRIVE_MCP_CLIENT_ID e PIPEDRIVE_MCP_CLIENT_SECRET.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const URL_DE_RETORNO = 'https://proj.supabase.co/functions/v1/integration-callback'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

/** O servidor de autorização falso do Pipedrive, com ou sem `registration_endpoint`. */
function rotasDoPipedrive(comRegistro: boolean, registros: { n: number }): Record<string, () => Response> {
  return {
    'GET https://mcp.pipedrive.ai/.well-known/oauth-protected-resource/mcp': () =>
      json({ resource: 'https://mcp.pipedrive.ai/mcp', authorization_servers: ['https://oauth.pipedrive.com'] }),
    'GET https://oauth.pipedrive.com/.well-known/oauth-authorization-server': () =>
      json({
        issuer: 'https://oauth.pipedrive.com',
        authorization_endpoint: 'https://oauth.pipedrive.com/oauth/authorize',
        token_endpoint: 'https://oauth.pipedrive.com/oauth/token',
        ...(comRegistro ? { registration_endpoint: 'https://oauth.pipedrive.com/oauth/register' } : {}),
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      }),
    'POST https://oauth.pipedrive.com/oauth/register': () => (registros.n++, json({ client_id: 'cid-pd-dinamico' }, 201)),
  }
}

function montar(m: { comRegistro: boolean; ambiente?: Record<string, string> }) {
  const tentativas: Parameters<Db['iniciarTentativa']>[0][] = []
  const registros = { n: 0 }
  const guardados: { clientId: string; clientSecret: string | null }[] = []
  const rotas = rotasDoPipedrive(m.comRegistro, registros)
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: (a) => {
      tentativas.push(a)
      return Promise.resolve({ state: 'estado-pd', codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789' })
    },
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: () => Promise.resolve('acesso-1'),
    clienteOAuth: () => Promise.resolve(guardados[0] ?? null),
    salvarClienteOAuth: (a) => (guardados.push({ clientId: a.clientId, clientSecret: a.clientSecret }), Promise.resolve(guardados[0])),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    const rota = rotas[`${req.method} ${req.url}`]
    if (rota) return rota()
    // A sonda do initialize: o servidor MCP pede autorização.
    if (req.url === 'https://mcp.pipedrive.ai/mcp') return new Response('{}', { status: 401 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const ambiente = m.ambiente ?? {}
  const handler = createHandler({
    db,
    ambiente: (nome) => ambiente[nome],
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: URL_DE_RETORNO,
    fetch: fetchFalso,
    log: () => {},
  })
  const iniciar = () =>
    handler(new Request('https://x/integration-connect', {
      method: 'POST',
      body: JSON.stringify({ action: 'iniciar', workspaceId: WS, integrationId: 'pipedrive' }),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { iniciar, tentativas, registros }
}

Deno.test('Pipedrive com registro dinâmico: registra o cliente uma vez e leva ao consentimento no Pipedrive', async () => {
  const { iniciar, tentativas, registros } = montar({ comRegistro: true })
  const r = await iniciar()
  assertEquals(r.status, 200)
  const texto = await r.text()
  assert(!texto.includes('verificador-secreto'))
  const url = new URL(JSON.parse(texto).url)
  assertEquals(url.origin + url.pathname, 'https://oauth.pipedrive.com/oauth/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-pd-dinamico')
  assertEquals(url.searchParams.get('redirect_uri'), URL_DE_RETORNO)
  assertEquals(url.searchParams.get('resource'), 'https://mcp.pipedrive.ai/mcp')
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256')
  assertEquals(tentativas[0].issuer, 'https://oauth.pipedrive.com')
  assertEquals(tentativas[0].tokenEndpoint, 'https://oauth.pipedrive.com/oauth/token')

  await iniciar()
  assertEquals(registros.n, 1, 'o registro dinâmico é feito uma vez só')
})

Deno.test('Pipedrive sem registro dinâmico: usa o app pré-registrado dos segredos PIPEDRIVE_MCP_*', async () => {
  const { iniciar, tentativas, registros } = montar({
    comRegistro: false,
    ambiente: { PIPEDRIVE_MCP_CLIENT_ID: 'cid-pd-app', PIPEDRIVE_MCP_CLIENT_SECRET: 'segredo-pd-xyz' },
  })
  const r = await iniciar()
  assertEquals(r.status, 200)
  const texto = await r.text()
  assert(!texto.includes('segredo-pd-xyz'))
  assertEquals(new URL(JSON.parse(texto).url).searchParams.get('client_id'), 'cid-pd-app')
  assertEquals(tentativas[0].clientId, 'cid-pd-app')
  assertEquals(registros.n, 0)
})

Deno.test('Pipedrive sem registro dinâmico e sem os segredos: "Precisa configurar", sem abrir tentativa', async () => {
  const { iniciar, tentativas } = montar({ comRegistro: false })
  const r = await iniciar()
  assertEquals(r.status, 503)
  const corpo = await r.json()
  assertEquals(corpo.code, 'nao_configurada')
  assert(corpo.error.startsWith('Precisa configurar: o app de autorização do Pipedrive'), corpo.error)
  assertEquals(tentativas, [])
})
