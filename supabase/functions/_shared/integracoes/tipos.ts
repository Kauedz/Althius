// Os tipos que as Integrações compartilham: o caminho de conexão, a Permissão do Agente, o erro tipado que quem chama uma
// Integração recebe (nunca com token) e o erro interno de quem falou com o provedor.

/** Como o participante conectou o Acesso: OAuth no servidor MCP oficial do app, ou a chave de API dele (ADR-0021). */
export type TipoDeAcesso = 'oauth_mcp' | 'api_key'

/** A Permissão do Agente numa Integração (ADR-0002). */
export type Permissao = 'ler' | 'propor' | 'executar'

/**
 * O que pode dar errado ao usar o Acesso de alguém, em quatro tipos que os Agentes tratam (`precisa_reconectar`,
 * `nao_habilitada`, `permissao_negada`, `indisponivel`) mais `ferramenta_invalida` (a ferramenta não existe ou os
 * argumentos foram recusados). A mensagem é para a pessoa e nunca carrega token, chave nem cabeçalho.
 */
export type ErroDeIntegracao =
  | {
    tipo: 'precisa_reconectar'
    motivo: 'sem_acesso' | 'revogado' | 'participacao_inativa'
    mensagem: string
  }
  | { tipo: 'nao_habilitada'; mensagem: string }
  | { tipo: 'permissao_negada'; exigida: Permissao; atual: Permissao | null; mensagem: string }
  | { tipo: 'indisponivel'; mensagem: string }
  | { tipo: 'ferramenta_invalida'; mensagem: string }

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: ErroDeIntegracao }

export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor })
export const falha = (erro: ErroDeIntegracao): Resultado<never> => ({ ok: false, erro })

/** Uma ferramenta que o servidor da Integração oferece, como a tela e os Agentes a veem. */
export interface FerramentaDaIntegracao {
  nome: string
  descricao: string
  /** O esquema JSON dos argumentos, como o servidor o publicou. */
  esquema: unknown
  /** Escreve ou gasta (crédito, verba): pede a Permissão Executar do Agente. Só `readOnlyHint` a marca como leitura. */
  escreve: boolean
}

/** O que uma ferramenta devolveu. `erro` é a ferramenta dizendo que falhou (o `isError` do MCP), não a Integração. */
export interface ResultadoDaFerramenta {
  conteudo: unknown[]
  estruturado?: unknown
  erro: boolean
}

/**
 * Quem falou com o provedor (servidor MCP, API REST, servidor de autorização) e não deu certo. `nao_autorizado` é um
 * 401/403; `indisponivel` é rede, tempo esgotado, 429 ou 5xx; `protocolo` é uma resposta que não fala o que se esperava;
 * `rpc` é um erro JSON-RPC do servidor MCP (com o código).
 */
export class ErroDeProvedor extends Error {
  constructor(
    readonly tipo: 'nao_autorizado' | 'indisponivel' | 'protocolo' | 'rpc',
    mensagem: string,
    readonly status?: number,
    readonly codigo?: number | string,
    readonly wwwAuthenticate?: string,
  ) {
    super(mensagem)
    this.name = 'ErroDeProvedor'
  }
}

/** Tira de um texto qualquer dos segredos informados, para uma mensagem de erro nunca devolver um token. */
export function redigir(texto: string, segredos: readonly (string | undefined | null)[], limite = 300): string {
  let limpo = texto
  for (const segredo of segredos) {
    if (segredo && segredo.length >= 6) limpo = limpo.split(segredo).join('[segredo]')
  }
  return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo
}

/** Lê um valor de um objeto JSON por um caminho com pontos (`data.company_id`); nulo se não houver. */
export function valorNoCaminho(objeto: unknown, caminho: string): string | null {
  let atual: unknown = objeto
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object') return null
    atual = (atual as Record<string, unknown>)[parte]
  }
  if (typeof atual === 'string' && atual.trim() !== '') return atual.trim()
  if (typeof atual === 'number' && Number.isFinite(atual)) return String(atual)
  return null
}

/** O primeiro valor não vazio entre vários caminhos alternativos. */
export function primeiroValor(objeto: unknown, caminhos: readonly string[] | undefined): string | null {
  for (const caminho of caminhos ?? []) {
    const valor = valorNoCaminho(objeto, caminho)
    if (valor !== null) return valor
  }
  return null
}
