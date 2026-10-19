import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// O Google Calendar e o Google Sheets (conector-google-calendar 01 e 02, conector-google-sheets 01): o consentimento pede
// `access_type=offline` (sem ele o Google não devolve refresh token e o Acesso cai em uma hora) e os escopos mínimos de
// leitura, com `openid email` para identificar a conta.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const G = 'https://www.googleapis.com/auth/'

function montar() {
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
    if (req.url.endsWith('/.well-known/oauth-protected-resource/mcp/v1')) {
      return json({ resource: req.url.replace('/.well-known/oauth-protected-resource', ''), authorization_servers: ['https://accounts.google.com'] })
    }
    if (req.url === 'https://accounts.google.com/.well-known/openid-configuration') {
      return json({
        issuer: 'https://accounts.google.com',
        authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_endpoint: 'https://oauth2.googleapis.com/token',
        revocation_endpoint: 'https://oauth2.googleapis.com/revoke',
        code_challenge_methods_supported: ['plain', 'S256'],
      })
    }
    return json({}, 404)
  }) as typeof fetch
  const ambiente: Record<string, string> = {
    GOOGLE_CALENDAR_MCP_CLIENT_ID: 'cid-google',
    GOOGLE_CALENDAR_MCP_CLIENT_SECRET: 'segredo-google',
    GOOGLE_SHEETS_MCP_CLIENT_ID: 'cid-google',
    GOOGLE_SHEETS_MCP_CLIENT_SECRET: 'segredo-google',
  }
  const handler = createHandler({
    db,
    ambiente: (nome) => ambiente[nome],
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: 'https://proj.supabase.co/functions/v1/integration-callback',
    fetch: fetchFalso,
    log: () => {},
  })
  return async (integrationId: string) => {
    const r = await handler(new Request('https://x/integration-connect', {
      method: 'POST',
      body: JSON.stringify({ action: 'iniciar', workspaceId: WS, integrationId }),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
    return new URL((await r.json()).url)
  }
}

Deno.test('Google Calendar: pede acesso offline e só os escopos de leitura e disponibilidade, mais openid email', async () => {
  const url = await montar()('google-calendar')
  assertEquals(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('prompt'), 'consent')
  assertEquals(url.searchParams.get('scope')!.split(' ').sort(), [
    'email',
    'openid',
    `${G}calendar.calendarlist.readonly`,
    `${G}calendar.events.freebusy`,
    `${G}calendar.events.readonly`,
  ].sort())
})

Deno.test('Google Sheets: pede acesso offline e só spreadsheets.readonly, mais openid email', async () => {
  const url = await montar()('google-sheets')
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('scope')!.split(' ').sort(), ['email', 'openid', `${G}spreadsheets.readonly`].sort())
})
