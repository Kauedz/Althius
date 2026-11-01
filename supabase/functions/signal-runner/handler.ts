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
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import { CASCATA_DO_MERCADO, CREDITOS_POR_RODADA_NO_MERCADO } from '../_shared/cascata-de-sinais/passos/vagas-mercado.ts'
import type { Apify, ActorDoRegistro } from '../signal-scan/handler.ts'

export interface ContaParaVarrer {
  id: string
  name: string
  domain: string | null
  linkedinUrl: string | null
  /** O CNPJ da Conta, quando o Workspace o tem (a cascata de Sinais consulta a Receita por ele). */
  cnpj?: string | null
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
  /**
   * Para o Sinal que compara com a leitura anterior ou classifica texto (PR-8): o mesmo papel de `sinais`, com o contexto
   * do Workspace. Quando a função tem o contexto, é este que roda; sem ele, `sinais`.
   */
  sinaisComContexto?(
    itens: unknown[],
    conta: ContaParaVarrer,
    criterios: Record<string, unknown>,
    agora: number,
    ctx: ContextoDoAdaptador,
  ): Promise<SinalDoAdaptador[]>
}

/** Uma foto de headcount de uma Conta (PR-8): a contagem que a página da empresa informa, nunca dado de pessoa. */
export interface FotoDeHeadcount {
  takenOn: string
  headcount: number
}

/** O que um adaptador com estado vê do Workspace (PR-8). */
export interface ContextoDoAdaptador {
  workspaceId: string
  headcount: {
    /** A foto mais antiga da Conta desde `desde` (AAAA-MM-DD) e antes de `antesDe`, ou nada. */
    base(accountId: string, desde: string, antesDe: string): Promise<FotoDeHeadcount | null>
    gravar(accountId: string, foto: FotoDeHeadcount, fonte: string): Promise<void>
  }
  /** Quantas vagas da Conta (Sinais de vaga) foram vistas desde a data ISO. */
  vagasAbertas(accountId: string, desdeIso: string): Promise<number>
  /** O modelo de linguagem dos Sinais, quando ligado (`SIGNALS_LLM_PROVIDER`); sem ele, a regra de palavra-chave. */
  llm?: { json(a: { sistema: string; usuario: string; maxTokens?: number }): Promise<{ json: unknown; custoUsd: number }> }
  /** O custo em dólar gasto fora do actor (o modelo); vai para `action_costs` junto com a execução. */
  custo: { adicionar(usd: number, itens: number): void }
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
export type MotivoDeParada = 'no_credits' | 'confirmar' | 'sem_teto' | 'teto_atingido' | 'contrato_inativo'
export type ResultadoDaAbertura = 'go' | 'resume' | 'done' | 'skip' | MotivoDeParada

/**
 * Workspace ilimitado com reserva já feita: confirmar, sem teto e teto atingido não param a varredura.
 * contrato_inativo continua parando: o ilimitado não recebe esse desfecho do banco.
 * Sem reserva, o desfecho segue como veio (a recusa não deixou o que liquidar).
 */
export function outcomeEfetivo(outcome: ResultadoDaAbertura, ilimitado: boolean, temReserva: boolean): ResultadoDaAbertura {
  if (ilimitado && temReserva && (outcome === 'confirmar' || outcome === 'sem_teto' || outcome === 'teto_atingido')) return 'go'
  return outcome
}

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
  /** Créditos ilimitados neste Workspace. Ausente, ou falha de leitura, trata como limitado. */
  creditsUnlimited?(workspaceId: string): Promise<boolean>
  /** As fotos de headcount (PR-8). Sem elas, os adaptadores com contexto não rodam com estado. */
  headcountBase?(workspaceId: string, accountId: string, desde: string, antesDe: string): Promise<FotoDeHeadcount | null>
  recordHeadcount?(workspaceId: string, accountId: string, foto: FotoDeHeadcount, fonte: string): Promise<void>
  /** Quantos Sinais de vaga a Conta teve desde a data (PR-8). */
  countJobSignals?(workspaceId: string, accountId: string, desdeIso: string): Promise<number>
  /**
   * O escopo do público do Monitoramento (`signal_monitor_scope`): 'contas', o de sempre, ou 'mercado', a descoberta no
   * mercado endereçável. Sem este método, todo Monitoramento é de Contas-alvo.
   */
  escopo?(monitorId: string): Promise<'contas' | 'mercado'>
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

/**
 * O motor de cascata de Sinais (um Sinal = uma cascata de passos, sinais em cascata): o Monitoramento de um tipo de Sinal
 * que é cascata roda uma vez por rodada, pelo MESMO motor da conversa do Hermes, e não pelo caminho de uma varredura por
 * Conta com adaptador. A reserva do crédito, o teto e o rastro dos passos são do motor.
 */
export interface Cascatas {
  ehCascata(signalType: string): Promise<boolean>
  rodar(pedido: PedidoDeCascata): Promise<ResultadoDaCascata>
  /**
   * O plano do Monitoramento de um tipo genérico do catálogo (novo escritório, expansão geográfica...), que as cascatas do
   * Mapa de Mercado atendem: as disponíveis e, entre elas, as que estão no prazo da cadência. Vazio quando o tipo não é
   * atendido por cascatas. Sem este método, só o tipo que é uma cascata roda por aqui.
   */
  planoDoMonitor?(monitorId: string): Promise<{ disponiveis: string[]; devidas: string[] }>
}

export interface ResultadoDoAquecimento {
  desfecho: 'concluida' | 'adiado' | 'falhou'
  mensagem: string
}

export interface Deps {
  db: Db
  apify: Apify
  adaptadores: Record<string, AdaptadorDeSinal>
  /** As cascatas de Sinais; sem elas, só os Sinais com actor e adaptador rodam. */
  cascatas?: Cascatas
  /** A fila de buscas; sem ela, a função cuida só dos Monitoramentos. */
  buscas?: Buscas
  /** Guarda a estatística de comércio exterior do mês. O corpo `{ action: 'aquecer' }` usa isto e não reivindica Monitoramento. */
  aquecer?: () => Promise<ResultadoDoAquecimento>
  /** O modelo de linguagem dos Sinais (`SIGNALS_LLM_PROVIDER`), para os adaptadores que classificam texto (PR-8). */
  llm?: { json(a: { sistema: string; usuario: string; maxTokens?: number; workspaceId?: string }): Promise<{ json: unknown; custoUsd: number }> }
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const MONITORES_POR_CHAMADA = 5
// O tempo da função é de 150 s; a cascata de um Monitoramento termina antes disto (a partir do início da chamada).
const PRAZO_DA_CASCATA_EM_MS = 140_000
const BUSCAS_POR_CHAMADA = 5
// O tempo da Edge Function é de 150 s. Uma Conta nova só começa até este prazo; o cliente do Apify desta função espera no
// máximo 70 s por Conta, mais 3 s para reler o custo (index.ts), então a última termina antes do limite. O que faltar fica
// para a rodada seguinte.
const PRAZO_PARA_COMECAR_EM_MS = 72_000
// Um Sinal com disparo até um dia no futuro vira "agora" (relógios e fusos); mais que isso, ou uma data ilegível, é descartado.
const TOLERANCIA_DE_DATA_EM_MS = 24 * 60 * 60 * 1000

// O que o Monitoramento diz quando uma rodada quebra por dentro; o detalhe fica só no log.
const MENSAGEM_DA_RODADA_QUE_FALHOU = 'A rodada falhou; tentamos de novo na próxima.'

const MOTIVO_DA_PARADA: Record<MotivoDeParada, string> = {
  no_credits: 'Sem créditos ou no limite mensal do participante: a varredura espera.',
  confirmar:
    'A varredura automática está em "confirmar". Ligue o automático com um teto em Configurações › Automação e tetos.',
  sem_teto: 'A varredura automática não roda sem um teto mensal aprovado (Configurações › Automação e tetos).',
  teto_atingido: 'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.',
  contrato_inativo: 'Contrato inativo. Fale com a equipe Althius para reativar.',
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
    const ctx = contextoDoAdaptador(m.workspaceId)
    let custoDoModelo = 0
    let itensDoModelo = 0
    if (ctx) ctx.custo = { adicionar: (usd, itens) => { custoDoModelo += usd; itensDoModelo += itens } }
    const brutos = adaptador.sinaisComContexto && ctx
      ? await adaptador.sinaisComContexto(execucao.items, conta, m.criteria, agora(), ctx)
      : adaptador.sinais(execucao.items, conta, m.criteria, agora())
    const encontrados = sinaisComDataValida(brutos, agora())
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
    // O modelo que classificou os itens: outra linha de custo, ligada à mesma execução.
    if (custoDoModelo > 0 && execucao.runId) {
      try {
        await deps.db.recordCost({
          workspaceId: m.workspaceId,
          actorId: actor.actorId,
          runId: `${execucao.runId}:modelo`,
          items: itensDoModelo,
          costUsd: Math.round(custoDoModelo * 1e8) / 1e8,
        })
      } catch (erro) {
        log({ type: 'signal_runner', monitorId: m.monitorId, outcome: 'cost_failed', message: String(erro) })
      }
    }
    return encontrados.length
  }

  /** O contexto dos adaptadores com estado, quando o banco tem as fotos e a contagem de vagas. */
  function contextoDoAdaptador(workspaceId: string): ContextoDoAdaptador | null {
    const { headcountBase, recordHeadcount, countJobSignals } = deps.db
    if (!headcountBase || !recordHeadcount || !countJobSignals) return null
    return {
      workspaceId,
      headcount: {
        base: (accountId, desde, antesDe) => headcountBase.call(deps.db, workspaceId, accountId, desde, antesDe),
        gravar: (accountId, foto, fonte) => recordHeadcount.call(deps.db, workspaceId, accountId, foto, fonte),
      },
      vagasAbertas: (accountId, desdeIso) => countJobSignals.call(deps.db, workspaceId, accountId, desdeIso),
      ...(deps.llm ? { llm: { json: (a) => deps.llm!.json({ ...a, workspaceId }) } } : {}),
      custo: { adicionar: () => {} },
    }
  }

  /**
   * Um Monitoramento de cascata: uma execução do motor para o público inteiro. A chave é o Monitoramento e a hora marcada
   * da rodada, então repetir a rodada nunca cobra nem grava duas vezes. O motivo de não ter rodado (saldo, automático em
   * "confirmar", teto, falha da fonte) volta em palavras do produto e fica no Monitoramento.
   */
  async function varrerPorCascata(m: MonitorReivindicado, prazo: number): Promise<{ scanned: number; signals: number }> {
    const r = await deps.cascatas!.rodar({
      workspaceId: m.workspaceId,
      userId: m.createdBy,
      signalType: m.signalType,
      origem: 'monitor',
      monitorId: m.monitorId,
      chave: `monitor:${m.monitorId}:${m.slot}`,
      contas: m.accounts.map((c) => ({ id: c.id, name: c.name, domain: c.domain, linkedinUrl: c.linkedinUrl, cnpj: c.cnpj ?? null })),
      criterios: m.criteria,
      prazoFinal: prazo - PRAZO_PARA_COMECAR_EM_MS + PRAZO_DA_CASCATA_EM_MS,
    })
    const semProblema = r.desfecho === 'concluida' || r.desfecho === 'ja_rodou_hoje' || r.desfecho === 'ja_concluida'
    await deps.db.finish(m.monitorId, m.accounts.length, semProblema ? null : r.mensagem, false)
    return { scanned: r.desfecho === 'concluida' || r.desfecho === 'parcial' ? m.accounts.length : 0, signals: r.novos }
  }

  /**
   * Um Monitoramento de tipo genérico: roda, uma depois da outra, as cascatas que o banco diz estarem devidas (disponíveis e
   * fora da cadência delas), cada uma pelo MESMO motor, com a sua reserva de crédito, o seu teto e o seu rastro. O Sinal é
   * gravado no tipo genérico, que é o do Monitoramento. A chave junta o Monitoramento, a hora marcada e a cascata, então
   * repetir a rodada nunca cobra nem grava duas vezes. Uma cascata que falha não derruba as outras; a que não coube no tempo
   * da função continua devida e entra na rodada seguinte.
   */
  async function varrerPorCascatasDoTipo(
    m: MonitorReivindicado,
    devidas: string[],
    prazo: number,
  ): Promise<{ scanned: number; signals: number }> {
    let sinais = 0
    let alguma = false
    let feitas = 0
    const problemas: string[] = []
    for (const tipo of devidas) {
      // Uma cascata nova só começa até o prazo para começar; o resto fica devido para a próxima rodada.
      if (agora() > prazo) break
      feitas++
      try {
        const r = await deps.cascatas!.rodar({
          workspaceId: m.workspaceId,
          userId: m.createdBy,
          signalType: tipo,
          registrarComo: m.signalType,
          origem: 'monitor',
          monitorId: m.monitorId,
          chave: `monitor:${m.monitorId}:${m.slot}:${tipo}`,
          contas: m.accounts.map((c) => ({ id: c.id, name: c.name, domain: c.domain, linkedinUrl: c.linkedinUrl, cnpj: c.cnpj ?? null })),
          criterios: m.criteria,
          prazoFinal: prazo - PRAZO_PARA_COMECAR_EM_MS + PRAZO_DA_CASCATA_EM_MS,
        })
        sinais += r.novos
        alguma ||= r.desfecho === 'concluida' || r.desfecho === 'parcial'
        if (!(r.desfecho === 'concluida' || r.desfecho === 'ja_rodou_hoje' || r.desfecho === 'ja_concluida')) problemas.push(r.mensagem)
      } catch (e) {
        log({ type: 'signal_runner', monitorId: m.monitorId, signalType: tipo, outcome: 'cascade_failed', message: String(e) })
        problemas.push(MENSAGEM_DA_RODADA_QUE_FALHOU)
      }
    }
    const faltam = devidas.length - feitas
    if (faltam > 0) problemas.push(`Rodamos ${feitas} de ${devidas.length} fontes; as outras entram na próxima rodada.`)
    const erro = [...new Set(problemas)].join(' ')
    await deps.db.finish(m.monitorId, m.accounts.length, erro || null, faltam > 0)
    return { scanned: alguma ? m.accounts.length : 0, signals: sinais }
  }

  /**
   * Um Monitoramento no mercado endereçável: uma execução da cascata da descoberta, sem Conta-alvo. Os cargos, o nicho, o
   * país e o estado vêm dos critérios; as Contas do Workspace só servem para casar (a cascata as lê). O preço é o fixo da
   * rodada, reservado pelo banco; a chave junta o Monitoramento e a hora marcada, então repetir a rodada nunca cobra nem
   * grava duas vezes. A empresa que é Conta recebe o Sinal; o resto vira candidata da Caixa de Descobertas, com aceite
   * manual. Nada cria Conta nem Sequência e nada envia mensagem.
   */
  async function varrerMercado(m: MonitorReivindicado, prazo: number): Promise<{ scanned: number; signals: number }> {
    if (!deps.cascatas) {
      await deps.db.finish(m.monitorId, 0, 'A busca no mercado endereçável não está disponível agora.', false)
      return { scanned: 0, signals: 0 }
    }
    // Vagas mantém um tipo de Monitoramento público (`vaga_linkedin`) e uma cascata privada
    // (`vaga_mercado`). As demais fontes de descoberta usam o próprio signalType como cascata;
    // a guarda do banco só permite tipos explicitamente marcados como market_discovery.
    const tipoDaCascata = m.signalType === 'vaga_linkedin' ? CASCATA_DO_MERCADO : m.signalType
    const r = await deps.cascatas.rodar({
      workspaceId: m.workspaceId,
      userId: m.createdBy,
      signalType: tipoDaCascata,
      registrarComo: m.signalType,
      origem: 'monitor',
      monitorId: m.monitorId,
      chave: `monitor:${m.monitorId}:${m.slot}:mercado:${tipoDaCascata}`,
      criterios: m.criteria,
      tetoCreditos: CREDITOS_POR_RODADA_NO_MERCADO,
      descoberta: true,
      prazoFinal: prazo - PRAZO_PARA_COMECAR_EM_MS + PRAZO_DA_CASCATA_EM_MS,
    })
    const semProblema = r.desfecho === 'concluida' || r.desfecho === 'ja_rodou_hoje' || r.desfecho === 'ja_concluida'
    log({ type: 'signal_runner', monitorId: m.monitorId, outcome: `market_${r.desfecho}`, novos: r.novos, candidatas: r.candidatas ?? 0 })
    await deps.db.finish(m.monitorId, 0, semProblema ? null : r.mensagem, false)
    return { scanned: 0, signals: r.novos }
  }

  async function varrerMonitor(m: MonitorReivindicado, prazo: number): Promise<{ scanned: number; signals: number }> {
    // O tempo já acabou nos Monitoramentos anteriores: este nem começa; solta a reserva e volta já.
    if (agora() > prazo) {
      await deps.db.finish(m.monitorId, 0, null, true)
      return { scanned: 0, signals: 0 }
    }
    if (deps.db.escopo && (await deps.db.escopo(m.monitorId)) === 'mercado') return await varrerMercado(m, prazo)
    if (deps.cascatas && await deps.cascatas.ehCascata(m.signalType)) return await varrerPorCascata(m, prazo)
    const adaptador = deps.adaptadores[m.signalType]
    const actor = adaptador ? await deps.db.actorForType(m.signalType) : null
    // O tipo genérico do catálogo é atendido por cascatas; o tipo com actor disponível segue pelo actor, como sempre.
    if (deps.cascatas?.planoDoMonitor && !(adaptador && actor?.state === 'available')) {
      const plano = await deps.cascatas.planoDoMonitor(m.monitorId)
      if (plano.disponiveis.length > 0) return await varrerPorCascatasDoTipo(m, plano.devidas, prazo)
    }
    if (!adaptador) {
      await deps.db.finish(m.monitorId, 0, `Ainda não há adaptador para o Sinal ${m.signalType}.`, false)
      return { scanned: 0, signals: 0 }
    }
    if (!actor || actor.state !== 'available') {
      await deps.db.finish(m.monitorId, 0, 'A fonte de dados deste Sinal não está disponível.', false)
      return { scanned: 0, signals: 0 }
    }

    let tentadas = 0
    let varridas = 0
    let sinais = 0
    let erro: string | null = null
    let continuar = false
    const falhas: string[] = []
    const semDado = new Map<string, string[]>()
    const ilimitado = deps.db.creditsUnlimited ? await deps.db.creditsUnlimited(m.workspaceId) : false
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
      const aberto = await deps.db.beginScan({
        workspaceId: m.workspaceId,
        userId: m.createdBy,
        monitorId: m.monitorId,
        accountId: conta.id,
        slot: m.slot,
      })
      const reservationId = aberto.reservationId
      const outcome = outcomeEfetivo(aberto.outcome, ilimitado, reservationId !== null)
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
    const ilimitado = deps.db.creditsUnlimited ? await deps.db.creditsUnlimited(b.workspaceId) : false
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
      const aberto = await buscas.beginScan({ rescanId: b.rescanId, monitorId: m.monitorId })
      const reservationId = aberto.reservationId
      const outcome = outcomeEfetivo(aberto.outcome, ilimitado, reservationId !== null)
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
        ? 'A fonte de dados dos Monitoramentos ativos não está disponível.'
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
    let acao: unknown
    try {
      const texto = await req.text()
      if (texto.trim()) {
        const lido: unknown = JSON.parse(texto)
        if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return responder({ error: 'Corpo inválido.' }, 400)
        acao = (lido as { action?: unknown }).action
      }
    } catch {
      return responder({ error: 'Corpo inválido.' }, 400)
    }
    // O relógio diário pede só a cópia da estatística. Corpo vazio ou `{}` continua reivindicando Monitoramentos.
    if (acao === 'aquecer') {
      if (!deps.aquecer) {
        return responder({ desfecho: 'falhou', mensagem: 'Não foi possível guardar a estatística de comércio exterior agora.' }, 500)
      }
      try {
        const r = await deps.aquecer()
        log({ type: 'signal_runner', outcome: `warm_${r.desfecho}` })
        return responder({ desfecho: r.desfecho, mensagem: r.mensagem })
      } catch (e) {
        log({ type: 'signal_runner', outcome: 'warm_failed', message: String(e) })
        return responder({ desfecho: 'falhou', mensagem: 'Não foi possível guardar a estatística de comércio exterior agora.' }, 500)
      }
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
        await deps.db.finish(m.monitorId, 0, MENSAGEM_DA_RODADA_QUE_FALHOU, false).catch(() => {})
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
