import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { comSessaoMcp, listarFerramentasMcp } from './mcp-cliente.ts'
import { servidorMcpFalso } from './servidor-mcp-falso.ts'
import { ErroDeProvedor } from './tipos.ts'

const URL_MCP = 'https://mcp.falso.test/mcp'

Deno.test('lista as ferramentas por JSON: initialize, initialized e tools/list, com o token só no cabeçalho', async () => {
  const servidor = servidorMcpFalso({ token: 'tok-secreto-1' })
  const ferramentas = await listarFerramentasMcp({
    url: URL_MCP,
    cabecalhos: { Authorization: 'Bearer tok-secreto-1' },
    fetch: servidor.fetch,
  })
  assertEquals(ferramentas.map((f) => f.name), ['buscar', 'criar'])
  assertEquals(servidor.chamadas.map((c) => c.rpc ?? c.metodo), [
    'initialize',
    'notifications/initialized',
    'tools/list',
  ])
  const inicio = servidor.chamadas[0]
  assertEquals(inicio.cabecalhos.accept, 'application/json, text/event-stream')
  assertEquals((inicio.corpo?.params as { protocolVersion: string }).protocolVersion, '2025-06-18')
  // Depois do initialize, o cliente repete a versão acordada.
  assertEquals(servidor.chamadas[2].cabecalhos['mcp-protocol-version'], '2025-06-18')
})

Deno.test('lê a resposta em SSE, inclusive quando o fluxo traz notificações e chega em pedaços', async () => {
  for (const modo of ['sse', 'sse-com-ruido'] as const) {
    const servidor = servidorMcpFalso({ modo })
    const ferramentas = await listarFerramentasMcp({ url: URL_MCP, cabecalhos: {}, fetch: servidor.fetch })
    assertEquals(ferramentas.length, 2, modo)
  }
})

Deno.test('guarda o Mcp-Session-Id do initialize, manda nas chamadas seguintes e encerra a sessão', async () => {
  const servidor = servidorMcpFalso({ sessao: true })
  await listarFerramentasMcp({ url: URL_MCP, cabecalhos: {}, fetch: servidor.fetch })
  const depois = servidor.chamadas.slice(1)
  assert(depois.every((c) => c.cabecalhos['mcp-session-id'] === 'sessao-falsa-123'))
  assertEquals(servidor.chamadas.at(-1)?.metodo, 'DELETE')
})

Deno.test('segue o nextCursor do tools/list até o fim', async () => {
  const ferramentas = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, description: '' }))
  const servidor = servidorMcpFalso({ ferramentas, tamanhoDaPagina: 2 })
  const lidas = await listarFerramentasMcp({ url: URL_MCP, cabecalhos: {}, fetch: servidor.fetch })
  assertEquals(lidas.map((f) => f.name), ['f0', 'f1', 'f2', 'f3', 'f4'])
  assertEquals(servidor.chamadas.filter((c) => c.rpc === 'tools/list').length, 3)
})

Deno.test('chama uma ferramenta e devolve o conteúdo; o isError da ferramenta passa como está', async () => {
  const servidor = servidorMcpFalso({
    resultados: {
      buscar: (argumentos) => ({ content: [{ type: 'text', text: `achei ${argumentos.termo}` }] }),
      criar: { content: [{ type: 'text', text: 'campo obrigatório' }], isError: true },
    },
  })
  const [achei, falhou] = await comSessaoMcp({ url: URL_MCP, cabecalhos: {}, fetch: servidor.fetch }, async (s) => [
    await s.chamar('buscar', { termo: 'alfa' }),
    await s.chamar('criar', {}),
  ])
  assertEquals(achei.content, [{ type: 'text', text: 'achei alfa' }])
  assertEquals(falhou.isError, true)
})

Deno.test('um 401 vira nao_autorizado e leva o WWW-Authenticate; o token não aparece na mensagem', async () => {
  const servidor = servidorMcpFalso({ token: 'certo-123456' })
  const erro = await assertRejects(
    () => listarFerramentasMcp({ url: URL_MCP, cabecalhos: { Authorization: 'Bearer errado-654321' }, fetch: servidor.fetch }),
    ErroDeProvedor,
  )
  assertEquals(erro.tipo, 'nao_autorizado')
  assertEquals(erro.status, 401)
  assert(erro.wwwAuthenticate?.includes('resource_metadata='))
  assert(!erro.message.includes('errado-654321'))
})

Deno.test('queda do servidor e rede fora viram indisponivel', async () => {
  const caiu = servidorMcpFalso({ statusFixo: 503 })
  const erro503 = await assertRejects(
    () => listarFerramentasMcp({ url: URL_MCP, cabecalhos: {}, fetch: caiu.fetch }),
    ErroDeProvedor,
  )
  assertEquals(erro503.tipo, 'indisponivel')
  const semRede = (() => Promise.reject(new TypeError('network'))) as unknown as typeof fetch
  const erroRede = await assertRejects(
    () => listarFerramentasMcp({ url: URL_MCP, cabecalhos: {}, fetch: semRede }),
    ErroDeProvedor,
  )
  assertEquals(erroRede.tipo, 'indisponivel')
})

Deno.test('um erro JSON-RPC do servidor vira rpc com o código (ferramenta desconhecida: -32602)', async () => {
  const servidor = servidorMcpFalso()
  const erro = await assertRejects(
    () => comSessaoMcp({ url: URL_MCP, cabecalhos: {}, fetch: servidor.fetch }, (s) => s.chamar('nao_existe', {})),
    ErroDeProvedor,
  )
  assertEquals(erro.tipo, 'rpc')
  assertEquals(erro.codigo, -32602)
})

Deno.test('uma versão do protocolo desconhecida é recusada, em vez de falar errado com o servidor', async () => {
  const servidor = servidorMcpFalso({ versaoDoProtocolo: '2099-01-01' })
  const erro = await assertRejects(
    () => listarFerramentasMcp({ url: URL_MCP, cabecalhos: {}, fetch: servidor.fetch }),
    ErroDeProvedor,
  )
  assertEquals(erro.tipo, 'protocolo')
})

Deno.test('a chave de API do Lusha vai no cabeçalho x-api-key', async () => {
  const servidor = servidorMcpFalso({ chave: { cabecalho: 'x-api-key', valor: 'chave-lusha' } })
  const ferramentas = await listarFerramentasMcp({
    url: 'https://mcp.lusha.com',
    cabecalhos: { 'x-api-key': 'chave-lusha' },
    fetch: servidor.fetch,
  })
  assertEquals(ferramentas.length, 2)
})
