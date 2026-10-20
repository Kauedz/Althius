import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { caminhosDe, PERFIS, perfilDaIntegracao } from './perfis.ts'
import { executarFerramentaRest, pedidoRest } from './rest.ts'
import { ErroDeProvedor } from './tipos.ts'

// O que a migration 20261001160000 grava (o Lusha ganhou `oauth_mcp` em 20261104131000) em private.integration_connection_profiles (kinds e pins_portal). Se mudar um,
// mude o outro: o banco decide quem pode ser habilitado; estes perfis, como conectar.
const SEED_DO_BANCO: Record<string, { kinds: string[]; pinsPortal: boolean }> = {
  hubspot: { kinds: ['oauth_mcp', 'api_key'], pinsPortal: true },
  notion: { kinds: ['oauth_mcp'], pinsPortal: false },
  apollo: { kinds: ['oauth_mcp', 'api_key'], pinsPortal: false },
  lusha: { kinds: ['oauth_mcp', 'api_key'], pinsPortal: false },
  'meta-ads': { kinds: ['oauth_mcp'], pinsPortal: false },
  pipedrive: { kinds: ['oauth_mcp', 'api_key'], pinsPortal: true },
  'rd-station': { kinds: ['api_key'], pinsPortal: false },
}

Deno.test('os perfis e o seed do banco têm as mesmas Integrações, caminhos de conexão e portal fixo', () => {
  assertEquals(Object.keys(PERFIS).sort(), Object.keys(SEED_DO_BANCO).sort())
  for (const [id, seed] of Object.entries(SEED_DO_BANCO)) {
    const perfil = perfilDaIntegracao(id)!
    assertEquals([...caminhosDe(perfil)].sort(), [...seed.kinds].sort(), id)
    assertEquals(perfil.portalFixo, seed.pinsPortal, id)
    assertEquals(perfil.id, id)
  }
  assertEquals(perfilDaIntegracao('kommo'), null)
  assertEquals(perfilDaIntegracao('constructor'), null)
})

Deno.test('cada perfil é coerente: MCP com https, segredos nomeados por Integração, REST onde não há MCP para a chave', () => {
  for (const perfil of Object.values(PERFIS)) {
    if (perfil.mcp) assert(perfil.mcp.url.startsWith('https://'), perfil.id)
    const oauth = perfil.mcp?.oauth
    if (oauth) {
      assert(/^[A-Z0-9_]+_MCP_CLIENT_ID$/.test(oauth.segredos.clientId), perfil.id)
      assert(/^[A-Z0-9_]+_MCP_CLIENT_SECRET$/.test(oauth.segredos.clientSecret), perfil.id)
      if (oauth.autorizacao) assert(oauth.autorizacao.startsWith('https://') && oauth.token?.startsWith('https://'), perfil.id)
    }
    if (perfil.chaveDeApi?.via === 'rest') assert(perfil.rest && perfil.rest.ferramentas.length > 0, perfil.id)
    if (perfil.chaveDeApi?.via === 'mcp') assert(perfil.mcp?.chave, perfil.id)
    assert(perfil.portalFixo === false || perfil.chaveDeApi?.identificacao || oauth?.identificacao, `${perfil.id} fixa portal`)
    const nomes = (perfil.rest?.ferramentas ?? []).map((f) => f.nome)
    assertEquals(new Set(nomes).size, nomes.length, `${perfil.id}: ferramentas REST com nome repetido`)
    assert(perfil.naoConfirmado.length > 0 || perfil.id === 'notion', perfil.id)
  }
})

Deno.test('o HubSpot usa o app pré-registrado, com os segredos HUBSPOT_MCP_CLIENT_ID e HUBSPOT_MCP_CLIENT_SECRET', () => {
  const oauth = PERFIS.hubspot.mcp!.oauth!
  assertEquals(oauth.registro, 'preregistrado')
  assertEquals(oauth.segredos, { clientId: 'HUBSPOT_MCP_CLIENT_ID', clientSecret: 'HUBSPOT_MCP_CLIENT_SECRET' })
  assertEquals(PERFIS.hubspot.mcp!.url, 'https://mcp.hubspot.com')
  assertEquals(PERFIS.notion.mcp!.oauth!.registro, 'dinamico')
  assertEquals(PERFIS.notion.mcp!.url, 'https://mcp.notion.com/mcp')
  assertEquals(PERFIS.apollo.mcp!.url, 'https://mcp.apollo.io/mcp')
  assertEquals(PERFIS.lusha.mcp!.url, 'https://mcp.lusha.com')
  assertEquals(PERFIS['meta-ads'].mcp!.url, 'https://mcp.facebook.com/ads')
})

// O que https://mcp.hubspot.com/.well-known/oauth-authorization-server publicava em 08/10/2026 (RFC 8414), resumido. Ele
// não tem `registration_endpoint`: sem registro dinâmico, o cliente é o MCP Auth App pré-registrado.
const METADADO_DO_HUBSPOT = {
  authorization_endpoint: 'https://mcp.hubspot.com/oauth/authorize/user',
  token_endpoint: 'https://mcp.hubspot.com/oauth/v3/token',
  token_endpoint_auth_methods_supported: ['client_secret_post'],
}

Deno.test('o HubSpot usa os endereços e a autenticação do cliente que o próprio servidor publica', () => {
  const oauth = PERFIS.hubspot.mcp!.oauth!
  assertEquals(oauth.autorizacao, METADADO_DO_HUBSPOT.authorization_endpoint)
  assertEquals(oauth.token, METADADO_DO_HUBSPOT.token_endpoint)
  assert(METADADO_DO_HUBSPOT.token_endpoint_auth_methods_supported.includes(oauth.autenticacaoDoToken!))
})

Deno.test('as ferramentas REST: caminho com argumento codificado, consulta, corpo com envelope e a chave onde o app manda', () => {
  const hubspot = PERFIS.hubspot.rest!
  const lerRegistro = hubspot.ferramentas.find((f) => f.nome === 'get_record')!
  const { url, init } = pedidoRest(hubspot, lerRegistro, { objeto: 'contacts', id: 'a/b 1', properties: 'email,firstname' }, 'pat-na-123456')
  assertEquals(new URL(url).pathname, '/crm/v3/objects/contacts/a%2Fb%201')
  assertEquals(new URL(url).searchParams.get('properties'), 'email,firstname')
  assertEquals((init.headers as Record<string, string>).Authorization, 'Bearer pat-na-123456')
  assert(!url.includes('pat-na-123456'))

  const pipedrive = PERFIS.pipedrive.rest!
  const nova = pedidoRest(pipedrive, pipedrive.ferramentas.find((f) => f.nome === 'add_person')!, { name: 'Maria', email: 'm@x.com' }, 'pd-token-1')
  assertEquals(new URL(nova.url).searchParams.get('api_token'), 'pd-token-1')
  assertEquals(JSON.parse(nova.init.body as string), { name: 'Maria', email: 'm@x.com' })

  assertThrows(
    () => pedidoRest(hubspot, lerRegistro, { objeto: 'contacts' }, 'x'),
    ErroDeProvedor,
    'Falta o argumento',
  )
})

Deno.test('uma resposta enorme é cortada, e uma ferramenta desconhecida é recusada antes de falar com o app', async () => {
  const grande = 'x'.repeat(150_000)
  const buscar = (() => Promise.resolve(new Response(grande, { status: 200 }))) as unknown as typeof fetch
  const resultado = await executarFerramentaRest(PERFIS['rd-station'].rest!, 'list_contacts', {}, 'rd-token-1', buscar)
  assertEquals(resultado.erro, false)
  assert(JSON.stringify(resultado.conteudo).length < 110_000)
  assertEquals(resultado.estruturado, undefined)
  let chamou = false
  const espiao = (() => ((chamou = true), Promise.resolve(new Response('{}')))) as unknown as typeof fetch
  try {
    await executarFerramentaRest(PERFIS['rd-station'].rest!, 'apagar_tudo', {}, 'rd-token-1', espiao)
  } catch (erro) {
    assert(erro instanceof ErroDeProvedor && erro.codigo === -32602)
  }
  assertEquals(chamou, false)
})
