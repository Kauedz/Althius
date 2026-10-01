import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Tentativa } from '../_shared/integracoes/banco-supabase.ts'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'

const APP = 'https://app.althius.test'

function tentativaDoHubspot(sobrescrever: Partial<Tentativa & { resource: string | null }> = {}): Tentativa & { resource: string | null } {
  return {
    status: 'ok',
    workspaceId: 'ws-1',
    userId: 'u-1',
    integrationId: 'hubspot',
    issuer: 'https://mcp.hubspot.com',
    codeVerifier: 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789',
    redirectUri: 'https://proj.supabase.co/functions/v1/integration-callback',
    returnTo: APP,
    tokenEndpoint: 'https://mcp.hubspot.com/oauth/v3/token',
    clientId: 'cid-hubspot',
    resource: null,
    ...sobrescrever,
  }
}

interface Montagem {
  tentativa?: (Tentativa & { resource: string | null }) | null
  token?: { status: number; corpo: unknown }
  identificacao?: { status: number; corpo: unknown }
  erroAoConcluir?: ErroDoBanco
  ambiente?: Record<string, string>
  clienteGuardado?: { clientId: string; clientSecret: string | null }
}

function montar(m: Montagem = {}) {
  const c = {
    concluidas: [] as Parameters<Db['concluir']>[0][],
    rede: [] as { url: string; corpo: string }[],
    logs: [] as Record<string, unknown>[],
  }
  const db: Db = {
    tentativa: () => Promise.resolve(m.tentativa === undefined ? tentativaDoHubspot() : m.tentativa),
    concluir: (a) => {
      if (m.erroAoConcluir) return Promise.reject(m.erroAoConcluir)
      c.concluidas.push(a)
      return Promise.resolve('acesso-1')
    },
    clienteOAuth: () => Promise.resolve(m.clienteGuardado ?? null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push({ url: req.url, corpo: req.method === 'GET' ? '' : await req.text() })
    if (req.url.endsWith('/token')) {
      const t = m.token ?? { status: 200, corpo: { access_token: 'acc-novo-111', refresh_token: 'ref-novo-111', expires_in: 1800 } }
      return new Response(JSON.stringify(t.corpo), { status: t.status })
    }
    if (req.url.startsWith('https://api.hubapi.com/oauth/v1/access-tokens/')) {
      const i = m.identificacao ?? { status: 200, corpo: { hub_id: 1234, user: 'ana@norte.test' } }
      return new Response(JSON.stringify(i.corpo), { status: i.status })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const ambiente: Record<string, string> = m.ambiente ?? { HUBSPOT_MCP_CLIENT_ID: 'cid-hubspot', HUBSPOT_MCP_CLIENT_SECRET: 'segredo-hubspot-xyz' }
  const handler = createHandler({
    db,
    ambiente: (nome) => ambiente[nome],
    appOrigin: `${APP}, http://localhost:5173`,
    fetch: fetchFalso,
    log: (campos) => c.logs.push(campos),
  })
  const retorno = (consulta: string, metodo = 'GET') =>
    handler(new Request(`https://proj.supabase.co/functions/v1/integration-callback?${consulta}`, { method: metodo }))
  return { c, retorno }
}

const destino = (r: Response) => new URL(r.headers.get('Location') ?? '')

Deno.test('o retorno certo troca o código com o PKCE, grava o Acesso e volta para Conexões com "ok"', async () => {
  const { c, retorno } = montar()
  const r = await retorno('code=codigo-1&state=estado-1')
  assertEquals(r.status, 302)
  const url = destino(r)
  assertEquals(url.origin + url.pathname, `${APP}/conexoes`)
  assertEquals(Object.fromEntries(url.searchParams), { conexao: 'ok', integracao: 'hubspot' })

  const troca = new URLSearchParams(c.rede[0].corpo)
  assertEquals(c.rede[0].url, 'https://mcp.hubspot.com/oauth/v3/token')
  assertEquals(troca.get('grant_type'), 'authorization_code')
  assertEquals(troca.get('code'), 'codigo-1')
  assertEquals(troca.get('code_verifier'), 'verificador-secreto-abcdefghijklmnopqrstuvwxyz0123456789')
  assertEquals(troca.get('client_id'), 'cid-hubspot')
  assertEquals(troca.get('client_secret'), 'segredo-hubspot-xyz')
  assertEquals(troca.get('resource'), null)
  assertEquals(c.rede[1].url, 'https://api.hubapi.com/oauth/v1/access-tokens/acc-novo-111')

  assertEquals(c.concluidas, [{
    state: 'estado-1',
    accessToken: 'acc-novo-111',
    refreshToken: 'ref-novo-111',
    expiresIn: 1800,
    accountLabel: 'ana@norte.test',
    appPortal: '1234',
    scopes: null,
  }])
  const visivel = `${r.headers.get('Location')} ${JSON.stringify(c.logs)}`
  for (const segredo of ['acc-novo-111', 'ref-novo-111', 'codigo-1', 'estado-1', 'verificador-secreto']) assert(!visivel.includes(segredo), segredo)
})

Deno.test('um state forjado não troca nada e volta ao app como inválido', async () => {
  const { c, retorno } = montar({ tentativa: null })
  const r = await retorno('code=codigo-1&state=forjado')
  assertEquals(Object.fromEntries(destino(r).searchParams), { conexao: 'erro', motivo: 'invalida' })
  assertEquals(c.rede, [])
  assertEquals(c.concluidas, [])
  const semState = await montar().retorno('code=codigo-1')
  assertEquals(destino(semState).searchParams.get('motivo'), 'invalida')
})

Deno.test('tentativa usada, vencida ou de participante desativado: volta com o motivo, sem trocar o código', async () => {
  for (const status of ['usada', 'expirada', 'participacao_inativa', 'nao_habilitada'] as const) {
    const { c, retorno } = montar({ tentativa: tentativaDoHubspot({ status, codeVerifier: null }) })
    const r = await retorno('code=codigo-1&state=estado-1')
    assertEquals(destino(r).searchParams.get('motivo'), status)
    assertEquals(destino(r).searchParams.get('integracao'), 'hubspot')
    assertEquals(c.rede, [], status)
    assertEquals(c.concluidas, [], status)
  }
})

Deno.test('o consentimento recusado no app volta como "recusada" e nada é gravado', async () => {
  const { c, retorno } = montar()
  const r = await retorno('error=access_denied&state=estado-1')
  assertEquals(destino(r).searchParams.get('motivo'), 'recusada')
  assertEquals(c.concluidas, [])
  assertEquals(c.rede, [])
})

Deno.test('o app recusa a troca do código ou cai: motivos distintos, nada gravado', async () => {
  const recusada = montar({ token: { status: 400, corpo: { error: 'invalid_grant' } } })
  assertEquals(destino(await recusada.retorno('code=c&state=s')).searchParams.get('motivo'), 'falha_na_troca')
  const caiu = montar({ token: { status: 503, corpo: {} } })
  assertEquals(destino(await caiu.retorno('code=c&state=s')).searchParams.get('motivo'), 'indisponivel')
  assertEquals([...recusada.c.concluidas, ...caiu.c.concluidas], [])
})

Deno.test('um Acesso a outro portal do HubSpot é recusado pelo banco e a tela recebe "portal_diferente"', async () => {
  const { retorno } = montar({ erroAoConcluir: new ErroDoBanco('P0001', 'integration portal mismatch') })
  assertEquals(destino(await retorno('code=c&state=s')).searchParams.get('motivo'), 'portal_diferente')
})

Deno.test('o banco que recusa por prazo, uso repetido ou Participação desativada vira o motivo certo', async () => {
  const casos: [ErroDoBanco, string][] = [
    [new ErroDoBanco('55000', 'connect attempt already used'), 'usada'],
    [new ErroDoBanco('55000', 'connect attempt expired'), 'expirada'],
    [new ErroDoBanco('42501', 'active workspace membership required'), 'participacao_inativa'],
    [new ErroDoBanco('22023', 'integration not enabled'), 'nao_habilitada'],
    [new ErroDoBanco('XX000', 'qualquer outra coisa'), 'erro'],
  ]
  for (const [erro, motivo] of casos) {
    const { retorno } = montar({ erroAoConcluir: erro })
    assertEquals(destino(await retorno('code=c&state=s')).searchParams.get('motivo'), motivo)
  }
})

Deno.test('o HubSpot sem como identificar o portal não conecta: o portal é o que impede misturar dois CRMs', async () => {
  const { c, retorno } = montar({ identificacao: { status: 401, corpo: {} } })
  const r = await retorno('code=c&state=s')
  assertEquals(destino(r).searchParams.get('motivo'), 'portal_nao_identificado')
  assertEquals(c.concluidas, [])
})

Deno.test('a origem de volta só vale se estiver no APP_ORIGIN', async () => {
  const fora = montar({ tentativa: tentativaDoHubspot({ returnTo: 'https://evil.test' }) })
  assertEquals(destino(await fora.retorno('code=c&state=s')).origin, APP)
  const local = montar({ tentativa: tentativaDoHubspot({ returnTo: 'http://localhost:5173' }) })
  assertEquals(destino(await local.retorno('code=c&state=s')).origin, 'http://localhost:5173')
})

Deno.test('Notion: cliente de registro dinâmico (público) do banco e a conta pelo nome do workspace', async () => {
  const { c, retorno } = montar({
    tentativa: tentativaDoHubspot({
      integrationId: 'notion',
      issuer: 'https://mcp.notion.com',
      tokenEndpoint: 'https://mcp.notion.com/token',
      clientId: 'cid-notion',
      resource: 'https://mcp.notion.com/mcp',
    }),
    clienteGuardado: { clientId: 'cid-notion', clientSecret: null },
    token: { status: 200, corpo: { access_token: 'acc-notion', refresh_token: 'ref-notion', expires_in: 3600, workspace_name: 'Norte Ltda' } },
    ambiente: {},
  })
  const r = await retorno('code=codigo-n&state=estado-n')
  assertEquals(Object.fromEntries(destino(r).searchParams), { conexao: 'ok', integracao: 'notion' })
  const troca = new URLSearchParams(c.rede[0].corpo)
  assertEquals(troca.get('client_id'), 'cid-notion')
  assertEquals(troca.get('client_secret'), null)
  assertEquals(troca.get('resource'), 'https://mcp.notion.com/mcp')
  assertEquals(c.concluidas[0].accountLabel, 'Norte Ltda')
  assertEquals(c.concluidas[0].appPortal, null)
})

Deno.test('só GET é aceito', async () => {
  const r = await montar().retorno('code=c&state=s', 'POST')
  assertEquals(r.status, 405)
})
