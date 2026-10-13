// A busca de Sinais do Hermes por HTTP: o worker roda fora do Supabase e não tem as contas do Apify; ele pede a busca à
// Edge Function `signal-cascade` (chave de serviço), que roda o motor com os segredos dela. Aqui só vai o pedido e volta a
// resposta já em palavras do produto; a chave de serviço nunca entra em erro nem em log.
import type { BuscaDeSinais, RespostaDaBusca } from './ferramentas-dos-agentes.ts'

const PRAZO_MS = 150_000

export function buscaDeSinaisPorHttp(
  { baseUrl, chaveDeServico, fetchFn = fetch }: { baseUrl: string; chaveDeServico: string; fetchFn?: typeof fetch },
): BuscaDeSinais {
  const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/signal-cascade`

  async function chamar(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), PRAZO_MS)
    try {
      const resposta = await fetchFn(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chaveDeServico}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      })
      const dado = await resposta.json().catch(() => ({})) as Record<string, unknown>
      // Só o status vai para o erro: nem o corpo da resposta nem a chave de serviço.
      if (!resposta.ok) throw new Error(`A busca de Sinais respondeu HTTP ${resposta.status}`)
      return dado
    } finally {
      clearTimeout(relogio)
    }
  }

  return {
    async catalogo() {
      const dado = await chamar({ action: 'catalogo' })
      return (Array.isArray(dado.sinais) ? dado.sinais : []) as Awaited<ReturnType<BuscaDeSinais['catalogo']>>
    },
    async buscar(a) {
      return await chamar({
        workspaceId: a.workspaceId,
        userId: a.userId,
        sinal: a.sinal,
        chave: a.chave,
        ...(a.contas ? { contas: a.contas } : {}),
        ...(a.criterios ? { criterios: a.criterios } : {}),
        ...(a.tetoCreditos !== undefined ? { tetoCreditos: a.tetoCreditos } : {}),
      }) as unknown as RespostaDaBusca
    },
  }
}
