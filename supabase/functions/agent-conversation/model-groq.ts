// O modelo dos Agentes pelo Groq, só para teste (ADR-0018): a API de chat compatível com a da OpenAI, com um modelo
// aberto escolhido no segredo GROQ_MODEL. O executor fala o formato da Messages API da Anthropic; este adaptador traduz
// o pedido para o formato do Groq e a resposta de volta, para o executor não saber qual provedor respondeu.
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { ErroDoModelo, type Modelo } from './runner.ts'

type Params = Parameters<Modelo['criar']>[0]
type Mensagem = Anthropic.Beta.Messages.BetaMessage

const URL_DO_GROQ = 'https://api.groq.com/openai/v1/chat/completions'
/** Modelos abertos têm saída menor que a do Claude: o teto fica abaixo do limite comum deles. */
const TETO_DE_SAIDA = 4096
const PRAZO_MS = 120_000
/** No limite de uso (429), uma nova tentativa, se o Groq pedir para esperar até isto. */
const ESPERA_MAXIMA_MS = 15_000
const TAMANHO_DO_DETALHE = 300

/** O motivo que o Groq mandou no corpo do erro, curto, para o log. */
async function detalheDoErro(resposta: Response): Promise<string> {
  try {
    const texto = await resposta.text()
    try {
      const corpo = JSON.parse(texto) as { error?: { message?: unknown } }
      if (typeof corpo?.error?.message === 'string') return corpo.error.message.slice(0, TAMANHO_DO_DETALHE)
    } catch {
      // Não é JSON: vai o texto como veio.
    }
    return texto.slice(0, TAMANHO_DO_DETALHE)
  } catch {
    return ''
  }
}

/** Quanto o Groq pediu para esperar (cabeçalho retry-after, em segundos), em ms; null se não disse. */
function esperaPedida(resposta: Response): number | null {
  const segundos = Number(resposta.headers.get('retry-after'))
  return Number.isFinite(segundos) && segundos >= 0 ? segundos * 1000 : null
}

interface MensagemDoChat {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

interface RespostaDoChat {
  choices?: {
    finish_reason?: string
    message?: { content?: string | null; tool_calls?: MensagemDoChat['tool_calls'] }
  }[]
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
}

function textoDoSystem(system: Params['system']): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  return system.map((bloco) => bloco.text).join('\n\n')
}

/** Traduz as mensagens do formato da Anthropic para o do chat: resultados de ferramenta viram mensagens `tool`. */
function mensagensDoChat(messages: Params['messages']): MensagemDoChat[] {
  const saida: MensagemDoChat[] = []
  for (const mensagem of messages) {
    if (typeof mensagem.content === 'string') {
      saida.push({ role: mensagem.role, content: mensagem.content })
      continue
    }
    const textos: string[] = []
    const chamadas: NonNullable<MensagemDoChat['tool_calls']> = []
    for (const bloco of mensagem.content) {
      if (bloco.type === 'text') textos.push(bloco.text)
      else if (bloco.type === 'tool_use') {
        chamadas.push({
          id: bloco.id,
          type: 'function',
          function: { name: bloco.name, arguments: JSON.stringify(bloco.input) },
        })
      } else if (bloco.type === 'tool_result') {
        const conteudo = typeof bloco.content === 'string'
          ? bloco.content
          : (bloco.content ?? []).flatMap((parte) => (parte.type === 'text' ? [parte.text] : [])).join('\n')
        saida.push({
          role: 'tool',
          tool_call_id: bloco.tool_use_id,
          content: bloco.is_error ? `ERRO: ${conteudo}` : conteudo,
        })
      }
    }
    if (mensagem.role === 'assistant') {
      saida.push({
        role: 'assistant',
        content: textos.join('\n') || null,
        ...(chamadas.length ? { tool_calls: chamadas } : {}),
      })
    } else if (textos.length) {
      saida.push({ role: 'user', content: textos.join('\n') })
    }
  }
  return saida
}

/** O corpo do pedido ao Groq. Exportado para o teste. */
export function corpoDoGroq(modelo: string, params: Params): Record<string, unknown> {
  const formato = params.output_config?.format
  const system = [
    textoDoSystem(params.system),
    // Sem schema estrito garantido, a saída estruturada vira modo JSON com o schema descrito no system.
    formato ? `Responda só com um objeto JSON que siga este JSON Schema:\n${JSON.stringify(formato.schema)}` : '',
  ].filter(Boolean).join('\n\n')
  const tools = (params.tools ?? []).flatMap((tool) =>
    'input_schema' in tool
      ? [{
        type: 'function',
        function: { name: tool.name, description: tool.description ?? '', parameters: tool.input_schema },
      }]
      : []
  )
  return {
    model: modelo,
    max_tokens: Math.min(params.max_tokens, TETO_DE_SAIDA),
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...mensagensDoChat(params.messages)],
    ...(tools.length ? { tools } : {}),
    ...(formato ? { response_format: { type: 'json_object' } } : {}),
  }
}

/** Traduz a resposta do chat para o formato que o executor lê. Exportado para o teste. */
export function mensagemDoGroq(resposta: RespostaDoChat): Mensagem {
  const escolha = resposta.choices?.[0]
  if (!escolha?.message) throw new ErroDoModelo('model_invalid_output')
  const content: unknown[] = []
  if (escolha.message.content) content.push({ type: 'text', text: escolha.message.content })
  for (const chamada of escolha.message.tool_calls ?? []) {
    let input: unknown = {}
    try {
      input = JSON.parse(chamada.function.arguments)
    } catch {
      // Argumentos que não são JSON: o executor recusa a consulta como inválida.
    }
    content.push({ type: 'tool_use', id: chamada.id, name: chamada.function.name, input })
  }
  const stop_reason = escolha.finish_reason === 'tool_calls' || (escolha.message.tool_calls?.length ?? 0) > 0
    ? 'tool_use'
    : escolha.finish_reason === 'length'
    ? 'max_tokens'
    : 'end_turn'
  // O consumo da chamada, para os créditos: o chat conta em prompt_tokens e completion_tokens.
  const { prompt_tokens, completion_tokens } = resposta.usage ?? {}
  const usage = typeof prompt_tokens === 'number' && typeof completion_tokens === 'number'
    ? { input_tokens: prompt_tokens, output_tokens: completion_tokens }
    : undefined
  return { stop_reason, content, ...(usage ? { usage } : {}) } as unknown as Mensagem
}

export function modeloDoGroq(
  {
    apiKey,
    modelo,
    fetch: buscar = fetch,
    esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)),
  }: { apiKey: string; modelo: string; fetch?: typeof fetch; esperar?: (ms: number) => Promise<void> },
): Modelo {
  async function chamar(params: Params): Promise<Response> {
    try {
      return await buscar(URL_DO_GROQ, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoDoGroq(modelo, params)),
        signal: AbortSignal.timeout(PRAZO_MS),
      })
    } catch (error) {
      throw new ErroDoModelo(
        error instanceof DOMException && error.name === 'TimeoutError' ? 'model_timeout' : 'model_unreachable',
      )
    }
  }

  return {
    nome: `groq/${modelo}`,
    async criar(params) {
      let resposta = await chamar(params)
      if (resposta.status === 429) {
        const espera = esperaPedida(resposta) ?? 2000
        if (espera <= ESPERA_MAXIMA_MS) {
          await resposta.body?.cancel()
          await esperar(espera)
          resposta = await chamar(params)
        }
      }
      if (!resposta.ok) {
        const detalhe = await detalheDoErro(resposta)
        if (resposta.status === 401 || resposta.status === 403) throw new ErroDoModelo('model_auth', detalhe)
        if (resposta.status === 429) throw new ErroDoModelo('model_rate_limited', detalhe)
        throw new ErroDoModelo(`model_http_${resposta.status}`, detalhe)
      }
      let corpo: RespostaDoChat
      try {
        corpo = await resposta.json()
      } catch {
        throw new ErroDoModelo('model_invalid_output')
      }
      return mensagemDoGroq(corpo)
    },
  }
}
