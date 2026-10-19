import { assertEquals } from 'jsr:@std/assert@1'
import { servidorMcpFalso } from '../_shared/integracoes/servidor-mcp-falso.ts'
import { createHandler, type Db } from './handler.ts'

// A volta do Calendly (conector-calendly 02): cliente público do registro dinâmico, e a conta de quem conectou pela
// ferramenta `users-get_current_user` do servidor MCP, chamada com o token novo.

const APP = 'https://app.althius.test'

function montar(usuario: unknown) {
  const concluidas: Parameters<Db['concluir']>[0][] = []
  const mcp = servidorMcpFalso({
    token: 'acc-cal-novo',
    ferramentas: [{ name: 'users-get_current_user', annotations: { readOnlyHint: true } }],
    resultados: { 'users-get_current_user': () => ({ content: [{ type: 'text', text: JSON.stringify(usuario) }] }) },
  })
  const db: Db = {
    tentativa: () =>
      Promise.resolve({
        status: 'ok',
        workspaceId: 'ws-1',
        userId: 'u-1',
        integrationId: 'calendly',
        issuer: 'https://calendly.com/',
        codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
        redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
        returnTo: APP,
        tokenEndpoint: 'https://calendly.com/oauth/token',
        clientId: 'cid-cal',
        resource: 'https://mcp.calendly.com/',
      }),
    concluir: (a) => (concluidas.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve({ clientId: 'cid-cal', clientSecret: null }),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const trocas: URLSearchParams[] = []
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url.startsWith('https://mcp.calendly.com')) return await mcp.fetch(req)
    if (req.url === 'https://calendly.com/oauth/token') {
      trocas.push(new URLSearchParams(await req.text()))
      return new Response(JSON.stringify({ access_token: 'acc-cal-novo', refresh_token: 'ref-cal-novo', expires_in: 7200 }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const handler = createHandler({ db, ambiente: () => undefined, appOrigin: APP, fetch: fetchFalso, log: () => {} })
  const retorno = () => handler(new Request('https://proj.supabase.co/functions/v1/integration-callback?code=codigo-1&state=estado-1'))
  return { concluidas, trocas, retorno }
}

Deno.test('Calendly: troca como cliente público, com o recurso da descoberta, e a conta vem de users-get_current_user', async () => {
  const { concluidas, trocas, retorno } = montar({ resource: { name: 'Ana Souza', email: 'ana@norte.test', uri: 'https://api.calendly.com/users/U1' } })
  const r = await retorno()
  assertEquals(new URL(r.headers.get('Location')!).searchParams.get('conexao'), 'ok')
  assertEquals([trocas[0].get('client_id'), trocas[0].get('client_secret'), trocas[0].get('resource')], ['cid-cal', null, 'https://mcp.calendly.com/'])
  assertEquals(concluidas[0].accountLabel, 'ana@norte.test')
})

Deno.test('Calendly: sem e-mail, a conta é o nome', async () => {
  const { concluidas, retorno } = montar({ resource: { name: 'Ana Souza' } })
  await retorno()
  assertEquals(concluidas[0].accountLabel, 'Ana Souza')
})
