import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  type AcessoLido,
  type BancoDeAcessos,
  chamarFerramenta,
  type DepsDeAcesso,
  ErroDoBanco,
  listarFerramentas,
  type Permissao,
} from './integration-access.ts'
import { servidorMcpFalso, type OpcoesDoServidorFalso } from './integracoes/servidor-mcp-falso.ts'

const WS = 'ws-1'
const USUARIO = 'u-1'
const PEDIDO = { workspaceId: WS, userId: USUARIO, integrationId: 'hubspot' }
const AGORA = new Date('2026-10-01T12:00:00Z')

function segredoOAuth(sobrescrever: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'acc-velho-111',
    refresh_token: 'ref-velho-111',
    token_endpoint: 'https://mcp.hubspot.com/oauth/v3/token',
    client_id: 'cid-hubspot',
    issuer: 'https://mcp.hubspot.com',
    ...sobrescrever,
  })
}

interface Montagem {
  acesso?: Partial<AcessoLido> | null
  banco?: Partial<BancoDeAcessos>
  mcp?: OpcoesDoServidorFalso
  /** O que o endpoint de token responde, em ordem. */
  tokens?: { status: number; corpo: unknown }[]
  permissao?: Permissao | null
  ambiente?: Record<string, string>
  rest?: (req: Request) => Response
}

function montar(m: Montagem = {}) {
  const servidor = servidorMcpFalso(m.mcp)
  const eventos = {
    renovacoes: [] as { accessId: string; accessToken: string; refreshToken: string | null; expiresIn: number | null }[],
    reconexoes: [] as string[],
    tokenChamadas: [] as string[],
    rest: [] as string[],
  }
  const filaDeTokens = [...(m.tokens ?? [])]
  const fetchTotal = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://mcp.hubspot.com/oauth/v3/token') {
      eventos.tokenChamadas.push(await req.text())
      const proximo = filaDeTokens.shift() ?? { status: 500, corpo: {} }
      return new Response(JSON.stringify(proximo.corpo), { status: proximo.status, headers: { 'Content-Type': 'application/json' } })
    }
    if (m.rest && !req.url.includes('mcp.')) {
      eventos.rest.push(req.url)
      return m.rest(req)
    }
    return await servidor.fetch(req)
  }) as typeof fetch

  const acesso: AcessoLido | null = m.acesso === null ? null : {
    accessId: 'acesso-1',
    kind: 'oauth_mcp',
    state: 'conectado',
    expiresAt: new Date(AGORA.getTime() + 3600_000).toISOString(),
    appPortal: 'hub-1',
    accountLabel: 'ana@norte.test',
    segredo: segredoOAuth(),
    ...m.acesso,
  }
  const banco: BancoDeAcessos = {
    acessoParaUso: () => Promise.resolve(acesso),
    renovar: (a) => (eventos.renovacoes.push(a), Promise.resolve()),
    marcarReconexao: (id) => (eventos.reconexoes.push(id), Promise.resolve()),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(m.permissao === undefined ? 'executar' : m.permissao),
    ...m.banco,
  }
  const ambiente: Record<string, string> = { HUBSPOT_MCP_CLIENT_ID: 'cid-hubspot', HUBSPOT_MCP_CLIENT_SECRET: 'segredo-do-app-hubspot', ...m.ambiente }
  const deps: DepsDeAcesso = { banco, ambiente: (nome) => ambiente[nome], fetch: fetchTotal, agora: () => AGORA }
  return { deps, servidor, eventos }
}

const semToken = (valor: unknown, ...tokens: string[]) => {
  const texto = JSON.stringify(valor)
  for (const token of tokens) assert(!texto.includes(token), `vazou ${token}`)
}

Deno.test('lista as ferramentas, marca as que escrevem e nunca devolve token', async () => {
  const { deps } = montar()
  const r = await listarFerramentas(deps, PEDIDO)
  assert(r.ok)
  assertEquals(r.valor.map((f) => [f.nome, f.escreve]), [['buscar', false], ['criar', true]])
  semToken(r, 'acc-velho-111', 'ref-velho-111', 'segredo-do-app-hubspot')
})

Deno.test('o Acesso a reconectar, ausente, de Participação desativada ou de Integração não habilitada tem cada um o seu erro', async () => {
  const revogado = await listarFerramentas(montar({ acesso: { state: 'precisa_reconectar', segredo: null } }).deps, PEDIDO)
  assert(!revogado.ok && revogado.erro.tipo === 'precisa_reconectar' && revogado.erro.motivo === 'revogado')

  const sem = await listarFerramentas(montar({ acesso: null }).deps, PEDIDO)
  assert(!sem.ok && sem.erro.tipo === 'precisa_reconectar' && sem.erro.motivo === 'sem_acesso')

  const inativa = await listarFerramentas(
    montar({ banco: { acessoParaUso: () => Promise.reject(new ErroDoBanco('42501', 'active workspace membership required')) } }).deps,
    PEDIDO,
  )
  assert(!inativa.ok && inativa.erro.tipo === 'precisa_reconectar' && inativa.erro.motivo === 'participacao_inativa')

  const desabilitada = await listarFerramentas(
    montar({ banco: { acessoParaUso: () => Promise.reject(new ErroDoBanco('22023', 'integration not enabled')) } }).deps,
    PEDIDO,
  )
  assert(!desabilitada.ok && desabilitada.erro.tipo === 'nao_habilitada')

  const semPerfil = await listarFerramentas(montar().deps, { ...PEDIDO, integrationId: 'kommo' })
  assert(!semPerfil.ok && semPerfil.erro.tipo === 'nao_habilitada')
})

Deno.test('o token vencendo é renovado antes da chamada, e o refresh token novo é gravado junto com o access token', async () => {
  const { deps, eventos, servidor } = montar({
    mcp: { token: 'acc-novo-222' },
    acesso: { expiresAt: new Date(AGORA.getTime() + 10_000).toISOString() },
    tokens: [{ status: 200, corpo: { access_token: 'acc-novo-222', refresh_token: 'ref-novo-222', expires_in: 1800 } }],
  })
  const r = await listarFerramentas(deps, PEDIDO)
  assert(r.ok)
  assertEquals(eventos.renovacoes, [{ accessId: 'acesso-1', accessToken: 'acc-novo-222', refreshToken: 'ref-novo-222', expiresIn: 1800 }])
  const corpo = new URLSearchParams(eventos.tokenChamadas[0])
  assertEquals(corpo.get('grant_type'), 'refresh_token')
  assertEquals(corpo.get('refresh_token'), 'ref-velho-111')
  assertEquals(corpo.get('client_id'), 'cid-hubspot')
  assertEquals(corpo.get('client_secret'), 'segredo-do-app-hubspot')
  assertEquals(servidor.chamadas[0].cabecalhos.authorization, 'Bearer acc-novo-222')
})

Deno.test('o app recusa o token no meio: renova uma vez e repete; recusando de novo, pede reconexão', async () => {
  const { deps, eventos } = montar({
    mcp: { token: 'acc-novo-222' },
    tokens: [{ status: 200, corpo: { access_token: 'acc-novo-222', refresh_token: 'ref-novo-222', expires_in: 1800 } }],
  })
  const r = await listarFerramentas(deps, PEDIDO)
  assert(r.ok, 'o token velho levou 401, a renovação deu um novo e a segunda tentativa passou')
  assertEquals(eventos.renovacoes.length, 1)
  assertEquals(eventos.reconexoes, [])

  const revogado = montar({
    mcp: { token: 'outro-token-999' },
    tokens: [{ status: 200, corpo: { access_token: 'acc-novo-222', refresh_token: 'ref-novo-222', expires_in: 1800 } }],
  })
  const r2 = await listarFerramentas(revogado.deps, PEDIDO)
  assert(!r2.ok && r2.erro.tipo === 'precisa_reconectar')
  assertEquals(revogado.eventos.reconexoes, ['acesso-1'])
})

Deno.test('uma renovação recusada (invalid_grant) deixa o Acesso em "precisa reconectar" sem vazar nada', async () => {
  const { deps, eventos } = montar({
    mcp: { token: 'nunca-vai-valer' },
    tokens: [{ status: 400, corpo: { error: 'invalid_grant', error_description: 'ref-velho-111 revogado' } }],
  })
  const r = await listarFerramentas(deps, PEDIDO)
  assert(!r.ok && r.erro.tipo === 'precisa_reconectar' && r.erro.motivo === 'revogado')
  assertEquals(eventos.reconexoes, ['acesso-1'])
  semToken(r, 'acc-velho-111', 'ref-velho-111', 'segredo-do-app-hubspot')
})

Deno.test('se outra chamada já renovou e invalidou o refresh token que usamos, usa o token dela e não marca reconexão', async () => {
  let leituras = 0
  const { deps, eventos } = montar({
    mcp: { token: 'acc-da-outra-chamada' },
    tokens: [{ status: 400, corpo: { error: 'invalid_grant' } }],
    banco: {
      acessoParaUso: () => {
        leituras++
        return Promise.resolve({
          accessId: 'acesso-1',
          kind: 'oauth_mcp' as const,
          state: 'conectado' as const,
          expiresAt: new Date(AGORA.getTime() + 3600_000).toISOString(),
          appPortal: 'hub-1',
          accountLabel: null,
          segredo: leituras === 1
            ? segredoOAuth()
            : segredoOAuth({ access_token: 'acc-da-outra-chamada', refresh_token: 'ref-da-outra-chamada' }),
        })
      },
    },
  })
  const r = await listarFerramentas(deps, PEDIDO)
  assert(r.ok)
  assertEquals(eventos.reconexoes, [])
})

Deno.test('servidor fora do ar é indisponivel e não mexe no estado do Acesso', async () => {
  const { deps, eventos } = montar({ mcp: { statusFixo: 503 } })
  const r = await listarFerramentas(deps, PEDIDO)
  assert(!r.ok && r.erro.tipo === 'indisponivel')
  assertEquals(eventos.reconexoes, [])
  assertEquals(eventos.renovacoes, [])
})

Deno.test('o Notion (registro dinâmico) renova com o cliente guardado no banco, sem segredo', async () => {
  let consulta: unknown
  const { deps, eventos } = montar({
    acesso: {
      expiresAt: new Date(AGORA.getTime() - 1000).toISOString(),
      segredo: JSON.stringify({
        access_token: 'acc-notion',
        refresh_token: 'ref-notion',
        token_endpoint: 'https://mcp.hubspot.com/oauth/v3/token',
        client_id: 'cid-dinamico',
        issuer: 'https://mcp.notion.com',
        resource: 'https://mcp.notion.com/mcp',
      }),
    },
    mcp: { token: 'acc-notion-2' },
    tokens: [{ status: 200, corpo: { access_token: 'acc-notion-2', refresh_token: 'ref-notion-2', expires_in: 3600 } }],
    banco: { clienteOAuth: (a) => ((consulta = a), Promise.resolve({ clientId: 'cid-dinamico', clientSecret: null })) },
  })
  const r = await listarFerramentas(deps, { ...PEDIDO, integrationId: 'notion' })
  assert(r.ok)
  assertEquals(consulta, { integrationId: 'notion', issuer: 'https://mcp.notion.com', clientId: 'cid-dinamico' })
  const corpo = new URLSearchParams(eventos.tokenChamadas[0])
  assertEquals(corpo.get('client_id'), 'cid-dinamico')
  assertEquals(corpo.get('client_secret'), null)
  assertEquals(corpo.get('resource'), 'https://mcp.notion.com/mcp')
  assertEquals(eventos.renovacoes[0].refreshToken, 'ref-notion-2')
})

Deno.test('Permissão do Agente: Ler chama só leitura, Propor pede Aprovação nas que escrevem, Executar chama tudo', async () => {
  const pedido = (ferramenta: string) => ({ ...PEDIDO, ferramenta, argumentos: { termo: 'alfa' }, agenteId: 'agente-1' })

  const ler = montar({ permissao: 'ler' })
  const leitura = await chamarFerramenta(ler.deps, pedido('buscar'))
  assert(leitura.ok)
  assertEquals(leitura.valor.conteudo, [{ type: 'text', text: 'ok:buscar' }])
  const escritaComLer = await chamarFerramenta(ler.deps, pedido('criar'))
  assert(!escritaComLer.ok && escritaComLer.erro.tipo === 'permissao_negada')
  assertEquals(escritaComLer.erro.tipo === 'permissao_negada' && [escritaComLer.erro.exigida, escritaComLer.erro.atual], ['executar', 'ler'])

  const propor = montar({ permissao: 'propor' })
  assert((await chamarFerramenta(propor.deps, pedido('buscar'))).ok)
  const proposta = await chamarFerramenta(propor.deps, pedido('criar'))
  assert(!proposta.ok && proposta.erro.tipo === 'permissao_negada')
  assert(proposta.erro.mensagem.includes('Aprovação'))
  assert(!propor.servidor.chamadas.some((c) => c.rpc === 'tools/call' && (c.corpo?.params as { name: string }).name === 'criar'))

  const executar = montar({ permissao: 'executar' })
  const escrita = await chamarFerramenta(executar.deps, pedido('criar'))
  assert(escrita.ok)
  assertEquals(escrita.valor.erro, false)
})

Deno.test('um Agente sem Permissão na Integração é recusado sem tocar a rede', async () => {
  const { deps, servidor, eventos } = montar({ permissao: null })
  const r = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'buscar', agenteId: 'agente-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada' && r.erro.atual === null)
  assertEquals(servidor.chamadas.length, 0)
  assertEquals(eventos.tokenChamadas.length, 0)
})

Deno.test('sem Agente (a própria pessoa) só se chama leitura; somenteLeitura recusa escrita até com Executar', async () => {
  const { deps } = montar()
  assert((await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'buscar' })).ok)
  const escrita = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'criar' })
  assert(!escrita.ok && escrita.erro.tipo === 'permissao_negada')
  const comExecutar = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'criar', agenteId: 'agente-1', somenteLeitura: true })
  assert(!comExecutar.ok && comExecutar.erro.tipo === 'permissao_negada')
})

Deno.test('ferramenta que não existe é ferramenta_invalida; erro da própria ferramenta volta como erro:true, não como falha da Integração', async () => {
  const { deps } = montar({ mcp: { resultados: { buscar: { content: [{ type: 'text', text: 'sem permissão no app' }], isError: true } } } })
  const inexistente = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'apagar_tudo' })
  assert(!inexistente.ok && inexistente.erro.tipo === 'ferramenta_invalida')
  const falhou = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'buscar' })
  assert(falhou.ok && falhou.valor.erro === true)
})

Deno.test('chave de API do Lusha: MCP com x-api-key, sem renovação; a chave recusada pede reconexão', async () => {
  const lusha = { ...PEDIDO, integrationId: 'lusha' }
  const valida = montar({
    acesso: { kind: 'api_key', expiresAt: null, segredo: JSON.stringify({ api_key: 'chave-lusha-123' }) },
    mcp: { chave: { cabecalho: 'x-api-key', valor: 'chave-lusha-123' } },
  })
  const r = await listarFerramentas(valida.deps, lusha)
  assert(r.ok)
  semToken(r, 'chave-lusha-123')

  const revogada = montar({
    acesso: { kind: 'api_key', expiresAt: null, segredo: JSON.stringify({ api_key: 'chave-lusha-123' }) },
    mcp: { chave: { cabecalho: 'x-api-key', valor: 'outra-chave' } },
  })
  const r2 = await listarFerramentas(revogada.deps, lusha)
  assert(!r2.ok && r2.erro.tipo === 'precisa_reconectar')
  assertEquals(revogada.eventos.reconexoes, ['acesso-1'])
  assertEquals(revogada.eventos.tokenChamadas.length, 0)
})

Deno.test('Pipedrive por chave de API: ferramentas REST, a chave só no pedido ao app, escrita pede Executar', async () => {
  const pipedrive = { ...PEDIDO, integrationId: 'pipedrive' }
  const { deps, eventos } = montar({
    acesso: { kind: 'api_key', expiresAt: null, segredo: JSON.stringify({ api_key: 'pd-token-123456' }) },
    rest: () => new Response(JSON.stringify({ success: true, data: { items: [{ item: { id: 7, name: 'Maria' } }] } }), { status: 200 }),
  })
  const lista = await listarFerramentas(deps, pipedrive)
  assert(lista.ok)
  assertEquals(lista.valor.find((f) => f.nome === 'search_persons')?.escreve, false)
  assertEquals(lista.valor.find((f) => f.nome === 'add_person')?.escreve, true)

  const busca = await chamarFerramenta(deps, { ...pipedrive, ferramenta: 'search_persons', argumentos: { term: 'Maria', limit: 5 } })
  assert(busca.ok)
  assertEquals(busca.valor.estruturado, { success: true, data: { items: [{ item: { id: 7, name: 'Maria' } }] } })
  const url = new URL(eventos.rest[0])
  assertEquals(url.pathname, '/v1/persons/search')
  assertEquals([url.searchParams.get('term'), url.searchParams.get('limit'), url.searchParams.get('api_token')], ['Maria', '5', 'pd-token-123456'])
  semToken(busca, 'pd-token-123456')

  const semPermissao = await chamarFerramenta(deps, { ...pipedrive, ferramenta: 'add_person', argumentos: { name: 'João' } })
  assert(!semPermissao.ok && semPermissao.erro.tipo === 'permissao_negada')
  const faltando = await chamarFerramenta(deps, { ...pipedrive, ferramenta: 'search_persons', argumentos: {}, agenteId: 'a' })
  assert(!faltando.ok && faltando.erro.tipo === 'ferramenta_invalida')
})

Deno.test('REST: 401 do app pede reconexão; 400 do app é erro da ferramenta, com a chave redigida', async () => {
  const pipedrive = { ...PEDIDO, integrationId: 'pipedrive' }
  const recusada = montar({
    acesso: { kind: 'api_key', expiresAt: null, segredo: JSON.stringify({ api_key: 'pd-token-123456' }) },
    rest: () => new Response('{}', { status: 401 }),
  })
  const r = await chamarFerramenta(recusada.deps, { ...pipedrive, ferramenta: 'get_person', argumentos: { id: 3 } })
  assert(!r.ok && r.erro.tipo === 'precisa_reconectar')
  assertEquals(recusada.eventos.reconexoes, ['acesso-1'])

  const ruim = montar({
    acesso: { kind: 'api_key', expiresAt: null, segredo: JSON.stringify({ api_key: 'pd-token-123456' }) },
    rest: () => new Response('{"error":"chave pd-token-123456 sem escopo"}', { status: 400 }),
  })
  const r2 = await chamarFerramenta(ruim.deps, { ...pipedrive, ferramenta: 'get_person', argumentos: { id: 3 } })
  assert(r2.ok && r2.valor.erro === true)
  semToken(r2, 'pd-token-123456')
})
