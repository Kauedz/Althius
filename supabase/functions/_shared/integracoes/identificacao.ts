// Descobre a conta do app (para o cartão mostrar com quem a pessoa entrou) e o portal (para o primeiro Acesso fixar o
// portal do Workspace, ADR-0017), com a credencial recém-obtida: as chamadas do perfil, os campos do endpoint de token
// e, por último, uma ferramenta do servidor MCP. Numa chave de API, é também a validação: chave recusada não se grava.
import { comSessaoMcp, type OpcoesDoClienteMcp } from './mcp-cliente.ts'
import type { Identificacao } from './perfis.ts'
import { ErroDeProvedor, primeiroValor } from './tipos.ts'

export type ResultadoDaIdentificacao =
  | { ok: true; portal: string | null; conta: string | null }
  | { ok: false; motivo: 'recusada' | 'indisponivel' | 'nao_identificada' }

export interface DepsDaIdentificacao {
  fetch?: typeof fetch
  /** A sessão MCP já autenticada, para o fallback por ferramenta (só no OAuth). */
  mcp?: OpcoesDoClienteMcp
}

function com(texto: string, credencial: string, noEndereco: boolean): string {
  return texto.replaceAll('{credencial}', noEndereco ? encodeURIComponent(credencial) : credencial)
}

/** O texto da primeira parte `text` de um resultado de ferramenta, lido como JSON; nulo se não for JSON. */
function jsonDoResultado(resultado: { content: unknown[]; structuredContent?: unknown }): unknown {
  if (resultado.structuredContent && typeof resultado.structuredContent === 'object') return resultado.structuredContent
  for (const parte of resultado.content) {
    const texto = (parte as { type?: string; text?: unknown })?.text
    if (typeof texto !== 'string') continue
    try {
      return JSON.parse(texto)
    } catch {
      // Texto livre: nada a ler como campo.
    }
  }
  return null
}

/**
 * `modo = 'chave'`: uma chave de API; 401/403 numa consulta é a chave recusada. `modo = 'token'`: um token OAuth recém
 * emitido pelo servidor de autorização; um 401/403 numa consulta REST só quer dizer que aquela API não aceita este token,
 * e a identificação segue para o próximo caminho.
 */
export async function identificarConta(
  identificacao: Identificacao | undefined,
  credencial: string,
  modo: 'chave' | 'token',
  deps: DepsDaIdentificacao & { respostaDoToken?: Record<string, unknown> } = {},
): Promise<ResultadoDaIdentificacao> {
  const buscar = deps.fetch ?? fetch
  let portal: string | null = null
  let conta: string | null = null
  const completa = (fixaPortal: boolean) => conta !== null && (portal !== null || !fixaPortal)

  if (identificacao?.daRespostaDoToken && deps.respostaDoToken) {
    portal = primeiroValor(deps.respostaDoToken, identificacao.daRespostaDoToken.portal)
    conta = primeiroValor(deps.respostaDoToken, identificacao.daRespostaDoToken.conta)
  }

  let algumaRespondeu = false
  let semRede = false
  for (const requisicao of identificacao?.requisicoes ?? []) {
    if (completa(true)) break
    const cabecalhos: Record<string, string> = { Accept: 'application/json' }
    for (const [nome, valor] of Object.entries(requisicao.cabecalhos ?? {})) cabecalhos[nome] = com(valor, credencial, false)
    let resposta: Response
    try {
      resposta = await buscar(com(requisicao.url, credencial, true), {
        method: requisicao.metodo,
        headers: cabecalhos,
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      semRede = true
      continue
    }
    if (resposta.status === 401 || resposta.status === 403) {
      await resposta.body?.cancel().catch(() => {})
      if (modo === 'chave') return { ok: false, motivo: 'recusada' }
      continue
    }
    if (resposta.status === 429 || resposta.status >= 500) {
      await resposta.body?.cancel().catch(() => {})
      semRede = true
      continue
    }
    if (!resposta.ok) {
      await resposta.body?.cancel().catch(() => {})
      continue
    }
    algumaRespondeu = true
    const json = await resposta.json().catch(() => null)
    portal ??= primeiroValor(json, requisicao.portal)
    conta ??= primeiroValor(json, requisicao.conta)
    // Uma chamada que respondeu 2xx já validou a chave; a próxima só é tentada se faltar o portal.
    if (modo === 'chave' && portal !== null) break
  }

  if (identificacao?.porFerramentaMcp && deps.mcp && (portal === null || conta === null)) {
    const alvo = identificacao.porFerramentaMcp
    try {
      const resultado = await comSessaoMcp(deps.mcp, (sessao) => sessao.chamar(alvo.ferramenta, alvo.argumentos ?? {}))
      const json = jsonDoResultado(resultado)
      portal ??= primeiroValor(json, alvo.portal)
      conta ??= primeiroValor(json, alvo.conta)
      algumaRespondeu = true
    } catch (erro) {
      if (erro instanceof ErroDeProvedor && erro.tipo === 'indisponivel') semRede = true
    }
  }

  if (portal !== null || conta !== null || algumaRespondeu) return { ok: true, portal, conta }
  return { ok: false, motivo: semRede ? 'indisponivel' : 'nao_identificada' }
}
