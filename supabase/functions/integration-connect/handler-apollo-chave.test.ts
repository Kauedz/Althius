import { assert, assertEquals } from 'jsr:@std/assert@1'
import { servidorMcpFalso } from '../_shared/integracoes/servidor-mcp-falso.ts'
import { createHandler, type Db } from './handler.ts'

// A chave de API do Apollo pelo servidor MCP (conector-apollo 02): validada listando as ferramentas de
// https://mcp.apollo.io/mcp com X-Api-Key, como a do Lusha. O MCP do Apollo recusa chave com escopo (403).

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

function montar(valida: string) {
  const c = { chaves: [] as Parameters<Db['salvarChave']>[0][], rede: [] as string[] }
  const mcp = servidorMcpFalso({ chave: { cabecalho: 'x-api-key', valor: valida } })
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
    iniciarTentativa: () => Promise.reject(new Error('não usado')),
    tentativa: () => Promise.resolve(null),
    concluir: () => Promise.resolve('acesso'),
    salvarChave: (a) => (c.chaves.push(a), Promise.resolve('acesso-1')),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push(req.url)
    if (req.url === 'https://mcp.apollo.io/mcp') return await mcp.fetch(req)
    return new Response('{}', { status: 404 })
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

Deno.test('Apollo: a chave mestra é validada no servidor MCP e guardada; a chave nunca volta', async () => {
  const { c, pedir } = montar('chave-mestra-apollo-1')
  const resposta = await pedir({ action: 'chave', workspaceId: WS, integrationId: 'apollo', chave: 'chave-mestra-apollo-1' })
  assertEquals(resposta.status, 200)
  assert(!(await resposta.text()).includes('chave-mestra-apollo-1'))
  assertEquals(c.chaves.map((k) => k.apiKey), ['chave-mestra-apollo-1'])
  assert(c.rede.every((u) => u === 'https://mcp.apollo.io/mcp'), 'a validação vai só ao servidor MCP, não à REST')
})

Deno.test('Apollo: a chave recusada pelo servidor MCP não é guardada', async () => {
  const { c, pedir } = montar('outra-chave')
  const resposta = await pedir({ action: 'chave', workspaceId: WS, integrationId: 'apollo', chave: 'chave-com-escopo-1' })
  assertEquals(resposta.status, 422)
  assertEquals((await resposta.json()).code, 'chave_recusada')
  assertEquals(c.chaves.length, 0)
})
