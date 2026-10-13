// Um Apify falso para os testes: responde pela API HTTP (nunca pela rede), com o comportamento de cada conta (token) e de
// cada actor escolhido no teste. Guarda cada requisição para o teste conferir o que foi chamado.
export interface RequisicaoFalsa {
  metodo: string
  caminho: string
  consulta: URLSearchParams
  token: string
  corpo: unknown
}

export interface ComportamentoDoRun {
  /** O que o POST /runs responde: 201 com o run, ou o erro. */
  inicio?: { status: number; corpo?: unknown }
  /** Os estados sucessivos do run a cada leitura (o último vale dali em diante). */
  estados?: string[]
  /** A mensagem de status do run quando falha. */
  mensagem?: string
  itens?: unknown
  usageTotalUsd?: number
  /** Leituras do custo: a primeira pode vir incompleta (o Apify fecha a conta depois). */
  usagePorLeitura?: number[]
  pricingModel?: string
  chargedEventCounts?: Record<string, number>
  build?: string
}

export function apifyFalso(
  porToken: Record<string, ComportamentoDoRun> | ((token: string, actorId: string) => ComportamentoDoRun),
) {
  const requisicoes: RequisicaoFalsa[] = []
  const leituras = new Map<string, number>()
  let proximoId = 1
  const runs = new Map<string, { comportamento: ComportamentoDoRun; token: string }>()
  const cabecalhos = { 'Content-Type': 'application/json' }
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cabecalhos })

  const fetchFn = ((entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada))
    const token = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '').replace(/^Bearer /, '')
    const corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const metodo = init?.method ?? 'GET'
    requisicoes.push({ metodo, caminho: url.pathname, consulta: url.searchParams, token, corpo })
    const comportamentoDe = (actorId: string): ComportamentoDoRun =>
      typeof porToken === 'function' ? porToken(token, actorId) : (porToken[token] ?? {})

    const inicio = url.pathname.match(/^\/v2\/(?:acts|actors)\/([^/]+)\/runs$/)
    if (inicio && metodo === 'POST') {
      const c = comportamentoDe(decodeURIComponent(inicio[1]))
      if (c.inicio && c.inicio.status !== 201) return Promise.resolve(json(c.inicio.corpo ?? {}, c.inicio.status))
      const id = `run-${proximoId++}`
      runs.set(id, { comportamento: c, token })
      return Promise.resolve(json({ data: { id, status: 'READY', defaultDatasetId: `ds-${id}`, buildNumber: c.build ?? '1.0.0' } }, 201))
    }
    const leitura = url.pathname.match(/^\/v2\/actor-runs\/([^/]+)$/)
    if (leitura && metodo === 'GET') {
      const run = runs.get(leitura[1])
      if (!run) return Promise.resolve(json({ error: { type: 'record-not-found', message: 'run' } }, 404))
      const n = leituras.get(leitura[1]) ?? 0
      leituras.set(leitura[1], n + 1)
      const c = run.comportamento
      const estados = c.estados ?? ['SUCCEEDED']
      const usage = c.usagePorLeitura ? c.usagePorLeitura[Math.min(Math.max(n - 1, 0), c.usagePorLeitura.length - 1)] : c.usageTotalUsd
      return Promise.resolve(json({
        data: {
          id: leitura[1],
          status: estados[Math.min(n, estados.length - 1)],
          statusMessage: c.mensagem,
          defaultDatasetId: `ds-${leitura[1]}`,
          buildNumber: c.build ?? '1.0.0',
          usageTotalUsd: usage,
          chargedEventCounts: c.chargedEventCounts ?? {},
          pricingInfo: { pricingModel: c.pricingModel ?? 'PRICE_PER_DATASET_ITEM' },
        },
      }))
    }
    const aborto = url.pathname.match(/^\/v2\/actor-runs\/([^/]+)\/abort$/)
    if (aborto && metodo === 'POST') {
      const run = runs.get(aborto[1])
      if (run) run.comportamento = { ...run.comportamento, estados: ['ABORTED'] }
      return Promise.resolve(json({ data: { id: aborto[1], status: 'ABORTING' } }))
    }
    const dados = url.pathname.match(/^\/v2\/datasets\/ds-([^/]+)\/items$/)
    if (dados && metodo === 'GET') {
      const run = runs.get(dados[1])
      return Promise.resolve(json(run?.comportamento.itens ?? []))
    }
    return Promise.resolve(json({ error: { type: 'not-found', message: `${metodo} ${url.pathname}` } }, 404))
  }) as typeof fetch

  return { fetchFn, requisicoes }
}
