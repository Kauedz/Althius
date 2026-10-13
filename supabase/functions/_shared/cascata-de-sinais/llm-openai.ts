// O modelo de linguagem dos passos de Sinais pela API da OpenAI (plano B do provedor `hermes`): chat com modo JSON, por
// `fetch`. A chave e o modelo vêm do ambiente (OPENAI_API_KEY, OPENAI_MODEL), nunca do cliente. O custo volta com a resposta
// (tokens × preço configurado) e soma ao custo real da execução. Erros levam só o status HTTP: nunca a chave nem o corpo.
import { MENSAGEM_DO_PRAZO, MENSAGEM_SEM_JSON, PRAZO_PADRAO_DA_CLASSIFICACAO_MS, type PrecoDoModelo, respostaDoModelo } from './llm-comum.ts'
import type { Llm } from './tipos.ts'

const URL_DA_API = 'https://api.openai.com/v1/chat/completions'
// O modo JSON da API exige a palavra "JSON" nas mensagens.
const EXIGENCIA_DE_JSON = '\n\nResponda apenas com um objeto JSON válido, sem texto fora dele.'

export function llmDaOpenai(
  { apiKey, modelo, preco, prazoMs = PRAZO_PADRAO_DA_CLASSIFICACAO_MS, fetchFn = fetch }: {
    apiKey: string
    modelo: string
    preco: PrecoDoModelo
    prazoMs?: number
    fetchFn?: typeof fetch
  },
): Llm {
  return {
    async json({ sistema, usuario, maxTokens = 800 }) {
      const controle = new AbortController()
      const relogio = setTimeout(() => controle.abort(), prazoMs)
      try {
        let resposta: Response
        try {
          resposta = await fetchFn(URL_DA_API, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelo,
              max_completion_tokens: maxTokens,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: `${sistema}${EXIGENCIA_DE_JSON}` },
                { role: 'user', content: usuario },
              ],
            }),
            signal: controle.signal,
          })
        } catch (e) {
          if (controle.signal.aborted) throw new Error(MENSAGEM_DO_PRAZO)
          throw new Error(`A classificação falhou na rede (${e instanceof Error ? e.name : 'erro'})`)
        }
        if (!resposta.ok) {
          await resposta.body?.cancel()
          throw new Error(`A classificação respondeu HTTP ${resposta.status}`)
        }
        const corpo = await resposta.json().catch(() => null) as {
          choices?: { message?: { content?: unknown } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        } | null
        const texto = corpo?.choices?.[0]?.message?.content
        if (typeof texto !== 'string') throw new Error(MENSAGEM_SEM_JSON)
        return respostaDoModelo(texto, preco, corpo?.usage?.prompt_tokens, corpo?.usage?.completion_tokens)
      } finally {
        clearTimeout(relogio)
      }
    },
  }
}
