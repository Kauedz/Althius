import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

// A volta do Bitrix24 (conector-bitrix24 01): o Bitrix24 é um CRM, e o primeiro Acesso fixa o portal do Workspace
// (ADR-0017). O portal vem da resposta do token (`member_id`, ou `domain`), como no OAuth do Bitrix24. não confirmado: se o
// token do servidor MCP traz esses campos; sem portal, a conexão é recusada com o motivo, nunca gravada sem portal.

const APP = 'https://app.althius.test'

function montar(respostaDoToken: Record<string, unknown>) {
  const concluidas: Parameters<Db['concluir']>[0][] = []
  const db: Db = {
    tentativa: () =>
      Promise.resolve({
        status: 'ok',
        workspaceId: 'ws-1',
        userId: 'u-1',
        integrationId: 'bitrix24',
        issuer: 'https://mcp.bitrix24.com',
        codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
        redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
        returnTo: APP,
        tokenEndpoint: 'https://mcp.bitrix24.com/oauth/token',
        clientId: 'cid-bx',
        resource: 'https://mcp.bitrix24.com',
      }),
    concluir: (a) => (concluidas.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve({ clientId: 'cid-bx', clientSecret: 'segredo-bx' }),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://mcp.bitrix24.com/oauth/token') return new Response(JSON.stringify(respostaDoToken), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const handler = createHandler({ db, ambiente: () => undefined, appOrigin: APP, fetch: fetchFalso, log: () => {} })
  const retorno = async () => {
    const r = await handler(new Request('https://proj.supabase.co/functions/v1/integration-callback?code=codigo-1&state=estado-1'))
    return Object.fromEntries(new URL(r.headers.get('Location')!).searchParams)
  }
  return { concluidas, retorno }
}

Deno.test('Bitrix24: o portal do Acesso vem do member_id da resposta do token', async () => {
  const { concluidas, retorno } = montar({ access_token: 'acc-bx', refresh_token: 'ref-bx', expires_in: 3600, member_id: 'm-123', domain: 'norte.bitrix24.com.br' })
  assertEquals((await retorno()).conexao, 'ok')
  assertEquals(concluidas[0].appPortal, 'm-123')
})

Deno.test('Bitrix24: sem member_id, o domínio do portal serve', async () => {
  const { concluidas, retorno } = montar({ access_token: 'acc-bx', domain: 'norte.bitrix24.com.br' })
  await retorno()
  assertEquals(concluidas[0].appPortal, 'norte.bitrix24.com.br')
})

Deno.test('Bitrix24: sem portal identificado, a conexão é recusada com o motivo e nada é gravado', async () => {
  const { concluidas, retorno } = montar({ access_token: 'acc-bx', refresh_token: 'ref-bx' })
  assertEquals(await retorno(), { conexao: 'erro', integracao: 'bitrix24', motivo: 'portal_nao_identificado' })
  assertEquals(concluidas.length, 0)
})
