// Um servidor MCP falso (Streamable HTTP) para os testes: um `fetch` que responde como o servidor de um app responderia, com
// JSON ou SSE, sessão, paginação, autenticação por Bearer ou por cabeçalho de chave, e o registro de tudo o que chegou.
// Não é código de produção: os testes das Integrações o usam no lugar da rede.
import type { FerramentaMcp, ResultadoMcp } from './mcp-cliente.ts'

export interface ChamadaRecebida {
  metodo: string
  rpc: string | null
  cabecalhos: Record<string, string>
  corpo: Record<string, unknown> | null
}

export interface OpcoesDoServidorFalso {
  ferramentas?: FerramentaMcp[]
  /** Exige `Authorization: Bearer <token>`. */
  token?: string
  /** Exige este cabeçalho com este valor (chave de API). */
  chave?: { cabecalho: string; valor: string }
  modo?: 'json' | 'sse' | 'sse-com-ruido'
  /** Dá um Mcp-Session-Id no initialize e exige o cabeçalho depois. */
  sessao?: boolean
  /** Divide o tools/list em páginas deste tamanho. */
  tamanhoDaPagina?: number
  versaoDoProtocolo?: string
  /** O resultado de cada ferramenta, por nome. */
  resultados?: Record<string, ResultadoMcp | ((argumentos: Record<string, unknown>) => ResultadoMcp)>
  /** Erro JSON-RPC para uma ferramenta (por nome). */
  errosRpc?: Record<string, { code: number; message: string }>
  /** Responde a tudo com este status (queda do servidor). */
  statusFixo?: number
  /** O WWW-Authenticate do 401. */
  desafio?: string
}

export const FERRAMENTAS_PADRAO: FerramentaMcp[] = [
  { name: 'buscar', description: 'Busca registros.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'criar', description: 'Cria um registro.', inputSchema: { type: 'object' } },
]

export function servidorMcpFalso(opcoes: OpcoesDoServidorFalso = {}) {
  const chamadas: ChamadaRecebida[] = []
  const ferramentas = opcoes.ferramentas ?? FERRAMENTAS_PADRAO
  const sessaoEsperada = opcoes.sessao ? 'sessao-falsa-123' : null
  const versao = opcoes.versaoDoProtocolo ?? '2025-06-18'

  const fetchFalso = async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = new Request(entrada, init)
    const cabecalhos: Record<string, string> = {}
    req.headers.forEach((valor, nome) => (cabecalhos[nome.toLowerCase()] = valor))
    let corpo: Record<string, unknown> | null = null
    if (req.method === 'POST') corpo = await req.json().catch(() => null)
    const rpc = typeof corpo?.method === 'string' ? corpo.method : null
    chamadas.push({ metodo: req.method, rpc, cabecalhos, corpo })

    if (opcoes.statusFixo) return new Response('{}', { status: opcoes.statusFixo })
    if (opcoes.token && cabecalhos.authorization !== `Bearer ${opcoes.token}`) {
      return new Response('{}', {
        status: 401,
        headers: { 'WWW-Authenticate': opcoes.desafio ?? 'Bearer resource_metadata="https://mcp.falso.test/.well-known/oauth-protected-resource"' },
      })
    }
    if (opcoes.chave && cabecalhos[opcoes.chave.cabecalho.toLowerCase()] !== opcoes.chave.valor) {
      return new Response('{}', { status: 401 })
    }
    if (req.method === 'DELETE') return new Response(null, { status: 204 })
    if (req.method !== 'POST' || !corpo) return new Response('{}', { status: 405 })
    if (sessaoEsperada && rpc !== 'initialize' && cabecalhos['mcp-session-id'] !== sessaoEsperada) {
      return new Response('{}', { status: 404 })
    }
    if (rpc === 'notifications/initialized') return new Response(null, { status: 202 })

    const id = corpo.id as number
    const params = (corpo.params ?? {}) as Record<string, unknown>
    let resultado: unknown
    const cabecalhosDaResposta: Record<string, string> = {}
    if (rpc === 'initialize') {
      resultado = {
        protocolVersion: versao,
        capabilities: { tools: {} },
        serverInfo: { name: 'servidor-falso', version: '1' },
      }
      if (sessaoEsperada) cabecalhosDaResposta['Mcp-Session-Id'] = sessaoEsperada
    } else if (rpc === 'tools/list') {
      const tamanho = opcoes.tamanhoDaPagina ?? ferramentas.length
      const inicio = params.cursor ? Number(params.cursor) : 0
      const pagina = ferramentas.slice(inicio, inicio + tamanho)
      resultado = {
        tools: pagina,
        ...(inicio + tamanho < ferramentas.length ? { nextCursor: String(inicio + tamanho) } : {}),
      }
    } else if (rpc === 'tools/call') {
      const nome = String(params.name)
      const erroRpc = opcoes.errosRpc?.[nome]
      if (erroRpc) return responder(id, undefined, erroRpc)
      if (!ferramentas.some((f) => f.name === nome)) {
        return responder(id, undefined, { code: -32602, message: `Unknown tool: ${nome}` })
      }
      const saida = opcoes.resultados?.[nome]
      resultado = typeof saida === 'function'
        ? saida((params.arguments ?? {}) as Record<string, unknown>)
        : saida ?? { content: [{ type: 'text', text: `ok:${nome}` }] }
    } else {
      return responder(id, undefined, { code: -32601, message: 'Method not found' })
    }
    return responder(id, resultado, undefined, cabecalhosDaResposta)
  }

  function responder(
    id: number,
    resultado?: unknown,
    erro?: { code: number; message: string },
    extra: Record<string, string> = {},
  ): Response {
    const mensagem = { jsonrpc: '2.0', id, ...(erro ? { error: erro } : { result: resultado }) }
    if (opcoes.modo === 'sse' || opcoes.modo === 'sse-com-ruido') {
      const ruido = opcoes.modo === 'sse-com-ruido'
        ? `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info' } })}\n\n: comentario\n\n`
        : ''
      const texto = `${ruido}event: message\nid: 1\ndata: ${JSON.stringify(mensagem)}\n\n`
      // O fluxo chega em pedaços para o cliente provar que junta os eventos.
      const meio = Math.floor(texto.length / 2)
      const codificador = new TextEncoder()
      const fluxo = new ReadableStream<Uint8Array>({
        start(controle) {
          controle.enqueue(codificador.encode(texto.slice(0, meio)))
          controle.enqueue(codificador.encode(texto.slice(meio)))
          controle.close()
        },
      })
      return new Response(fluxo, { status: 200, headers: { 'Content-Type': 'text/event-stream', ...extra } })
    }
    return new Response(JSON.stringify(mensagem), { status: 200, headers: { 'Content-Type': 'application/json', ...extra } })
  }

  return { fetch: fetchFalso as typeof fetch, chamadas }
}
