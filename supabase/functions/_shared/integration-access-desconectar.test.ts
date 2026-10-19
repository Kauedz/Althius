import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type AcessoLido, type BancoDeDesconexao, desconectarAcesso, ErroDoBanco } from './integration-access.ts'

// Desconectar o próprio Acesso (conector-clay 02): revoga o token no app (RFC 7009) quando o servidor de autorização
// anuncia onde, e apaga o Acesso do mesmo jeito se a revogação falhar. Nunca devolve token.

const PEDIDO = { workspaceId: 'ws-1', userId: 'u-1', integrationId: 'clay' }
const CLAY_AS = 'https://api.clay.com'

function segredo(sobrescrever: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'acc-clay-111',
    refresh_token: 'ref-clay-111',
    token_endpoint: `${CLAY_AS}/oauth/token`,
    client_id: 'cid-clay',
    issuer: CLAY_AS,
    ...sobrescrever,
  })
}

interface Montagem {
  acesso?: Partial<AcessoLido> | null
  /** O metadado do servidor de autorização do Clay (sem `revocation_endpoint`, não há revogação). */
  metadado?: Record<string, unknown>
  /** O status da revogação, em ordem. */
  revogacoes?: number[]
  banco?: Partial<BancoDeDesconexao>
}

function montar(m: Montagem = {}) {
  const eventos = { revogacoes: [] as URLSearchParams[], apagados: [] as unknown[], cabecalhos: [] as Headers[] }
  const fila = [...(m.revogacoes ?? [200, 200])]
  const metadado = m.metadado ?? {
    issuer: CLAY_AS,
    authorization_endpoint: 'https://app.clay.com/oauth/authorize',
    token_endpoint: `${CLAY_AS}/oauth/token`,
    revocation_endpoint: `${CLAY_AS}/oauth/revoke`,
    code_challenge_methods_supported: ['S256'],
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
    if (req.method === 'POST' && req.url === 'https://api.clay.com/v3/mcp') return json({}, 401)
    if (req.url === 'https://api.clay.com/.well-known/oauth-protected-resource/v3/mcp') {
      return json({ resource: 'https://api.clay.com/v3/mcp', authorization_servers: [CLAY_AS] })
    }
    if (req.url === `${CLAY_AS}/.well-known/oauth-authorization-server`) return json(metadado)
    if (req.method === 'POST' && req.url === `${CLAY_AS}/oauth/revoke`) {
      eventos.revogacoes.push(new URLSearchParams(await req.text()))
      eventos.cabecalhos.push(req.headers)
      return json({}, fila.shift() ?? 500)
    }
    return json({}, 404)
  }) as typeof fetch

  const acesso: AcessoLido | null = m.acesso === null ? null : {
    accessId: 'acesso-1',
    kind: 'oauth_mcp',
    state: 'conectado',
    expiresAt: null,
    appPortal: null,
    accountLabel: null,
    segredo: segredo(),
    ...m.acesso,
  }
  const banco: BancoDeDesconexao = {
    acessoParaUso: () => Promise.resolve(acesso),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: (a) => Promise.resolve(a.clientId === 'cid-clay' ? { clientId: 'cid-clay', clientSecret: null } : null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(null),
    apagarAcesso: (a) => (eventos.apagados.push(a), Promise.resolve(acesso !== null)),
    ...m.banco,
  }
  return { deps: { banco, ambiente: () => undefined, fetch: fetchFalso }, eventos }
}

const semToken = (valor: unknown) => {
  const texto = JSON.stringify(valor)
  for (const token of ['acc-clay-111', 'ref-clay-111']) assert(!texto.includes(token), `vazou ${token}`)
}

Deno.test('revoga o refresh token e o access token no app, com o cliente do Acesso, e depois apaga o Acesso', async () => {
  const { deps, eventos } = montar()
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor, { desconectado: true, revogacao: 'revogado' })
  assertEquals(eventos.revogacoes.map((c) => [c.get('token'), c.get('token_type_hint'), c.get('client_id')]), [
    ['ref-clay-111', 'refresh_token', 'cid-clay'],
    ['acc-clay-111', 'access_token', 'cid-clay'],
  ])
  assertEquals(eventos.apagados, [PEDIDO])
  semToken(r)
})

Deno.test('a revogação recusada ou fora do ar não impede desconectar: o Acesso é apagado e a revogação vem como falhou', async () => {
  for (const status of [503, 401]) {
    const { deps, eventos } = montar({ revogacoes: [status, status] })
    const r = await desconectarAcesso(deps, PEDIDO)
    assert(r.ok)
    assertEquals(r.valor, { desconectado: true, revogacao: 'falhou' })
    assertEquals(eventos.apagados.length, 1)
    semToken(r)
  }
})

Deno.test('sem endereço de revogação no servidor, só apaga o Acesso', async () => {
  const { deps, eventos } = montar({
    metadado: {
      issuer: CLAY_AS,
      authorization_endpoint: 'https://app.clay.com/oauth/authorize',
      token_endpoint: `${CLAY_AS}/oauth/token`,
    },
  })
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor, { desconectado: true, revogacao: 'nao_suportado' })
  assertEquals([eventos.revogacoes.length, eventos.apagados.length], [0, 1])
})

Deno.test('o token nunca vai a um servidor de autorização diferente do que o emitiu', async () => {
  const { deps, eventos } = montar({ acesso: { segredo: segredo({ issuer: 'https://outro.test' }) } })
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor, { desconectado: true, revogacao: 'falhou' })
  assertEquals([eventos.revogacoes.length, eventos.apagados.length], [0, 1])
})

Deno.test('sem o cliente OAuth que emitiu o token, não revoga e avisa', async () => {
  const { deps, eventos } = montar({ acesso: { segredo: segredo({ client_id: 'cid-sumido' }) } })
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor.revogacao, 'falhou')
  assertEquals([eventos.revogacoes.length, eventos.apagados.length], [0, 1])
})

Deno.test('o Acesso por chave de API e o que precisa reconectar (sem token legível) só são apagados', async () => {
  const chave = montar({ acesso: { kind: 'api_key', segredo: JSON.stringify({ api_key: 'chave-secreta-1' }) } })
  const r1 = await desconectarAcesso(chave.deps, { ...PEDIDO, integrationId: 'lusha' })
  assert(r1.ok)
  assertEquals(r1.valor, { desconectado: true, revogacao: 'nao_se_aplica' })
  assert(!JSON.stringify(r1).includes('chave-secreta-1'))
  const reconectar = montar({ acesso: { state: 'precisa_reconectar', segredo: null } })
  const r2 = await desconectarAcesso(reconectar.deps, PEDIDO)
  assert(r2.ok)
  assertEquals(r2.valor, { desconectado: true, revogacao: 'nao_se_aplica' })
  assertEquals([chave.eventos.revogacoes.length, reconectar.eventos.revogacoes.length], [0, 0])
})

Deno.test('sem Acesso, não revoga nada e diz que não havia o que desconectar', async () => {
  const { deps, eventos } = montar({ acesso: null })
  const r = await desconectarAcesso(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor, { desconectado: false, revogacao: 'nao_se_aplica' })
  assertEquals(eventos.revogacoes.length, 0)
})

Deno.test('a Integração já retirada do Workspace não impede apagar o que sobrou; a Participação inativa recusa', async () => {
  const retirada = montar({ banco: { acessoParaUso: () => Promise.reject(new ErroDoBanco('22023', 'integration not enabled')) } })
  const r1 = await desconectarAcesso(retirada.deps, PEDIDO)
  assert(r1.ok)
  assertEquals(r1.valor.revogacao, 'nao_se_aplica')
  assertEquals(retirada.eventos.apagados.length, 1)
  const inativa = montar({ banco: { acessoParaUso: () => Promise.reject(new ErroDoBanco('42501', 'active workspace membership required')) } })
  const r2 = await desconectarAcesso(inativa.deps, PEDIDO)
  assert(!r2.ok)
  assertEquals(r2.erro.tipo, 'precisa_reconectar')
  assertEquals(inativa.eventos.apagados.length, 0)
})
