// A varredura automática de Sinais (sinais-reais, ticket 02): o relógio do banco chama esta função; ela reivindica os
// Monitoramentos vencidos e, Conta por Conta, abre a varredura no banco (que reserva 1 crédito e confere o teto da
// varredura automática), roda o actor do Sinal, grava os Sinais que o adaptador do tipo tira do resultado e fecha a
// varredura (concluída, debita; falha, solta a reserva e devolve o teto). Sem teto, sem crédito ou com o automático em
// confirmar, ela para e diz por quê no Monitoramento. Um adaptador por tipo de Sinal traduz a entrada do actor e o
// resultado dele (tickets 03 a 06 entregam um por família); sem adaptador, o Monitoramento espera. Banco, Apify e
// relógio entram por injeção, para o teste ir do token à resposta sem rede.
import { gravarCustoDaExecucao } from '../_shared/apify-ambiente.ts'
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
  /** Quem criou o Monitoramento e ainda participa do Workspace; nulo quando saiu. */
  createdBy: string | null
  /** A hora marcada da rodada: com o Monitoramento e a Conta, identifica a cobrança, então repetir a rodada não cobra de novo. */
  slot: string
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

/**
 * O que o banco manda fazer com a Conta: `go` e `resume` varrem; `done` (já concluída nesta rodada) e `skip` (já falhou
 * nesta rodada) não; `no_credits` para o Monitoramento por falta de saldo ou de limite; `confirmar`, `sem_teto` e
 * `teto_atingido` param o Monitoramento porque o automático não roda.
 */
export type ResultadoDaAbertura =
  | 'go' | 'resume' | 'done' | 'skip' | 'no_credits' | 'confirmar' | 'sem_teto' | 'teto_atingido'

export interface Db {
  tokenMatches(token: string): Promise<boolean>
  claim(limit: number): Promise<MonitorReivindicado[]>
  actorForType(signalType: string): Promise<ActorDoRegistro | null>
  /** begin_account_scan: reserva o crédito e confere o teto, de uma vez e sem deixar rastro quando recusa. */
  beginScan(args: { workspaceId: string; userId: string | null; monitorId: string; accountId: string; slot: string }): Promise<{
    outcome: ResultadoDaAbertura
    reservationId: string | null
  }>
  /** end_account_scan: concluída, debita o crédito; falha, solta a reserva e devolve o teto. */
  endScan(reservationId: string, success: boolean): Promise<void>
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
  /** finish_signal_monitor_run: `attempted` são as Contas que a rodada tentou (a rotação avança por elas); `continuar` pede a próxima rodada já. */
  finish(monitorId: string, attempted: number, error: string | null, continuar: boolean): Promise<void>
}

export interface Deps {
  db: Db
  apify: Apify
  adaptadores: Record<string, AdaptadorDeSinal>
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const MONITORES_POR_CHAMADA = 5
// O tempo da Edge Function é de 150 s. Uma Conta nova só começa até este prazo; o cliente do Apify desta função espera no
// máximo 70 s por Conta (index.ts), então a última termina antes do limite. O que faltar fica para a rodada seguinte.
const PRAZO_PARA_COMECAR_EM_MS = 75_000
// Um Sinal com disparo até um dia no futuro vira "agora" (relógios e fusos); mais que isso, ou uma data ilegível, é descartado.
const TOLERANCIA_DE_DATA_EM_MS = 24 * 60 * 60 * 1000

const MOTIVO_DA_PARADA: Record<'no_credits' | 'confirmar' | 'sem_teto' | 'teto_atingido', string> = {
  no_credits: 'Sem créditos ou no limite mensal do participante: a varredura espera.',
  confirmar:
    'A varredura automática está em "confirmar". Ligue o automático com um teto em Configurações › Automação e tetos.',
  sem_teto: 'A varredura automática não roda sem um teto mensal aprovado (Configurações › Automação e tetos).',
  teto_atingido: 'O teto mensal da varredura automática foi atingido; ela volta no próximo mês ou quando o teto subir.',
}

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Os Sinais do adaptador com a data conferida; o que não tem data legível ou está muito no futuro não entra. */
function sinaisComDataValida(sinais: SinalDoAdaptador[], agora: number): SinalDoAdaptador[] {
  return sinais.flatMap((s) => {
    const disparo = Date.parse(s.firedAt)
    if (Number.isNaN(disparo) || disparo > agora + TOLERANCIA_DE_DATA_EM_MS) return []
    return [disparo > agora ? { ...s, firedAt: new Date(agora).toISOString() } : s]
  })
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const agora = deps.agora ?? (() => Date.now())

  /** Varre uma Conta já aberta no banco. Devolve quantos Sinais achou; lança quando a varredura não pôde concluir. */
  async function varrerConta(
    m: MonitorReivindicado,
    conta: ContaParaVarrer,
    adaptador: AdaptadorDeSinal,
    actor: ActorDoRegistro,
  ): Promise<number> {
    const { input, maxItems } = adaptador.entrada(conta, m.criteria)
    const execucao = await deps.apify.run({ actorId: actor.actorId, input, maxItems, maxTotalChargeUsd: actor.maxCostUsd })
    const encontrados = sinaisComDataValida(adaptador.sinais(execucao.items, conta), agora())
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
    await gravarCustoDaExecucao(
      {
        custoDaExecucao: deps.apify.custoDaExecucao?.bind(deps.apify),
        gravar: (args) => deps.db.recordCost(args),
        aoFalhar: (erro) => log({ type: 'signal_runner', monitorId: m.monitorId, outcome: 'cost_failed', message: String(erro) }),
      },
      { workspaceId: m.workspaceId, actorId: actor.actorId, runId: execucao.runId, items: execucao.items.length, prefixo: 'signal-runner' },
    )
    return encontrados.length
  }

  async function varrerMonitor(m: MonitorReivindicado, prazo: number): Promise<{ scanned: number; signals: number }> {
    // O tempo já acabou nos Monitoramentos anteriores: este nem começa; solta a reserva e volta já.
    if (agora() > prazo) {
      await deps.db.finish(m.monitorId, 0, null, true)
      return { scanned: 0, signals: 0 }
    }
    const adaptador = deps.adaptadores[m.signalType]
    if (!adaptador) {
      await deps.db.finish(m.monitorId, 0, `Ainda não há adaptador para o Sinal ${m.signalType}.`, false)
      return { scanned: 0, signals: 0 }
    }
    const actor = await deps.db.actorForType(m.signalType)
    if (!actor || actor.state !== 'available') {
      await deps.db.finish(m.monitorId, 0, 'O actor deste Sinal não está disponível.', false)
      return { scanned: 0, signals: 0 }
    }

    let tentadas = 0
    let varridas = 0
    let sinais = 0
    let erro: string | null = null
    let continuar = false
    const falhas: string[] = []
    for (const conta of m.accounts) {
      if (agora() > prazo) {
        erro = `Varridas ${varridas} de ${m.accounts.length} Contas; o resto na próxima rodada.`
        continuar = true
        break
      }
      const { outcome, reservationId } = await deps.db.beginScan({
        workspaceId: m.workspaceId,
        userId: m.createdBy,
        monitorId: m.monitorId,
        accountId: conta.id,
        slot: m.slot,
      })
      if (outcome === 'done' || outcome === 'skip') {
        tentadas++
        continue
      }
      if (outcome !== 'go' && outcome !== 'resume') {
        erro = MOTIVO_DA_PARADA[outcome]
        break
      }
      tentadas++
      try {
        sinais += await varrerConta(m, conta, adaptador, actor)
        await deps.db.endScan(reservationId!, true)
        varridas++
      } catch (e) {
        // A Conta que não pôde ser varrida não é cobrada e devolve o teto; as outras seguem.
        await deps.db.endScan(reservationId!, false).catch((f) =>
          log({ type: 'signal_runner', monitorId: m.monitorId, outcome: 'end_failed', message: String(f) }))
        falhas.push(conta.name)
        log({ type: 'signal_runner', monitorId: m.monitorId, accountId: conta.id, outcome: 'account_failed', message: String(e) })
      }
    }
    if (falhas.length) erro = [erro, `Não foi possível varrer: ${falhas.join(', ')}.`].filter(Boolean).join(' ')
    await deps.db.finish(m.monitorId, tentadas, erro, continuar)
    return { scanned: varridas, signals: sinais }
  }

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)
    if (!(await deps.db.tokenMatches(req.headers.get('x-runner-token') ?? ''))) {
      return responder({ error: 'Não autorizado.' }, 401)
    }
    const prazo = agora() + PRAZO_PARA_COMECAR_EM_MS
    const monitores = await deps.db.claim(MONITORES_POR_CHAMADA)
    let scanned = 0
    let signals = 0
    for (const m of monitores) {
      try {
        const r = await varrerMonitor(m, prazo)
        scanned += r.scanned
        signals += r.signals
      } catch (e) {
        log({ type: 'signal_runner', monitorId: m.monitorId, outcome: 'monitor_failed', message: String(e) })
        await deps.db.finish(m.monitorId, 0, 'A rodada falhou; tentamos de novo na próxima.', false).catch(() => {})
      }
    }
    log({ type: 'signal_runner', outcome: 'done', monitors: monitores.length, scanned, signals })
    return responder({ monitors: monitores.length, scanned, signals })
  }
}
