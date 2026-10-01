// As ferramentas de uma Integração que não tem servidor MCP utilizável pelo caminho da chave de API (Pipedrive, RD Station
// CRM, HubSpot por Private App, Apollo por chave): um punhado de ferramentas descritas como DADOS (método, caminho,
// argumentos), que este módulo executa contra a API REST do app com a chave do participante. Dá aos Agentes a mesma forma
// de uso do MCP: listar ferramentas e chamar uma, com `escreve` marcando as que escrevem ou gastam (ADR-0002 e ADR-0021).
import { ErroDeProvedor, redigir, type FerramentaDaIntegracao, type ResultadoDaFerramenta } from './tipos.ts'

export interface FerramentaRest {
  nome: string
  descricao: string
  /** Escreve ou gasta crédito do app: pede a Permissão Executar do Agente. */
  escreve: boolean
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** O caminho depois da base; `{nome}` vira o argumento de mesmo nome, codificado. */
  caminho: string
  /** Os argumentos que vão na query string. */
  consulta?: string[]
  /** Os argumentos que vão no corpo JSON. */
  corpo?: string[]
  /** Quando o app espera o corpo dentro de uma chave (ex.: `{ "contact": {...} }`). */
  envelope?: string
  /** O esquema JSON dos argumentos (`properties` e `required`). */
  esquema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface PerfilRest {
  base: string
  autenticacao: { tipo: 'cabecalho'; nome: string; prefixo?: string } | { tipo: 'consulta'; nome: string }
  ferramentas: FerramentaRest[]
}

const TETO_DA_RESPOSTA = 100_000
const TEMPO_MAXIMO_MS = 25_000

export function ferramentasRest(rest: PerfilRest): FerramentaDaIntegracao[] {
  return rest.ferramentas.map((f) => ({ nome: f.nome, descricao: f.descricao, esquema: f.esquema, escreve: f.escreve }))
}

function argumentosInvalidos(mensagem: string): ErroDeProvedor {
  // O mesmo código do MCP (-32602, parâmetros inválidos), para quem chama tratar os dois transportes igual.
  return new ErroDeProvedor('rpc', mensagem, undefined, -32602)
}

/** Monta o endereço e o pedido de uma ferramenta; recusa argumento faltando antes de falar com o app. */
export function pedidoRest(
  rest: PerfilRest,
  ferramenta: FerramentaRest,
  argumentos: Record<string, unknown>,
  chave: string,
): { url: string; init: RequestInit } {
  for (const obrigatorio of ferramenta.esquema.required ?? []) {
    const valor = argumentos[obrigatorio]
    if (valor === undefined || valor === null || valor === '') throw argumentosInvalidos(`Falta o argumento "${obrigatorio}".`)
  }
  const caminho = ferramenta.caminho.replace(/\{(\w+)\}/g, (_, nome: string) => {
    const valor = argumentos[nome]
    if (valor === undefined || valor === null || valor === '') throw argumentosInvalidos(`Falta o argumento "${nome}".`)
    return encodeURIComponent(String(valor))
  })
  const url = new URL(rest.base.replace(/\/+$/, '') + caminho)
  for (const nome of ferramenta.consulta ?? []) {
    const valor = argumentos[nome]
    if (valor === undefined || valor === null) continue
    url.searchParams.set(nome, Array.isArray(valor) ? valor.join(',') : String(valor))
  }
  const cabecalhos: Record<string, string> = { Accept: 'application/json' }
  if (rest.autenticacao.tipo === 'cabecalho') {
    cabecalhos[rest.autenticacao.nome] = `${rest.autenticacao.prefixo ?? ''}${chave}`
  } else {
    url.searchParams.set(rest.autenticacao.nome, chave)
  }
  const init: RequestInit = { method: ferramenta.metodo, headers: cabecalhos }
  if (ferramenta.corpo) {
    const campos: Record<string, unknown> = {}
    for (const nome of ferramenta.corpo) {
      if (argumentos[nome] !== undefined) campos[nome] = argumentos[nome]
    }
    cabecalhos['Content-Type'] = 'application/json'
    init.body = JSON.stringify(ferramenta.envelope ? { [ferramenta.envelope]: campos } : campos)
  }
  return { url: url.toString(), init }
}

/** Executa uma ferramenta REST. Falha do app que é da ferramenta (400, 404, 422…) volta como `erro: true`, como o MCP faz. */
export async function executarFerramentaRest(
  rest: PerfilRest,
  nome: string,
  argumentos: Record<string, unknown>,
  chave: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaFerramenta> {
  const ferramenta = rest.ferramentas.find((f) => f.nome === nome)
  if (!ferramenta) throw new ErroDeProvedor('rpc', `Ferramenta desconhecida: ${nome}`, undefined, -32602)
  const { url, init } = pedidoRest(rest, ferramenta, argumentos, chave)
  let resposta: Response
  try {
    resposta = await buscar(url, { ...init, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) })
  } catch {
    throw new ErroDeProvedor('indisponivel', 'A API da Integração não respondeu a tempo.')
  }
  if (resposta.status === 401 || resposta.status === 403) {
    await resposta.body?.cancel().catch(() => {})
    throw new ErroDeProvedor('nao_autorizado', 'A API da Integração recusou a chave.', resposta.status)
  }
  if (resposta.status === 429 || resposta.status >= 500) {
    await resposta.body?.cancel().catch(() => {})
    throw new ErroDeProvedor('indisponivel', `A API da Integração está indisponível (HTTP ${resposta.status}).`, resposta.status)
  }
  const texto = await resposta.text().catch(() => '')
  if (!resposta.ok) {
    return { conteudo: [{ type: 'text', text: redigir(`A API respondeu HTTP ${resposta.status}: ${texto}`, [chave], 500) }], erro: true }
  }
  let estruturado: unknown
  try {
    estruturado = texto ? JSON.parse(texto) : null
  } catch {
    estruturado = undefined
  }
  const saida = texto.length > TETO_DA_RESPOSTA ? `${texto.slice(0, TETO_DA_RESPOSTA)}… (resposta cortada)` : texto
  return {
    conteudo: [{ type: 'text', text: saida }],
    ...(estruturado !== undefined && texto.length <= TETO_DA_RESPOSTA ? { estruturado } : {}),
    erro: false,
  }
}
