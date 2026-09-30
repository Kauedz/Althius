// O cliente do Apify da varredura de Sinais: roda um actor pelo endpoint síncrono
// `POST /v2/acts/{actor}/run-sync-get-dataset-items`, com o token no cabeçalho Authorization (fora da URL e dos logs), e
// lê o custo da execução em `GET /v2/actor-runs/{id}`. Os parâmetros da chamada e o campo `usageTotalUsd` seguem a API
// do Apify como a função contact-photo-lookup já os usa; nenhum foi conferido contra a documentação (ver README).
import { type Apify, ApifyRequestError, ApifyTimeoutError, type Execucao } from './handler.ts'

export interface OpcoesDoApify {
  token: string
  fetchFn?: typeof fetch
  /** Prazo da execução no Apify, em segundos. */
  runTimeoutSeconds?: number
  /** Prazo da chamada HTTP; um pouco maior que o da execução. */
  timeoutMs?: number
}

export function clienteDoApify(
  { token, fetchFn = fetch, runTimeoutSeconds = 120, timeoutMs = 135_000 }: OpcoesDoApify,
): Apify {
  return {
    async run({ actorId, input, maxItems, maxTotalChargeUsd }): Promise<Execucao> {
      const consulta = new URLSearchParams({
        timeout: String(runTimeoutSeconds),
        limit: String(maxItems),
        maxItems: String(maxItems),
        maxTotalChargeUsd: String(maxTotalChargeUsd),
      })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const resposta = await fetchFn(
          `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?${consulta}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal: controller.signal,
          },
        )
        if (resposta.status === 408) {
          await resposta.body?.cancel()
          throw new ApifyTimeoutError()
        }
        if (!resposta.ok) {
          await resposta.body?.cancel()
          throw new ApifyRequestError(resposta.status)
        }
        const itens = await resposta.json().catch(() => [])
        return { runId: resposta.headers.get('x-apify-run-id'), items: Array.isArray(itens) ? itens : [] }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new ApifyTimeoutError()
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
    async custoDaExecucao(runId): Promise<number | null> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const resposta = await fetchFn(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!resposta.ok) {
          await resposta.body?.cancel()
          return null
        }
        const custo = ((await resposta.json().catch(() => null)) as { data?: { usageTotalUsd?: unknown } } | null)?.data
          ?.usageTotalUsd
        return typeof custo === 'number' && Number.isFinite(custo) && custo >= 0 ? custo : null
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
