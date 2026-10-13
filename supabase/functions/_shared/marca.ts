// A marca do produto (sinais em cascata, fatia 1): o usuário e o Hermes só conhecem "fonte pública", "Receita Federal" e
// "nossa busca". O nome do fornecedor de coleta (Apify), os actors, o fornecedor do modelo de linguagem (OpenAI, Anthropic) e
// os segredos ficam em log, em coluna técnica e no README das funções, nunca em texto que o cliente lê, em `last_error` ou
// em resultado de ferramenta.

/** O que nenhuma mensagem ao cliente, `last_error` ou resultado de ferramenta pode conter. */
// "actor" como palavra inteira: "factor" e "contractor" de uma vaga ou de uma notícia não são a marca. Os fornecedores de
// modelo de linguagem (OpenAI, Anthropic, Claude, GPT-n, Codex) também ficam fora do que o usuário lê: toda IA da Althius
// é "a Althius". "Hermes" não entra aqui: é o nome do motor interno e já não é dito ao usuário pelas instruções do Agente.
export const MARCA_INTERNA = /apify|\bactors?\b|openai|anthropic|\bclaude\b|\bgpt[-\s]?\d|\bcodex\b/i

/** As mensagens em palavras do produto para a falha de uma fonte de dados. */
export const MENSAGEM_DA_FONTE = {
  tempo: 'Nossa busca não respondeu a tempo.',
  indisponivel: 'A fonte pública está indisponível agora.',
  semSaldo: 'Sem saldo na fonte de dados; avisamos a equipe.',
} as const

/** A regra que o prompt do Hermes carrega: o motor nunca nomeia o que está por trás da coleta. */
export const REGRA_DE_MARCA =
  'Regra de marca: nunca nomeie provedores, plataformas de raspagem, actors nem ferramentas internas; diga "fonte ' +
  'pública", "Receita Federal" ou "nossa busca". Se um resultado de ferramenta citar a origem técnica de um dado, ' +
  'não a repita.'

/** O código técnico da falha de uma fonte (`timeout`, `apify_http_402`...) em mensagem do produto. */
export function mensagemDaFalhaDaFonte(codigo: string | undefined): string {
  if (codigo === 'timeout') return MENSAGEM_DA_FONTE.tempo
  if (codigo === 'apify_http_402' || codigo === 'apify_http_403' || codigo === 'actor_http_402' || codigo === 'actor_http_403') {
    return MENSAGEM_DA_FONTE.semSaldo
  }
  return MENSAGEM_DA_FONTE.indisponivel
}

/**
 * O texto de um erro em palavras do produto. Uma falha de saldo da fonte (402/403) diz que a equipe foi avisada; uma
 * mensagem que cita o fornecedor ou o actor é trocada pela do prazo ou pela genérica; o resto passa como veio.
 */
export function mensagemSegura(erro: unknown, padrao: string = MENSAGEM_DA_FONTE.indisponivel): string {
  const nome = erro instanceof Error ? erro.name : ''
  const status = (erro as { status?: unknown } | null)?.status
  if ((nome === 'ApifyRequestError' || nome === 'ActorRequestError') && (status === 402 || status === 403)) {
    return MENSAGEM_DA_FONTE.semSaldo
  }
  const mensagem = erro instanceof Error ? erro.message : ''
  if (!mensagem) return padrao
  if (!MARCA_INTERNA.test(mensagem)) return mensagem
  return /tempo/i.test(mensagem) ? MENSAGEM_DA_FONTE.tempo : padrao
}
