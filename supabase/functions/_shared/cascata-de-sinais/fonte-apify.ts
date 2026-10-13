// O cliente do Apify da cascata de Sinais: roda o actor de forma ASSÍNCRONA (`POST /v2/acts/{id}/runs`), com o teto de
// cobrança (`maxTotalChargeUsd`), espera o run terminar, lê o dataset e o custo real do run. O id do run vem da resposta
// do POST, nunca de `/runs/last` (frágil: pega o run de outra chamada). As contas do Apify são APIFY_TOKEN e
// APIFY_TOKEN_2..5 (`apify-ambiente.ts`): trocar ou somar uma conta é mudar segredo. Só a falta de crédito ou de limite
// de uso (402; 403 de recurso desligado ou de limite) gira para a próxima conta e repete o passo uma vez por conta; os
// outros erros, e o 429 por padrão, não giram. O token vai só no cabeçalho Authorization e nunca em erro, log ou prompt.
import { custoDaExecucaoLida } from '../../signal-scan/apify.ts'
import { MENSAGEM_DA_FONTE } from '../marca.ts'
import { redigir } from './redacao.ts'
import { type ClienteDaFonte, ErroDaFonte, type ExecucaoDaFonte } from './tipos.ts'

export interface OpcoesDoClienteAssincrono {
  /** As contas do Apify, na ordem de uso. */
  tokens: string[]
  fetchFn?: typeof fetch
  agora?: () => number
  dormir?: (ms: number) => Promise<void>
  /** Espera entre duas leituras do estado do run (além do `waitForFinish` do servidor). */
  esperaPorRodadaMs?: number
  /** Antes de reler o custo de um actor que cobra por evento: o Apify fecha a conta alguns segundos depois do run. */
  esperaDoCustoMs?: number
  releiturasDoCusto?: number
  /** Quanto tempo uma conta sem crédito fica de lado antes de ser tentada de novo. */
  esperaDaContaSemCreditoMs?: number
  girarEm429?: boolean
  log?: (campos: Record<string, unknown>) => void
}

const BASE = 'https://api.apify.com/v2'
const ESTADOS_FINAIS = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'])
// Os tipos de erro 403 do Apify que são falta de recurso ou de limite de uso (e não de permissão). Os nomes exatos não
// estão na documentação pública: a mensagem de limite de uso também vale.
const TIPOS_403_SEM_LIMITE = new Set(['platform-feature-disabled', 'not-enough-usage-to-run-paid-actor', 'usage-limit-exceeded'])
const MENSAGEM_DE_LIMITE = /usage|credit|limit|billing|subscription|platform feature/i
const FOLGA_DO_PRAZO_MS = 10_000

function registro(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
}

export function clienteAssincronoDoApify(opcoes: OpcoesDoClienteAssincrono): ClienteDaFonte {
  const {
    tokens,
    fetchFn = fetch,
    agora = () => Date.now(),
    dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    esperaPorRodadaMs = 1_500,
    esperaDoCustoMs = 4_000,
    releiturasDoCusto = 3,
    esperaDaContaSemCreditoMs = 30 * 60 * 1000,
    girarEm429 = false,
    log = (c) => console.log(JSON.stringify(c)),
  } = opcoes
  if (tokens.length === 0) throw new Error('Sem conta do Apify configurada')
  // As contas que acabaram de recusar por falta de crédito: voltam a ser tentadas depois da janela.
  const semCreditoAte = new Map<number, number>()

  const limpar = (t: unknown, limite?: number) => redigir(t, tokens, limite)

  async function chamar(token: string, metodo: string, caminho: string, corpo?: unknown, espera = 30_000): Promise<Response> {
    const controle = new AbortController()
    const t = setTimeout(() => controle.abort(), espera)
    try {
      return await fetchFn(`${BASE}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
        signal: controle.signal,
      })
    } catch (e) {
      throw new ErroDaFonte('rede', MENSAGEM_DA_FONTE.indisponivel, { erroReal: limpar(e instanceof Error ? `${e.name}: ${e.message}` : e) })
    } finally {
      clearTimeout(t)
    }
  }

  async function corpoDoErro(resposta: Response): Promise<{ tipo: string; mensagem: string; bruto: string }> {
    let bruto = ''
    try {
      bruto = await resposta.text()
    } catch {
      // Sem corpo, só o status.
    }
    let tipo = ''
    let mensagem = ''
    try {
      const e = registro(registro(JSON.parse(bruto)).error)
      tipo = typeof e.type === 'string' ? e.type : ''
      mensagem = typeof e.message === 'string' ? e.message : ''
    } catch {
      mensagem = bruto
    }
    return { tipo, mensagem, bruto: limpar(bruto || mensagem) }
  }

  function ehSemCredito(status: number, tipo: string, mensagem: string): boolean {
    if (status === 402) return true
    if (status === 403) return TIPOS_403_SEM_LIMITE.has(tipo) || MENSAGEM_DE_LIMITE.test(mensagem)
    return status === 429 && girarEm429
  }

  async function lerRun(token: string, runId: string, espera = 0, tempoMax = 30_000): Promise<Record<string, unknown> | null> {
    try {
      const r = await chamar(token, 'GET', `/actor-runs/${encodeURIComponent(runId)}${espera > 0 ? `?waitForFinish=${espera}` : ''}`, undefined, tempoMax)
      if (!r.ok) {
        await r.body?.cancel()
        return null
      }
      const dado = registro(registro(await r.json().catch(() => null)).data)
      return Object.keys(dado).length ? dado : null
    } catch {
      return null
    }
  }

  /** O custo real do run. O Apify fecha a conta depois do fim: no actor por evento, relê até duas leituras coincidirem. */
  async function custoDoRun(token: string, runId: string, primeira: Record<string, unknown> | null): Promise<number | null> {
    let run = primeira ?? await lerRun(token, runId)
    if (!run) return null
    let custo = custoDaExecucaoLida(run)
    const porEvento = registro(run.pricingInfo).pricingModel === 'PAY_PER_EVENT'
    for (let n = 0; porEvento && esperaDoCustoMs > 0 && n < releiturasDoCusto; n++) {
      await dormir(esperaDoCustoMs)
      const nova = await lerRun(token, runId)
      if (!nova) break
      const novoCusto = custoDaExecucaoLida(nova)
      const estavel = novoCusto !== null && novoCusto === custo && novoCusto > 0
      run = nova
      custo = novoCusto ?? custo
      if (estavel) break
    }
    return custo
  }

  async function rodarComToken(
    indice: number,
    args: Parameters<ClienteDaFonte['rodar']>[0],
  ): Promise<ExecucaoDaFonte> {
    const token = tokens[indice]
    const inicioMs = agora()
    const consulta = new URLSearchParams({
      maxTotalChargeUsd: String(args.maxTotalChargeUsd),
      maxItems: String(args.maxItems),
      timeout: String(Math.max(Math.ceil(args.timeoutSegundos), 5)),
    })
    const resposta = await chamar(token, 'POST', `/acts/${encodeURIComponent(args.actorId)}/runs?${consulta}`, args.input)
    if (resposta.status !== 201) {
      const { tipo, mensagem, bruto } = await corpoDoErro(resposta)
      const status = resposta.status
      if (ehSemCredito(status, tipo, mensagem)) {
        throw new ErroDaFonte('sem_credito', MENSAGEM_DA_FONTE.semSaldo, { statusHttp: status, tokenIndex: indice, erroReal: bruto })
      }
      throw new ErroDaFonte('http', MENSAGEM_DA_FONTE.indisponivel, { statusHttp: status, tokenIndex: indice, erroReal: bruto })
    }
    const criado = registro(registro(await resposta.json().catch(() => null)).data)
    const runId = typeof criado.id === 'string' ? criado.id : ''
    const datasetId = typeof criado.defaultDatasetId === 'string' ? criado.defaultDatasetId : ''
    if (!runId || !datasetId) {
      throw new ErroDaFonte('http', MENSAGEM_DA_FONTE.indisponivel, {
        statusHttp: 201,
        tokenIndex: indice,
        erroReal: 'O Apify aceitou o run sem devolver o id do run ou do dataset.',
      })
    }
    const build = typeof criado.buildNumber === 'string' ? criado.buildNumber : null
    const detalhe = (extra: Record<string, unknown> = {}) => ({ apifyRunId: runId, tokenIndex: indice, build, ...extra })
    log({ type: 'cascata_fonte', outcome: 'run_started', actorId: args.actorId, apifyRunId: runId, tokenIndex: indice })

    // Espera o run terminar (ou o prazo).
    const prazo = inicioMs + args.timeoutSegundos * 1000 + FOLGA_DO_PRAZO_MS
    let run: Record<string, unknown> | null = null
    for (;;) {
      const restanteS = Math.floor((prazo - agora()) / 1000)
      if (restanteS <= 0) break
      run = await lerRun(token, runId, Math.min(60, restanteS), Math.min(60, restanteS) * 1000 + 10_000)
      if (run && ESTADOS_FINAIS.has(String(run.status))) break
      await dormir(esperaPorRodadaMs)
      if (agora() >= prazo) break
    }

    if (!run || !ESTADOS_FINAIS.has(String(run.status))) {
      // O prazo acabou: aborta o run para ele parar de gastar e lê o que ele já cobrou.
      await chamar(token, 'POST', `/actor-runs/${encodeURIComponent(runId)}/abort`).then((r) => r.body?.cancel()).catch(() => {})
      const custoUsd = await custoDoRun(token, runId, null)
      throw new ErroDaFonte('timeout', MENSAGEM_DA_FONTE.tempo, detalhe({ custoUsd, erroReal: 'O run não terminou no prazo e foi abortado.' }))
    }

    const status = String(run.status)
    if (status !== 'SUCCEEDED') {
      const custoUsd = await custoDoRun(token, runId, run)
      const motivo = limpar(`${status}: ${typeof run.statusMessage === 'string' ? run.statusMessage : ''}`)
      throw new ErroDaFonte(
        status === 'TIMED-OUT' ? 'timeout' : 'run_falhou',
        status === 'TIMED-OUT' ? MENSAGEM_DA_FONTE.tempo : MENSAGEM_DA_FONTE.indisponivel,
        detalhe({ custoUsd, erroReal: motivo }),
      )
    }

    // Os itens do dataset.
    const lista = await chamar(token, 'GET', `/datasets/${encodeURIComponent(datasetId)}/items?${new URLSearchParams({ clean: 'true', format: 'json', limit: String(args.maxItems) })}`)
    let itens: unknown
    if (lista.ok) itens = await lista.json().catch(() => undefined)
    else await lista.body?.cancel()
    const custoUsd = await custoDoRun(token, runId, run)
    if (!Array.isArray(itens)) {
      throw new ErroDaFonte('nao_e_lista', MENSAGEM_DA_FONTE.indisponivel, detalhe({
        custoUsd,
        statusHttp: lista.status,
        erroReal: lista.ok ? 'O dataset não devolveu uma lista.' : `Leitura do dataset: HTTP ${lista.status}`,
      }))
    }
    log({ type: 'cascata_fonte', outcome: 'run_done', actorId: args.actorId, apifyRunId: runId, tokenIndex: indice, items: itens.length, costUsd: custoUsd })
    return { apifyRunId: runId, build, tokenIndex: indice, items: itens, custoUsd }
  }

  return {
    async rodar(args) {
      let ultimo: ErroDaFonte | null = null
      for (let i = 0; i < tokens.length; i++) {
        const ate = semCreditoAte.get(i)
        if (ate !== undefined && ate > agora()) continue
        try {
          return await rodarComToken(i, args)
        } catch (e) {
          if (!(e instanceof ErroDaFonte)) {
            throw new ErroDaFonte('rede', MENSAGEM_DA_FONTE.indisponivel, { tokenIndex: i, erroReal: limpar(e instanceof Error ? e.message : e) })
          }
          if (e.tipo === 'sem_credito') {
            semCreditoAte.set(i, agora() + esperaDaContaSemCreditoMs)
            ultimo = e
            log({ type: 'cascata_fonte', outcome: 'account_out_of_credit', actorId: args.actorId, tokenIndex: i, status: e.detalhe.statusHttp })
            continue
          }
          if (e.detalhe.tokenIndex === undefined) throw new ErroDaFonte(e.tipo, e.message, { ...e.detalhe, tokenIndex: i })
          throw e
        }
      }
      // Todas as contas recusaram por falta de crédito (ou ainda estão de lado desde a última recusa).
      semCreditoAte.clear()
      throw new ErroDaFonte('sem_credito_em_todas', MENSAGEM_DA_FONTE.semSaldo, {
        statusHttp: ultimo?.detalhe.statusHttp ?? 402,
        tokenIndex: ultimo?.detalhe.tokenIndex ?? null,
        erroReal: ultimo?.detalhe.erroReal ?? 'Todas as contas do Apify estão sem crédito ou sem limite de uso.',
      })
    },
  }
}
