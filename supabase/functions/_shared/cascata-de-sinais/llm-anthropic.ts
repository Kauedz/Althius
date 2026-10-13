// O modelo de linguagem das cascatas (classificar texto, extrair o nome de uma empresa de uma notícia): a Messages API da
// Anthropic por `fetch`, com o modelo mais barato (Claude Haiku 5.5: US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de
// saída, prompts de até 100 mil tokens; tabela da documentação em 06/10/2026). A chave é a da Althius (ANTHROPIC_API_KEY),
// nunca a do cliente. O custo volta com a resposta e soma ao custo real da execução. Sem chave a função não monta este
// modelo e os passos que dependem dele usam a regra simples.
import type { Llm } from './tipos.ts'

export const MODELO_DAS_CASCATAS = 'claude-haiku-5-5'
const PRECO_DE_ENTRADA_POR_MILHAO = 0.10
const PRECO_DE_SAIDA_POR_MILHAO = 0.50

/** O JSON dentro do texto do modelo: aceita a resposta pura ou cercada por ```json. */
export function jsonDoTexto(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim()
  return JSON.parse(limpo)
}

export function llmDaAnthropic(
  { apiKey, fetchFn = fetch, modelo = MODELO_DAS_CASCATAS }: { apiKey: string; fetchFn?: typeof fetch; modelo?: string },
): Llm {
  return {
    async json({ sistema, usuario, maxTokens = 800 }) {
      const controle = new AbortController()
      const relogio = setTimeout(() => controle.abort(), 40_000)
      try {
        const resposta = await fetchFn('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: modelo,
            max_tokens: maxTokens,
            system: sistema,
            messages: [{ role: 'user', content: usuario }],
            output_config: { effort: 'low' },
          }),
          signal: controle.signal,
        })
        if (!resposta.ok) {
          await resposta.body?.cancel()
          throw new Error(`A classificação respondeu HTTP ${resposta.status}`)
        }
        const corpo = await resposta.json() as {
          content?: { type?: string; text?: string }[]
          usage?: { input_tokens?: number; output_tokens?: number }
        }
        const texto = (corpo.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
        let json: unknown
        try {
          json = jsonDoTexto(texto)
        } catch {
          throw new Error('A classificação não devolveu um JSON válido')
        }
        const custoUsd = ((corpo.usage?.input_tokens ?? 0) * PRECO_DE_ENTRADA_POR_MILHAO + (corpo.usage?.output_tokens ?? 0) * PRECO_DE_SAIDA_POR_MILHAO) / 1_000_000
        return { json, custoUsd: Math.round(custoUsd * 1e8) / 1e8 }
      } finally {
        clearTimeout(relogio)
      }
    },
  }
}
