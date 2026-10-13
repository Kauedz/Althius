// O que os adaptadores do modelo de linguagem dos passos de Sinais têm em comum: ler o JSON do texto, o preço por token e o
// prazo. Nada aqui nomeia fornecedor em texto que o usuário lê; o preço e o prazo vêm do ambiente (sem publicar código).

/** O JSON dentro do texto do modelo: aceita a resposta pura ou cercada por ```json. */
export function jsonDoTexto(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim()
  return JSON.parse(limpo)
}

/** Dólares por milhão de tokens. */
export interface PrecoDoModelo {
  entradaPorMilhao: number
  saidaPorMilhao: number
}

/**
 * Preço usado enquanto o ambiente não informa o do modelo escolhido. É um valor conservador (acima do de um modelo pequeno)
 * para não cobrar de menos; o custo de uma classificação é de frações de centavo de dólar, bem abaixo do mínimo de 1 crédito.
 * O preço real do modelo vai em SIGNALS_LLM_PRICE_INPUT_PER_MILLION e SIGNALS_LLM_PRICE_OUTPUT_PER_MILLION.
 */
export const PRECO_CONSERVADOR: PrecoDoModelo = { entradaPorMilhao: 2.5, saidaPorMilhao: 10 }

/** O prazo de uma classificação: o do ambiente entre 5 e 90 segundos, ou 45 s. A função inteira dura 150 s. */
export const PRAZO_PADRAO_DA_CLASSIFICACAO_MS = 45_000

function positivo(valor: string | undefined): number | null {
  const n = Number(valor)
  return valor !== undefined && valor.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

export function precoDoAmbiente(env: (nome: string) => string | undefined): PrecoDoModelo {
  return {
    entradaPorMilhao: positivo(env('SIGNALS_LLM_PRICE_INPUT_PER_MILLION')) ?? PRECO_CONSERVADOR.entradaPorMilhao,
    saidaPorMilhao: positivo(env('SIGNALS_LLM_PRICE_OUTPUT_PER_MILLION')) ?? PRECO_CONSERVADOR.saidaPorMilhao,
  }
}

export function prazoDoAmbiente(env: (nome: string) => string | undefined): number {
  const n = positivo(env('SIGNALS_LLM_TIMEOUT_MS'))
  return n === null ? PRAZO_PADRAO_DA_CLASSIFICACAO_MS : Math.min(Math.max(Math.round(n), 5_000), 90_000)
}

/** O custo em dólar de um uso de tokens, com 8 casas. */
export function custoPorTokens(preco: PrecoDoModelo, entrada: number, saida: number): number {
  const usd = (Math.max(entrada, 0) * preco.entradaPorMilhao + Math.max(saida, 0) * preco.saidaPorMilhao) / 1_000_000
  return Math.round(usd * 1e8) / 1e8
}

export const MENSAGEM_DO_PRAZO = 'A classificação não respondeu a tempo'
export const MENSAGEM_SEM_JSON = 'A classificação não devolveu um JSON válido'
