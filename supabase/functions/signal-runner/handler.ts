// A varredura automática de Sinais (sinais-reais, ticket 02): o relógio do banco chama esta função; ela reivindica os
// Monitoramentos vencidos e, Conta por Conta, abre a varredura no banco (que reserva 1 crédito e confere o teto da
// varredura automática), roda o actor do Sinal, grava os Sinais que o adaptador do tipo tira do resultado e fecha a
// varredura (concluída, debita; falha, solta a reserva e devolve o teto). Sem teto, sem crédito ou com o automático em
// confirmar, ela para e diz por quê no Monitoramento. Um adaptador por tipo de Sinal traduz a entrada do actor e o
// resultado dele (tickets 03 a 06 entregam um por família); sem adaptador, o Monitoramento espera. A mesma volta cuida da
// fila de buscas da reativação (ticket 08): a busca do clique numa Conta e a mensal automática varrem uma Conta com todos
// os Monitoramentos ativos do Workspace, e vêm antes dos Monitoramentos do relógio. Banco, Apify e relógio entram por
// injeção, para o teste ir do token à resposta sem rede.
import { gravarCustoDaExecucao } from '../_shared/apify-ambiente.ts'
import type { Apify, ActorDoRegistro } from '../signal-scan/handler.ts'

export interface ContaParaVarrer {
  id: string
  name: string
  domain: string | null
  linkedinUrl: string | null
  /** O LinkedIn dos Contatos vinculados à Conta (sinais-reais 04); só vem quem tem LinkedIn. */
  contatos?: { id: string; linkedinUrl: string }[]
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

/**
 * O que sabe falar com o actor de um tipo de Sinal: monta a entrada e lê o resultado. `entrada` lança
 * `SemDadoParaVarrer` quando falta à Conta o que o actor precisa (a página do LinkedIn, por ex.): a Conta é pulada sem
 * reservar crédito. As duas recebem a hora da varredura (os filtros de data da busca e do resultado); `sinais` também
 * recebe os critérios do Monitoramento, para filtrar o que o actor não filtra.
 */
export interface AdaptadorDeSinal {
  signalType: string
  entrada(conta: ContaParaVarrer, criterios: Record<string, unknown>, agora: number): { input: Record<string, unknown>; maxItems: number }
  sinais(itens: unknown[], conta: ContaParaVarrer, criterios: Record<string, unknown>, agora: number): SinalDoAdaptador[]
}

/** Falta à Conta o dado que o actor precisa; a mensagem diz qual, em palavras do produto. */
export class SemDadoParaVarrer extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'SemDadoParaVarrer'
  }
}

type Entrada = ReturnType<AdaptadorDeSinal['entrada']>

/** A entrada do actor, ou o motivo de a Conta não poder ser varrida. Um adaptador quebrado ainda lança. */
function montarEntrada(
  adaptador: AdaptadorDeSinal,
  conta: ContaParaVarrer,
  criterios: Record<string, unknown>,
  agora: number,
): Entrada | SemDadoParaVarrer {
  try {
    return adaptador.entrada(conta, criterios, agora)
  } catch (e) {
    if (e instanceof SemDadoParaVarrer) return e
    throw e
  }
}

/**
 * O que o banco manda fazer com a Conta: `go` e `resume` varrem; `done` (já concluída nesta rodada) e `skip` (já falhou
 * nesta rodada) não; `no_credits` para o Monitoramento por falta de saldo ou de limite; `confirmar`, `sem_teto` e
 * `teto_atingido` param o Monitoramento porque o automático não roda.
 */
export type MotivoDeParada = 'no_credits' | 'confirmar' | 'sem_teto' | 'teto_atingido'
export type ResultadoDaAbertura = 'go' | 'resume' | 'done' | 'skip' | MotivoDeParada

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

/** Uma busca da fila (reativação de Sinais): varre uma Conta com os Monitoramentos ativos do Workspace. */
export interface BuscaReivindicada {
  rescanId: string
  workspaceId: string
  /** `manual` é o clique na Conta; `mensal` é a reativação automática, que gasta do teto da varredura. */
  origin: 'manual' | 'mensal'
  /** Quem pediu e ainda participa do Workspace; nulo na mensal e quando saiu. */
  requestedBy: string | null
  /** A hora do pedido: com a busca e o Monitoramento, identifica a cobrança, então repetir a volta não cobra de novo. */
  requestedAt: string
  account: ContaParaVarrer
  monitors: { monitorId: string; signalType: string; criteria: Record<string, unknown> }[]
}

/** A fila de buscas no banco: reivindicar, abrir a varredura de cada Monitoramento e fechar a volta. */
export interface Buscas {
  claim(limit: number): Promise<BuscaReivindicada[]>
  /** begin_rescan_scan: reserva o crédito (e o teto, na mensal) de uma varredura da busca. */
  beginScan(args: { rescanId: string; monitorId: string }): Promise<{ outcome: ResultadoDaAbertura; reservationId: string | null }>
  /** end_rescan_scan: concluída, debita o crédito; falha, solta a reserva e devolve o teto da busca mensal. */
  endScan(rescanId: string, reservationId: string, success: boolean): Promise<void>
  /** finish_signal_rescan: `pending` solta a reserva e continua depois; `done` e `stopped` encerram. */
  finish(rescanId: string, state: 'pending' | 'done' | 'stopped', scanned: number, error: string | null): Promise<void>
  /** stop_workspace_rescans: para as buscas mensais pendentes do Workspace (o teto ou o saldo acabou). */
  stopWorkspace(workspaceId: string, error: string): Promise<number>
  /** Chama o relógio de novo: ainda há busca esperando. */
  kick(): Promise<void>
}

export interface Deps {
  db: Db
  apify: Apify
  adaptadores: Record<string, AdaptadorDeSinal>
  /** A fila de buscas; sem ela, a função cuida só dos Monitoramentos. */
  buscas?: Buscas
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const MONITORES_POR_CHAMADA = 5
const BUSCAS_POR_CHAMADA = 5
// O tempo da Edge Function é de 150 s. Uma Conta nova só começa até este prazo; o cliente do Apify desta função espera no
// máximo 70 s por Conta (index.ts), então a última termina antes do limite. O que faltar fica para a rodada seguinte.
const PRAZO_PARA_COMECAR_EM_MS = 75_000
// Um Sinal com disparo até um dia no futuro vira "agora" (relógios e fusos); mais que isso, ou uma data ilegível, é descartado.
const TOLERANCIA_DE_DATA_EM_MS = 24 * 60 * 60 * 1000

const MOTIVO_DA_PARADA: Record<MotivoDeParada, string> = {
  no_credits: 'Sem créditos ou no limite mensal do participante: a varredura espera.',
  confirmar:
    'A varredura automática está em "confirmar". Ligue o automático com um teto em Configurações › Automação e tetos.',
  sem_teto: 'A varredura automática não roda sem um teto mensal aprovado (Configurações › Automação e tetos).',
  teto_atingido: 'O teto mensal da varredura automática foi atingido; ela volta no próximo mês ou quando o teto subir.',
}

// A busca do clique fala com quem pediu; a mensal, com o teto. O saldo e o limite mensal são de quem pediu.
const MOTIVO_DA_BUSCA_PARADA: Record<MotivoDeParada, string> = {
  ...MOTIVO_DA_PARADA,
  no_credits: 'Sem créditos ou no limite mensal de quem pediu: a busca parou.',
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
    m: Pick<MonitorReivindicado, 'monitorId' | 'workspaceId' | 'signalType' | 'criteria'>,
    conta: ContaParaVarrer,
    adaptador: AdaptadorDeSinal,
    actor: ActorDoRegistro,
    { input, maxItems }: Entrada,
  ): Promise<number> {
    const execucao = await deps.apify.run({ actorId: actor.actorId, input, maxItems, maxTotalChargeUsd: actor.maxCostUsd })
    const encontrados = sinaisComDataValida(adaptador.sinais(execucao.items, conta, m.criteria, agora()), agora())
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
    const semDado = new Map<string, string[]>()
    for (const conta of m.accounts) {
      if (agora() > prazo) {
        erro = `Varridas ${varridas} de ${m.accounts.length} Contas; o resto na próxima rodada.`
        continuar = true
        break
      }
      // A Conta sem o dado que o actor precisa não abre varredura: nada é reservado nem cobrado. Um adaptador que quebra
      // na entrada é falha só desta Conta.
      let entrada: Entrada | SemDadoParaVarrer
      try {
        entrada = montarEntrada(adaptador, conta, m.criteria, agora())
      } catch (e) {
        tentadas++
        falhas.push(conta.name)
        log({ type: 'signal_runner', monitorId: m.monitorId, accountId: conta.id, outcome: 'input_failed', message: String(e) })
        continue
      }
      if (entrada instanceof SemDadoParaVarrer) {
        tentadas++
        semDado.set(entrada.message, [...(semDado.get(entrada.message) ?? []), conta.name])
        continue
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
        sinais += await varrerConta(m, conta, adaptador, actor, entrada)
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
    const avisos = [...semDado].map(([motivo, contas]) => `${motivo}: ${contas.join(', ')}.`)
    if (falhas.length) avisos.push(`Não foi possível varrer: ${falhas.join(', ')}.`)
    if (avisos.length) erro = [erro, ...avisos].filter(Boolean).join(' ')
    await deps.db.finish(m.monitorId, tentadas, erro, continuar)
    return { scanned: varridas, signals: sinais }
  }

  /**
   * Uma busca: varre a Conta com cada Monitoramento ativo do Workspace, mesmo que ela não esteja no público dele. A
   * varredura que falha não é cobrada e não derruba as outras. Devolve o que varreu e se a busca voltou à fila
   * (o tempo da função acabou no meio).
   */
  async function varrerBusca(b: BuscaReivindicada, buscas: Buscas, prazo: number): Promise<{ scanned: number; signals: number; voltou: boolean }> {
    let varridas = 0
    let sinais = 0
    let falhas = 0
    let tentadas = 0
    let semAdaptador = 0
    let semActor = 0
    const semDado = new Set<string>()
    let acabouOTempo = false
    let parou: MotivoDeParada | null = null
    for (const m of b.monitors) {
      if (agora() > prazo) {
        acabouOTempo = true
        break
      }
      const adaptador = deps.adaptadores[m.signalType]
      if (!adaptador) {
        semAdaptador++
        continue
      }
      const actor = await deps.db.actorForType(m.signalType)
      if (!actor || actor.state !== 'available') {
        semActor++
        continue
      }
      let entrada: Entrada | SemDadoParaVarrer
      try {
        entrada = montarEntrada(adaptador, b.account, m.criteria, agora())
      } catch (e) {
        tentadas++
        falhas++
        log({ type: 'signal_runner', rescanId: b.rescanId, monitorId: m.monitorId, outcome: 'input_failed', message: String(e) })
        continue
      }
      if (entrada instanceof SemDadoParaVarrer) {
        semDado.add(entrada.message)
        continue
      }
      const { outcome, reservationId } = await buscas.beginScan({ rescanId: b.rescanId, monitorId: m.monitorId })
      if (outcome === 'done' || outcome === 'skip') {
        tentadas++
        continue
      }
      if (outcome !== 'go' && outcome !== 'resume') {
        parou = outcome
        break
      }
      tentadas++
      try {
        sinais += await varrerConta({ ...m, workspaceId: b.workspaceId }, b.account, adaptador, actor, entrada)
        await buscas.endScan(b.rescanId, reservationId!, true)
        varridas++
      } catch (e) {
        await buscas.endScan(b.rescanId, reservationId!, false).catch((f) =>
          log({ type: 'signal_runner', rescanId: b.rescanId, outcome: 'end_failed', message: String(f) }))
        falhas++
        log({ type: 'signal_runner', rescanId: b.rescanId, monitorId: m.monitorId, outcome: 'rescan_scan_failed', message: String(e) })
      }
    }

    if (acabouOTempo) {
      await buscas.finish(b.rescanId, 'pending', varridas, `Varridos ${varridas} de ${b.monitors.length} Monitoramentos; o resto na próxima rodada.`)
      return { scanned: varridas, signals: sinais, voltou: true }
    }
    if (parou) {
      const motivo = MOTIVO_DA_BUSCA_PARADA[parou]
      await buscas.finish(b.rescanId, 'stopped', varridas, motivo)
      // Sem teto ou sem saldo, as outras buscas mensais do Workspace também não rodam: param de uma vez.
      if (b.origin === 'mensal') await buscas.stopWorkspace(b.workspaceId, motivo)
      return { scanned: varridas, signals: sinais, voltou: false }
    }
    if (tentadas === 0) {
      const motivo = semDado.size > 0
        ? `${[...semDado].join('; ')}.`
        : semAdaptador > 0
        ? 'Ainda não há adaptador para os Sinais dos Monitoramentos ativos.'
        : semActor > 0
        ? 'O actor do Sinal dos Monitoramentos ativos não está disponível.'
        : 'Nenhum Monitoramento ativo para buscar.'
      await buscas.finish(b.rescanId, 'stopped', 0, motivo)
      return { scanned: 0, signals: 0, voltou: false }
    }
    // Nada foi varrido e tudo falhou: não conta como Conta revisitada, então a mensal tenta de novo.
    const estado = varridas === 0 && falhas > 0 ? 'stopped' : 'done'
    const erro = falhas === 0 ? null : `${falhas === 1 ? '1 varredura falhou' : `${falhas} varreduras falharam`}; tente de novo mais tarde.`
    await buscas.finish(b.rescanId, estado, varridas, erro)
    return { scanned: varridas, signals: sinais, voltou: false }
  }

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)
    if (!(await deps.db.tokenMatches(req.headers.get('x-runner-token') ?? ''))) {
      return responder({ error: 'Não autorizado.' }, 401)
    }
    const prazo = agora() + PRAZO_PARA_COMECAR_EM_MS
    // As buscas primeiro: quem clicou está esperando; os Monitoramentos do relógio podem esperar a próxima volta.
    const totalDasBuscas = { count: 0, scanned: 0, signals: 0 }
    let algumaVoltou = false
    if (deps.buscas) {
      try {
        const fila = await deps.buscas.claim(BUSCAS_POR_CHAMADA)
        for (const b of fila) {
          totalDasBuscas.count++
          try {
            const r = await varrerBusca(b, deps.buscas, prazo)
            totalDasBuscas.scanned += r.scanned
            totalDasBuscas.signals += r.signals
            algumaVoltou ||= r.voltou
          } catch (e) {
            log({ type: 'signal_runner', rescanId: b.rescanId, outcome: 'rescan_failed', message: String(e) })
            await deps.buscas.finish(b.rescanId, 'pending', 0, 'A busca falhou; tentamos de novo na próxima.').catch(() => {})
          }
        }
      } catch (e) {
        log({ type: 'signal_runner', outcome: 'rescan_claim_failed', message: String(e) })
      }
    }
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
    log({ type: 'signal_runner', outcome: 'done', monitors: monitores.length, scanned, signals, rescans: totalDasBuscas.count })
    // Uma busca que voltou à fila espera o relógio; chamá-lo já poupa 10 minutos a quem clicou.
    if (algumaVoltou) await deps.buscas?.kick().catch((e) => log({ type: 'signal_runner', outcome: 'kick_failed', message: String(e) }))
    return responder(
      deps.buscas ? { monitors: monitores.length, scanned, signals, rescans: totalDasBuscas } : { monitors: monitores.length, scanned, signals },
    )
  }
}
