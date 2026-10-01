// O cliente MCP mínimo da Althius, sobre o transporte Streamable HTTP (especificação do MCP, 2025-06-18): um POST de
// JSON-RPC por mensagem, com `Accept: application/json, text/event-stream`, e a resposta vem como JSON ou como um fluxo
// SSE. Faz o que as Integrações precisam: `initialize`, `notifications/initialized`, `tools/list` (com paginação) e
// `tools/call`. É o único lugar que conhece o protocolo MCP (spec conexoes-funcionais). Cada operação abre a própria
// sessão: a Edge Function vive pouco, e assim não há sessão para vazar entre participantes.
//
// O token ou a chave vai só nos cabeçalhos da requisição (`cabecalhos`) e nunca em mensagem de erro.
import { ErroDeProvedor } from './tipos.ts'

/** As versões do protocolo que este cliente sabe falar; a primeira é a que ele oferece no `initialize`. */
export const VERSOES_DO_PROTOCOLO = ['2025-06-18', '2025-03-26', '2025-11-25'] as const

export interface FerramentaMcp {
  name: string
  description?: string
  inputSchema?: unknown
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string }
}

export interface ResultadoMcp {
  content: unknown[]
  isError?: boolean
  structuredContent?: unknown
}

export interface SessaoMcp {
  /** Todas as ferramentas do servidor (segue o `nextCursor` até o fim, com um teto de páginas). */
  ferramentas(): Promise<FerramentaMcp[]>
  chamar(nome: string, argumentos: Record<string, unknown>): Promise<ResultadoMcp>
}

export interface OpcoesDoClienteMcp {
  url: string
  /** Os cabeçalhos de autenticação (Authorization: Bearer … ou x-api-key: …). */
  cabecalhos: Record<string, string>
  fetch?: typeof fetch
  /** Tempo máximo de cada requisição, em milissegundos. */
  tempoMaximoMs?: number
}

const TETO_DE_PAGINAS = 20

interface MensagemRpc {
  jsonrpc?: string
  id?: number | string | null
  result?: unknown
  error?: { code?: number; message?: string }
  method?: string
}

/** Abre uma sessão MCP, roda `fn` nela e a encerra (DELETE, se o servidor deu um `Mcp-Session-Id`). */
export async function comSessaoMcp<T>(
  opcoes: OpcoesDoClienteMcp,
  fn: (sessao: SessaoMcp) => Promise<T>,
): Promise<T> {
  const buscar = opcoes.fetch ?? fetch
  const tempo = opcoes.tempoMaximoMs ?? 25_000
  let proximoId = 1
  let sessaoId: string | null = null
  let versao: string | null = null

  async function enviar(corpo: Record<string, unknown>, esperaResposta: boolean): Promise<unknown> {
    const cabecalhos: Record<string, string> = {
      ...opcoes.cabecalhos,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (sessaoId) cabecalhos['Mcp-Session-Id'] = sessaoId
    if (versao) cabecalhos['MCP-Protocol-Version'] = versao
    let resposta: Response
    try {
      resposta = await buscar(opcoes.url, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempo),
      })
    } catch {
      throw new ErroDeProvedor('indisponivel', 'O servidor da Integração não respondeu a tempo.')
    }
    if (resposta.status === 401 || resposta.status === 403) {
      await resposta.body?.cancel().catch(() => {})
      throw new ErroDeProvedor(
        'nao_autorizado',
        'O servidor da Integração recusou o acesso.',
        resposta.status,
        undefined,
        resposta.headers.get('WWW-Authenticate') ?? undefined,
      )
    }
    if (resposta.status === 429 || resposta.status >= 500) {
      await resposta.body?.cancel().catch(() => {})
      throw new ErroDeProvedor('indisponivel', `O servidor da Integração está indisponível (HTTP ${resposta.status}).`, resposta.status)
    }
    if (!resposta.ok) {
      await resposta.body?.cancel().catch(() => {})
      throw new ErroDeProvedor('protocolo', `O servidor da Integração recusou o pedido (HTTP ${resposta.status}).`, resposta.status)
    }
    const novaSessao = resposta.headers.get('Mcp-Session-Id')
    if (novaSessao) sessaoId = novaSessao
    if (!esperaResposta) {
      await resposta.body?.cancel().catch(() => {})
      return null
    }
    const tipo = (resposta.headers.get('Content-Type') ?? '').toLowerCase()
    const id = corpo.id as number
    const mensagem = tipo.includes('text/event-stream') ? await lerSse(resposta, id) : await lerJson(resposta, id)
    if (mensagem.error) {
      throw new ErroDeProvedor(
        'rpc',
        mensagem.error.message ?? 'O servidor da Integração devolveu um erro.',
        undefined,
        mensagem.error.code,
      )
    }
    return mensagem.result
  }

  async function requisitar(metodo: string, params?: Record<string, unknown>): Promise<unknown> {
    return await enviar({ jsonrpc: '2.0', id: proximoId++, method: metodo, ...(params ? { params } : {}) }, true)
  }

  const inicializado = await requisitar('initialize', {
    protocolVersion: VERSOES_DO_PROTOCOLO[0],
    capabilities: {},
    clientInfo: { name: 'althius', version: '1.0.0' },
  }) as { protocolVersion?: string } | undefined
  const acordada = inicializado?.protocolVersion
  if (typeof acordada !== 'string' || !(VERSOES_DO_PROTOCOLO as readonly string[]).includes(acordada)) {
    throw new ErroDeProvedor('protocolo', 'O servidor da Integração fala uma versão do MCP que a Althius não conhece.')
  }
  versao = acordada
  await enviar({ jsonrpc: '2.0', method: 'notifications/initialized' }, false)

  const sessao: SessaoMcp = {
    async ferramentas() {
      const todas: FerramentaMcp[] = []
      let cursor: string | undefined
      for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina++) {
        const resultado = await requisitar('tools/list', cursor ? { cursor } : undefined) as
          | { tools?: FerramentaMcp[]; nextCursor?: string }
          | undefined
        if (!resultado || !Array.isArray(resultado.tools)) {
          throw new ErroDeProvedor('protocolo', 'O servidor da Integração não listou as ferramentas.')
        }
        todas.push(...resultado.tools.filter((t) => t && typeof t.name === 'string'))
        if (!resultado.nextCursor) return todas
        cursor = resultado.nextCursor
      }
      return todas
    },
    async chamar(nome, argumentos) {
      const resultado = await requisitar('tools/call', { name: nome, arguments: argumentos }) as ResultadoMcp | undefined
      if (!resultado || typeof resultado !== 'object') {
        throw new ErroDeProvedor('protocolo', 'O servidor da Integração não devolveu o resultado da ferramenta.')
      }
      return { ...resultado, content: Array.isArray(resultado.content) ? resultado.content : [] }
    },
  }

  try {
    return await fn(sessao)
  } finally {
    if (sessaoId) {
      // Encerrar a sessão é cortesia: o servidor pode responder 405, e uma falha aqui não muda o resultado.
      await buscar(opcoes.url, {
        method: 'DELETE',
        headers: { ...opcoes.cabecalhos, 'Mcp-Session-Id': sessaoId, ...(versao ? { 'MCP-Protocol-Version': versao } : {}) },
        signal: AbortSignal.timeout(5_000),
      }).then((r) => r.body?.cancel()).catch(() => {})
    }
  }
}

/** Lista as ferramentas de um servidor MCP numa sessão só. */
export function listarFerramentasMcp(opcoes: OpcoesDoClienteMcp): Promise<FerramentaMcp[]> {
  return comSessaoMcp(opcoes, (sessao) => sessao.ferramentas())
}

async function lerJson(resposta: Response, idEsperado: number): Promise<MensagemRpc> {
  let corpo: unknown
  try {
    corpo = await resposta.json()
  } catch {
    throw new ErroDeProvedor('protocolo', 'O servidor da Integração devolveu uma resposta que não é JSON.')
  }
  // A versão 2025-03-26 do transporte permitia lotes (um array); a seguinte tirou. Aceita os dois.
  const mensagens = Array.isArray(corpo) ? corpo : [corpo]
  const achada = mensagens.find((m) => m && typeof m === 'object' && (m as MensagemRpc).id === idEsperado)
  if (!achada) throw new ErroDeProvedor('protocolo', 'O servidor da Integração não respondeu a este pedido.')
  return achada as MensagemRpc
}

/** Lê o fluxo SSE até a mensagem de resposta do pedido, ignorando notificações e pedidos do servidor. */
async function lerSse(resposta: Response, idEsperado: number): Promise<MensagemRpc> {
  const leitor = resposta.body?.getReader()
  if (!leitor) throw new ErroDeProvedor('protocolo', 'O servidor da Integração devolveu um fluxo vazio.')
  const decodificador = new TextDecoder()
  let pendente = ''
  try {
    while (true) {
      const { done, value } = await leitor.read()
      if (value) pendente += decodificador.decode(value, { stream: !done }).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      let corte: number
      while ((corte = pendente.indexOf('\n\n')) !== -1) {
        const evento = pendente.slice(0, corte)
        pendente = pendente.slice(corte + 2)
        const achada = mensagemDoEvento(evento, idEsperado)
        if (achada) return achada
      }
      if (done) {
        const achada = mensagemDoEvento(pendente, idEsperado)
        if (achada) return achada
        throw new ErroDeProvedor('indisponivel', 'O servidor da Integração fechou o fluxo antes de responder.')
      }
    }
  } catch (erro) {
    if (erro instanceof ErroDeProvedor) throw erro
    throw new ErroDeProvedor('indisponivel', 'O fluxo do servidor da Integração foi interrompido.')
  } finally {
    await leitor.cancel().catch(() => {})
  }
}

function mensagemDoEvento(evento: string, idEsperado: number): MensagemRpc | null {
  const dados = evento
    .split('\n')
    .filter((linha) => linha.startsWith('data:'))
    .map((linha) => linha.slice(5).replace(/^ /, ''))
  if (dados.length === 0) return null
  let json: unknown
  try {
    json = JSON.parse(dados.join('\n'))
  } catch {
    return null
  }
  const mensagens = Array.isArray(json) ? json : [json]
  const achada = mensagens.find((m) => m && typeof m === 'object' && (m as MensagemRpc).id === idEsperado && !(m as MensagemRpc).method)
  return (achada as MensagemRpc | undefined) ?? null
}
