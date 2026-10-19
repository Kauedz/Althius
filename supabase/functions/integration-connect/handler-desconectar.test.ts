import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type BancoDeDesconexao, ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'

// `action: 'desconectar'` (conector-clay 02): a pessoa desconecta o PRÓPRIO Acesso, identificada pelo JWT; a função
// revoga o token no app quando dá e apaga o Acesso. A resposta diz o que houve com o token, nunca o token.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

function montar(m: { acessoParaUso?: BancoDeDesconexao['acessoParaUso']; semAcessos?: boolean } = {}) {
  const c = { apagados: [] as unknown[], revogacoes: [] as string[], logs: [] as Record<string, unknown>[] }
  const db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1', email: 'ana@norte.test' }),
  } as unknown as Db
  const acessos: BancoDeDesconexao = {
    acessoParaUso: m.acessoParaUso ?? (() =>
      Promise.resolve({
        accessId: 'a1',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ access_token: 'acc-secreto', refresh_token: 'ref-secreto', client_id: 'cid', issuer: 'https://api.clay.com' }),
      })),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve({ clientId: 'cid', clientSecret: null }),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(null),
    apagarAcesso: (a) => (c.apagados.push(a), Promise.resolve(true)),
  }
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://api.clay.com/.well-known/oauth-protected-resource/v3/mcp') {
      return json({ resource: 'https://api.clay.com/v3/mcp', authorization_servers: ['https://api.clay.com'] })
    }
    if (req.url === 'https://api.clay.com/.well-known/oauth-authorization-server') {
      return json({
        issuer: 'https://api.clay.com',
        authorization_endpoint: 'https://app.clay.com/oauth/authorize',
        token_endpoint: 'https://api.clay.com/oauth/token',
        revocation_endpoint: 'https://api.clay.com/oauth/revoke',
      })
    }
    if (req.url === 'https://api.clay.com/oauth/revoke') {
      c.revogacoes.push(await req.text())
      return json({})
    }
    return json({}, 401)
  }) as typeof fetch
  const handler = createHandler({
    db,
    acessos: m.semAcessos ? undefined : acessos,
    ambiente: () => undefined,
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: 'https://proj.supabase.co/functions/v1/integration-callback',
    fetch: fetchFalso,
    log: (campos) => c.logs.push(campos),
  })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/integration-connect', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir }
}

Deno.test('desconectar revoga no app e apaga só o Acesso de quem pediu, sem devolver token', async () => {
  const { c, pedir } = montar()
  // Um userId no corpo é ignorado: quem desconecta é quem o JWT identificou.
  const resposta = await pedir({ action: 'desconectar', workspaceId: WS, integrationId: 'clay', userId: 'outra-pessoa' })
  assertEquals(resposta.status, 200)
  const corpo = await resposta.text()
  assertEquals(JSON.parse(corpo), { desconectado: true, revogacao: 'revogado' })
  assertEquals(c.apagados, [{ workspaceId: WS, userId: 'u1', integrationId: 'clay' }])
  assertEquals(c.revogacoes.length, 2)
  assert(!corpo.includes('secreto'))
  assert(!JSON.stringify(c.logs).includes('secreto'))
})

Deno.test('desconectar com a Participação inativa é recusado, sem apagar', async () => {
  const { c, pedir } = montar({ acessoParaUso: () => Promise.reject(new ErroDoBanco('42501', 'active workspace membership required')) })
  const resposta = await pedir({ action: 'desconectar', workspaceId: WS, integrationId: 'clay' })
  assertEquals(resposta.status, 403)
  assertEquals(c.apagados.length, 0)
})

Deno.test('sem o banco dos Acessos, desconectar responde indisponível em vez de fingir', async () => {
  const resposta = await montar({ semAcessos: true }).pedir({ action: 'desconectar', workspaceId: WS, integrationId: 'clay' })
  assertEquals(resposta.status, 503)
})
