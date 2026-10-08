// A varredura de Sinais (sinais-reais, ticket 01): roda um actor do registro pela conta do Apify da Althius (ADR-0019),
// com teto de custo por execução, e devolve os itens brutos a quem chamou. Só o servidor chama: a função exige a chave
// de serviço, e o navegador nunca fala com ela. Um actor fora do registro, marcado "fora" ou ainda "em teste" (sem o
// aval de quem chama) nunca roda. O custo real de cada execução vai para o relatório de custos. Transformar os itens em
// Sinais é do Monitoramento (ticket 02), não desta função. Banco e Apify entram por injeção, para o teste ir da
// requisição à resposta sem rede.
import { gravarCustoDaExecucao } from '../_shared/apify-ambiente.ts'

export interface ActorDoRegistro {
  actorId: string
  signalType: string
  state: 'available' | 'testing' | 'out'
  version: string | null
  maxCostUsd: number
}

export interface Db {
  /** signal_actor_for_scan: o actor do registro, ou null quando ele não está lá. */
  actorForScan(actorId: string): Promise<ActorDoRegistro | null>
  /** record_signal_scan_cost: o custo real da execução, para o relatório. */
  recordCost(args: { workspaceId: string; actorId: string; runId: string; items: number; costUsd: number | null }): Promise<void>
}

export interface Execucao {
  runId: string | null
  items: unknown[]
}

export interface Apify {
  /**
   * Roda o actor e espera os itens. Lança ApifyRequestError quando o Apify recusa e ApifyTimeoutError no prazo.
   * `corpoTemDeSerLista`: um 200 cujo corpo não é uma lista vira erro, em vez de lista vazia. O id da execução,
   * quando o Apify o devolve, vai no erro para o custo ainda ser lido.
   */
  run(args: {
    actorId: string
    input: unknown
    maxItems: number
    maxTotalChargeUsd: number
    corpoTemDeSerLista?: boolean
  }): Promise<Execucao>
  /** O custo em dólar que o Apify informa para a execução, ou null. Só medida. */
  custoDaExecucao?(runId: string): Promise<number | null>
}

export class ApifyRequestError extends Error {
  constructor(readonly status: number, readonly runId: string | null = null) {
    super(`Apify respondeu HTTP ${status}`)
    this.name = 'ApifyRequestError'
  }
}

export class ApifyTimeoutError extends Error {
  constructor(readonly runId: string | null = null) {
    super('O actor do Apify não respondeu a tempo')
    this.name = 'ApifyTimeoutError'
  }
}

export interface Deps {
  db: Db
  apify: Apify
  /** Se o cabeçalho Authorization é o da chave de serviço. */
  autorizado(authorization: string): boolean | Promise<boolean>
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ACTOR = /^[A-Za-z0-9_.-]+[~/][A-Za-z0-9_.-]+$/
const MAX_ITENS_PADRAO = 100
const MAX_ITENS = 1000
const TAMANHO_MAXIMO_DA_ENTRADA = 20_000

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)
    if (!(await deps.autorizado(req.headers.get('Authorization') ?? ''))) return responder({ error: 'Não autorizado.' }, 401)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return responder({ error: 'Corpo inválido.' }, 400)
    }
    const workspaceId = typeof corpo?.workspaceId === 'string' ? corpo.workspaceId : ''
    const actorId = typeof corpo?.actorId === 'string' ? corpo.actorId.trim().replace('/', '~') : ''
    const maxItens = corpo?.maxItems === undefined ? MAX_ITENS_PADRAO : Number(corpo.maxItems)
    const tetoPedido = corpo?.maxTotalChargeUsd === undefined ? Infinity : Number(corpo.maxTotalChargeUsd)
    if (!UUID.test(workspaceId)) return responder({ error: 'Workspace obrigatório.' }, 400)
    if (!ACTOR.test(actorId)) return responder({ error: 'Actor inválido.' }, 400)
    if (!Number.isInteger(maxItens) || maxItens < 1 || maxItens > MAX_ITENS) {
      return responder({ error: `maxItems vai de 1 a ${MAX_ITENS}.` }, 400)
    }
    if (!(tetoPedido > 0)) return responder({ error: 'maxTotalChargeUsd precisa ser maior que zero.' }, 400)
    const entrada = corpo?.input
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
      return responder({ error: 'A entrada do actor precisa ser um objeto.' }, 400)
    }
    if (JSON.stringify(entrada).length > TAMANHO_MAXIMO_DA_ENTRADA) {
      return responder({ error: 'A entrada do actor é grande demais.' }, 400)
    }

    let actor: ActorDoRegistro | null
    try {
      actor = await deps.db.actorForScan(actorId)
    } catch (error) {
      log({ type: 'signal_scan', actorId, outcome: 'registry_failed', message: String(error) })
      return responder({ error: 'Não foi possível consultar o registro de actors.' }, 500)
    }
    // Fora do registro, ou marcado "fora": nunca roda. "Em teste": só com o aval explícito de quem chama.
    if (!actor) return responder({ error: 'Este actor não está no registro.', code: 'actor_not_registered' }, 404)
    if (actor.state === 'out') return responder({ error: 'Este actor está fora do ar.', code: 'actor_out' }, 403)
    if (actor.state === 'testing' && corpo.allowTesting !== true) {
      return responder({ error: 'Este actor ainda está em teste.', code: 'actor_testing' }, 403)
    }

    // O teto nunca passa do que o registro permite, por mais que quem chama peça.
    const teto = Math.min(actor.maxCostUsd, tetoPedido)
    let execucao: Execucao
    try {
      execucao = await deps.apify.run({ actorId, input: entrada, maxItems: maxItens, maxTotalChargeUsd: teto })
    } catch (error) {
      const codigo = error instanceof ApifyTimeoutError
        ? 'timeout'
        : error instanceof ApifyRequestError
        ? `apify_http_${error.status}`
        : 'apify_unreachable'
      log({ type: 'signal_scan', workspaceId, actorId, outcome: 'failed', errorCode: codigo })
      return responder(
        { error: codigo === 'timeout' ? 'O Apify não respondeu a tempo.' : 'O Apify não conseguiu rodar o actor.', code: codigo },
        codigo === 'timeout' ? 504 : 502,
      )
    }

    // O custo real, só para medir: se não der para ler ou gravar, os itens já existem e seguem para quem chamou.
    const runId = await gravarCustoDaExecucao(
      {
        custoDaExecucao: deps.apify.custoDaExecucao?.bind(deps.apify),
        gravar: (args) => deps.db.recordCost(args),
        aoFalhar: (error) => log({ type: 'signal_scan', workspaceId, actorId, outcome: 'cost_failed', message: String(error) }),
      },
      { workspaceId, actorId, runId: execucao.runId, items: execucao.items.length, prefixo: 'signal-scan' },
    )
    log({ type: 'signal_scan', workspaceId, actorId, outcome: 'succeeded', items: execucao.items.length })
    return responder({ runId, actorVersion: actor.version, items: execucao.items })
  }
}
