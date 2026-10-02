import { assertEquals } from 'jsr:@std/assert@1'
import { identificarConta } from './identificacao.ts'
import { caminhosDe, PERFIS } from './perfis.ts'
import { servidorMcpFalso } from './servidor-mcp-falso.ts'

// O Pipedrive pelo conector oficial (migration 20261002111000): o servidor MCP com OAuth no Pipedrive, como no Claude, e
// a chave de API como alternativa.

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

Deno.test('Pipedrive: servidor MCP oficial com OAuth, registro dinâmico primeiro e os segredos PIPEDRIVE_MCP_* como app pré-registrado', () => {
  const perfil = PERFIS.pipedrive
  assertEquals(perfil.mcp?.url, 'https://mcp.pipedrive.ai/mcp')
  assertEquals(perfil.mcp?.oauth?.registro, 'dinamico')
  assertEquals(perfil.mcp?.oauth?.segredos, { clientId: 'PIPEDRIVE_MCP_CLIENT_ID', clientSecret: 'PIPEDRIVE_MCP_CLIENT_SECRET' })
  // Os endereços de autorização vêm da descoberta (RFC 9728/8414), não do perfil.
  assertEquals(perfil.mcp?.oauth?.autorizacao, undefined)
  assertEquals(caminhosDe(perfil), ['oauth_mcp', 'api_key'])
  assertEquals(perfil.portalFixo, true)
  // O caminho da chave continua igual.
  assertEquals(perfil.chaveDeApi?.via, 'rest')
  assertEquals(perfil.rest?.base, 'https://api.pipedrive.com/v1')
})

Deno.test('Pipedrive por OAuth: a conta e a empresa vêm de /users/me com o token no cabeçalho, como na chave', async () => {
  const pedidos: Request[] = []
  const fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    pedidos.push(req)
    if (req.url === 'https://api.pipedrive.com/v1/users/me' && req.headers.get('Authorization') === 'Bearer token-pd-1') {
      return json({ success: true, data: { company_id: 98765, email: 'ana@norte.test', name: 'Ana' } })
    }
    return json({}, 401)
  }) as typeof globalThis.fetch
  const r = await identificarConta(PERFIS.pipedrive.mcp!.oauth!.identificacao, 'token-pd-1', 'token', { fetch })
  assertEquals(r, { ok: true, portal: '98765', conta: 'ana@norte.test' })
  // O token nunca vai no endereço.
  assertEquals(pedidos.every((p) => !p.url.includes('token-pd-1')), true)
})

Deno.test('Pipedrive por OAuth: se a API REST não aceitar o token do MCP, a identificação tenta a ferramenta getAccountContext', async () => {
  const recusa = (() => Promise.resolve(json({}, 401))) as typeof globalThis.fetch
  const mcp = servidorMcpFalso({
    token: 'token-pd-1',
    ferramentas: [{ name: 'getAccountContext', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }],
    resultados: {
      getAccountContext: {
        content: [{ type: 'text', text: JSON.stringify({ user: { id: 7, company_id: 98765, email: 'ana@norte.test' }, pipelines: [] }) }],
      },
    },
  })
  const r = await identificarConta(PERFIS.pipedrive.mcp!.oauth!.identificacao, 'token-pd-1', 'token', {
    fetch: recusa,
    mcp: { url: 'https://mcp.pipedrive.ai/mcp', cabecalhos: { Authorization: 'Bearer token-pd-1' }, fetch: mcp.fetch },
  })
  assertEquals(r, { ok: true, portal: '98765', conta: 'ana@norte.test' })
})
