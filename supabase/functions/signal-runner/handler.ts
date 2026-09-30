// O Executor de Sinais (sinais-reais, ticket 02): o relógio do banco chama esta função; ela reivindica os Monitoramentos
// vencidos e, Conta por Conta, reserva 1 crédito, roda o actor do Sinal, grava os Sinais que o adaptador do tipo tira do
// resultado e liquida o crédito. A varredura é automática, então só roda dentro do teto aprovado em "Automação e tetos"
// (`acao:varredura`); sem teto, sem crédito ou com o automático em confirmar, ela para e diz por quê no Monitoramento.
// Um adaptador por tipo de Sinal traduz a entrada do actor e o resultado dele (tickets 03 a 06 entregam um por família);
// sem adaptador, o Monitoramento espera. Banco, Apify e relógio entram por injeção, para o teste ir do token à resposta
// sem rede.
import type { Apify, ActorDoRegistro } from '../signal-scan/handler.ts'

export interface ContaParaVarrer {
  id: string
  name: string
  domain: string | null
  linkedinUrl: string | null
}

export interface MonitorReivindicado {
  monitorId: string
  workspaceId: string
  signalType: string
  criteria: Record<string, unknown>
  createdBy: string | null
  accounts: ContaParaVarrer[]
}

export interface SinalDoAdaptador {
  /** A chave do acontecimento: o mesmo acontecimento tem sempre a mesma chave (empresa + cargo + data da vaga, por ex.). */
  eventKey: string
  phrase: string
  /** ISO 8601 do disparo (não da varredura). */
  firedAt: string
  source?: string
  evidence?: string
}

/** O que sabe falar com o actor de um tipo de Sinal: monta a entrada e lê o resultado. */
export interface AdaptadorDeSinal {
  signalType: string
  entrada(conta: ContaParaVarrer, criterios: Record<string, unknown>): { input: Record<string, unknown>; maxItems: number }
  sinais(itens: unknown[], conta: ContaParaVarrer): SinalDoAdaptador[]
}

export type ResultadoDoTeto = 'ok' | 'confirmar' | 'sem_teto' | 'teto_atingido'

/** Sem saldo de créditos, ou no limite mensal do participante. */
export class SemCreditos extends Error {
  constructor() {
    super('Sem créditos disponíveis')
    this.name = 'SemCreditos'
  }
}

export interface Db {
  tokenMatches(token: string): Promise<boolean>
  claim(limit: number): Promise<MonitorReivindicado[]>
  actorForType(signalType: string): Promise<ActorDoRegistro | null>
  /** reserve_credits: lança SemCreditos quando o saldo ou o limite não cobrem. */
  reserve(args: { workspaceId: string; userId: string | null; action: 'account_scan'; actionKey: string; quantity: number }): Promise<string>
  settle(reservationId: string): Promise<void>
  release(reservationId: string): Promise<void>
  consumeCap(workspaceId: string, scope: string, amount: number): Promise<ResultadoDoTeto>
  recordSignal(args: {
    workspaceId: string
    accountId: string
    monitorId: string
    signalType: string
    eventKey: string
    phrase: string
    firedAt: string
    source: string | null
    evidence: string | null
  }): Promise<boolean>
  recordCost(args: { workspaceId: string; actorId: string; runId: string; items: number; costUsd: number | null }): Promise<void>
  finish(monitorId: string, scanned: number, error: string | null): Promise<void>
}

export interface Deps {
  db: Db
  apify: Apify
  adaptadores: Record<string, AdaptadorDeSinal>
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const MONITORES_POR_CHAMADA = 5
// A Edge Function tem um tempo total: passado este prazo, o que falta fica para a próxima rodada.
const PRAZO_EM_MS = 110_000

const RECUSA_DO_TETO: Record<Exclude<ResultadoDoTeto, 'ok'>, string> = {
  confirmar:
    'A varredura automática está em "confirmar". Ligue o automático com um teto em Configurações › Automação e tetos.',
  sem_teto: 'A varredura automática não roda sem um teto mensal aprovado (Configurações › Automação e tetos).',
  teto_atingido: 'O teto mensal da varredura automática foi atingido; ela volta no próximo mês ou quando o teto subir.',
}

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const agora = deps.agora ?? (() => Date.now())

  async function rodar(m: MonitorReivindicado, prazo: number): Promise<{ scanned: number; signals: number }> {
    const adaptador = deps.adaptadores[m.signalType]
    if (!adaptador) {
      await deps.db.finish(m.monitorId, 0, `Ainda não há adaptador para o Sinal ${m.signalType}.`)
      return { scanned: 0, signals: 0 }
    }
    const actor = await deps.db.actorForType(m.signalType)
    if (!actor || actor.state !== 'available') {
      await deps.db.finish(m.monitorId, 0, 'O actor deste Sinal não está disponível.')
      return { scanned: 0, signals: 0 }
    }

    let scanned = 0
    let signals = 0
    let erro: string | null = null
    const falhas: string[] = []
    const hora = new Date(agora()).toISOString().slice(0, 13)
    for (const conta of m.accounts) {
      if (agora() > prazo) {
        erro = `Varridas ${scanned} de ${m.accounts.length} Contas; o resto na próxima rodada.`
        break
      }
      let reserva: string
      try {
        reserva = await deps.db.reserve({
          workspaceId: m.workspaceId,
          userId: m.createdBy,
          action: 'account_scan',
          actionKey: `scan:${m.monitorId}:${conta.id}:${hora}`,
          quantity: 1,
        })
      } catch (e) {
        if (!(e instanceof SemCreditos)) throw e
        erro = 'Sem créditos ou no limite mensal do participante: a varredura espera.'
        break
      }
      const teto = await deps.db.consumeCap(m.workspaceId, 'acao:varredura', 1)
      if (teto !== 'ok') {
        await deps.db.release(reserva)
        erro = RECUSA_DO_TETO[teto]
        break
      }

      try {
        const { input, maxItems } = adaptador.entrada(conta, m.criteria)
        const exec = await deps.apify.run({ actorId: actor.actorId, input, maxItems, maxTotalChargeUsd: actor.maxCostUsd })
        const encontrados = adaptador.sinais(exec.items, conta)
        for (const s of encontrados) {
          await deps.db.recordSignal({
            workspaceId: m.workspaceId,
            accountId: conta.id,
            monitorId: m.monitorId,
            signalType: m.signalType,
            eventKey: s.eventKey,
            phrase: s.phrase,
            firedAt: s.firedAt,
            source: s.source ?? null,
            evidence: s.evidence ?? null,
          })
        }
        await deps.db.settle(reserva)
        signals += encontrados.length
        scanned++
        await gravarCusto(m, actor, exec)
      } catch (e) {
        // A Conta que não pôde ser varrida não é cobrada; as outras seguem.
        await deps.db.release(reserva)
        falhas.push(conta.name)
        log({ type: 'signal_runner', monitorId: m.monitorId, accountId: conta.id, outcome: 'account_failed', message: String(e) })
      }
    }
    if (falhas.length) erro = [erro, `Não foi possível varrer: ${falhas.join(', ')}.`].filter(Boolean).join(' ')
    await deps.db.finish(m.monitorId, scanned, erro)
    return { scanned, signals }
  }

  async function gravarCusto(m: MonitorReivindicado, actor: ActorDoRegistro, exec: { runId: string | null; items: unknown[] }) {
    try {
      const costUsd = exec.runId ? ((await deps.apify.custoDaExecucao?.(exec.runId)) ?? null) : null
      await deps.db.recordCost({
        workspaceId: m.workspaceId,
        actorId: actor.actorId,
        runId: exec.runId ?? `signal-runner:${crypto.randomUUID()}`,
        items: exec.items.length,
        costUsd,
      })
    } catch (e) {
      log({ type: 'signal_runner', monitorId: m.monitorId, outcome: 'cost_failed', message: String(e) })
    }
  }

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)
    if (!(await deps.db.tokenMatches(req.headers.get('x-runner-token') ?? ''))) {
      return responder({ error: 'Não autorizado.' }, 401)
    }
    const prazo = agora() + PRAZO_EM_MS
    const monitores = await deps.db.claim(MONITORES_POR_CHAMADA)
    let scanned = 0
    let signals = 0
    for (const m of monitores) {
      try {
        const r = await rodar(m, prazo)
        scanned += r.scanned
        signals += r.signals
      } catch (e) {
        log({ type: 'signal_runner', monitorId: m.monitorId, outcome: 'monitor_failed', message: String(e) })
        await deps.db.finish(m.monitorId, 0, 'A rodada falhou; tentamos de novo na próxima.').catch(() => {})
      }
    }
    log({ type: 'signal_runner', outcome: 'done', monitors: monitores.length, scanned, signals })
    return responder({ monitors: monitores.length, scanned, signals })
  }
}
