import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// A volta do Google Calendar (conector-google-calendar 02): a troca com o cliente OAuth da Althius e a conta pelo userinfo
// do OpenID Connect, com o token novo no cabeçalho, sem o token chegar a log.

const APP = 'https://app.althius.test'

function montar(userinfo: { status: number; corpo: unknown }) {
  const concluidas: Parameters<Db['concluir']>[0][] = []
  const rede: { url: string; autorizacao: string | null }[] = []
  const logs: Record<string, unknown>[] = []
  const db: Db = {
    tentativa: () =>
      Promise.resolve({
        status: 'ok',
        workspaceId: 'ws-1',
        userId: 'u-1',
        integrationId: 'google-calendar',
        issuer: 'https://accounts.google.com',
        codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
        redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
        returnTo: APP,
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        clientId: 'cid-google',
        resource: null,
      }),
    concluir: (a) => (concluidas.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    rede.push({ url: req.url, autorizacao: req.headers.get('Authorization') })
    if (req.url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'acc-google-1', refresh_token: 'ref-google-1', expires_in: 3599 }), { status: 200 })
    }
    if (req.url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return new Response(JSON.stringify(userinfo.corpo), { status: userinfo.status })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const ambiente: Record<string, string> = { GOOGLE_CALENDAR_MCP_CLIENT_ID: 'cid-google', GOOGLE_CALENDAR_MCP_CLIENT_SECRET: 'segredo-google' }
  const handler = createHandler({ db, ambiente: (nome) => ambiente[nome], appOrigin: APP, fetch: fetchFalso, log: (c) => logs.push(c) })
  const retorno = () => handler(new Request('https://proj.supabase.co/functions/v1/integration-callback?code=codigo-1&state=estado-1'))
  return { concluidas, rede, logs, retorno }
}

Deno.test('Google Calendar: a conta vem do userinfo, com o token novo no cabeçalho, e o refresh token é guardado', async () => {
  const { concluidas, rede, logs, retorno } = montar({ status: 200, corpo: { sub: '1', email: 'ana@norte.test', name: 'Ana Souza' } })
  const r = await retorno()
  assertEquals(new URL(r.headers.get('Location')!).searchParams.get('conexao'), 'ok')
  assertEquals(rede.find((x) => x.url.includes('userinfo'))?.autorizacao, 'Bearer acc-google-1')
  assertEquals([concluidas[0].accountLabel, concluidas[0].refreshToken], ['ana@norte.test', 'ref-google-1'])
  assert(!JSON.stringify(logs).includes('acc-google-1'))
})

Deno.test('Google Calendar: sem o userinfo, conecta mesmo assim e o cartão mostra só "Conectado"', async () => {
  const { concluidas, retorno } = montar({ status: 401, corpo: {} })
  const r = await retorno()
  assertEquals(new URL(r.headers.get('Location')!).searchParams.get('conexao'), 'ok')
  assertEquals(concluidas[0].accountLabel, null)
})
