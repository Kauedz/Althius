import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type BancoDeDesconexao, desconectarAcesso } from './integration-access.ts'

// O Calendly tem revogação (calendly.com/oauth/revoke), mas o metadado dele não a anuncia (lido em 19/10/2026): o perfil a
// declara (conector-calendly 01), sob as mesmas regras do endereço anunciado.

const CALENDLY = 'https://calendly.com/'
const PEDIDO = { workspaceId: 'ws-1', userId: 'u-1', integrationId: 'calendly' }

function montar(statusDaRevogacao = 200) {
  const eventos = { revogacoes: [] as { url: string; corpo: URLSearchParams }[], apagados: 0 }
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.method === 'POST' && req.url.startsWith('https://mcp.calendly.com')) {
      return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.calendly.com/.well-known/oauth-protected-resource"' } })
    }
    if (req.url === 'https://mcp.calendly.com/.well-known/oauth-protected-resource') {
      return json({ resource: 'https://mcp.calendly.com/', authorization_servers: [CALENDLY] })
    }
    if (req.url === 'https://calendly.com/.well-known/oauth-authorization-server') {
      return json({
        issuer: CALENDLY,
        authorization_endpoint: 'https://calendly.com/oauth/authorize',
        token_endpoint: 'https://calendly.com/oauth/token',
        registration_endpoint: 'https://calendly.com/oauth/register',
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
      })
    }
    if (req.method === 'POST' && req.url.endsWith('/revoke')) {
      eventos.revogacoes.push({ url: req.url, corpo: new URLSearchParams(await req.text()) })
      return json({}, statusDaRevogacao)
    }
    return json({}, 404)
  }) as typeof fetch
  const banco: BancoDeDesconexao = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'a1',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ access_token: 'acc-cal-1', refresh_token: 'ref-cal-1', client_id: 'cid-cal', issuer: CALENDLY }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve({ clientId: 'cid-cal', clientSecret: null }),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(null),
    apagarAcesso: () => (eventos.apagados++, Promise.resolve(true)),
  }
  return { deps: { banco, ambiente: () => undefined, fetch: fetchFalso }, eventos }
}

Deno.test('Calendly: sem revogação no metadado, usa a declarada no perfil, como cliente público', async () => {
  const { deps, eventos } = montar()
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor, { desconectado: true, revogacao: 'revogado' })
  assertEquals(eventos.revogacoes.map((x) => [x.url, x.corpo.get('token_type_hint'), x.corpo.get('client_id')]), [
    ['https://calendly.com/oauth/revoke', 'refresh_token', 'cid-cal'],
    ['https://calendly.com/oauth/revoke', 'access_token', 'cid-cal'],
  ])
  assertEquals(eventos.apagados, 1)
})

Deno.test('Calendly: a revogação recusada ainda desconecta, com aviso', async () => {
  const { deps, eventos } = montar(403)
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor.revogacao, 'falhou')
  assertEquals(eventos.apagados, 1)
})
