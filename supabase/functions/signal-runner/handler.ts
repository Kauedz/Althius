// A varredura automática de Sinais (sinais-reais, ticket 02): o relógio do banco chama esta função; ela reivindica os
// Monitoramentos vencidos e, Conta por Conta, abre a varredura no banco (que reserva 1 crédito e confere o teto da
// varredura automática), roda o actor do Sinal, grava os Sinais que o adaptador do tipo tira do resultado e fecha a
// varredura (concluída, debita; falha, solta a reserva e devolve o teto). Sem teto, sem crédito ou com o automático em
// confirmar, ela para e diz por quê no Monitoramento. Um adaptador por tipo de Sinal traduz a entrada do actor e o
// resultado dele (tickets 03 a 06 entregam um por família); sem adaptador, o Monitoramento espera. A mesma volta cuida da
// fila de buscas da reativação (ticket 08): a busca do clique numa Conta e a mensal automática varrem uma Conta com todos
// os Monitoramentos ativos do Workspace, e vêm antes dos Monitoramentos do relógio. Banco, Apify e relógio entram por
// injeção, para o teste ir do token à resposta sem rede.
//
// Rodar agora e o registro da Rodada (agente-de-sinal 02): a fila de pedidos manuais (`private.signal_run_requests`) é lida
// depois das buscas e antes dos Monitoramentos do relógio; o pedido roda o Plano do Monitoramento só nas Contas do escopo, com
// a varredura em modo manual (cobra crédito, respeita o saldo e os limites, não consome o Teto de automação). Toda Rodada,
// agendada ou manual, grava uma linha (`abrirRodada`/`somarRodada`), e uma Rodada que continua na chamada seguinte usa a
// mesma. O motivo da parada vira um código estável (`MotivoDaRodada`); a frase continua igual no Monitoramento e no log.
//
// Preço por rodada e limites (agente-de-sinal 04): o banco devolve `teto_diario` na Conta que estouraria o limite de créditos por
// dia do Sinal (agenda e manual somam no dia); a Rodada para ali, sem reservar nem cobrar essa Conta, e o motivo é `teto_diario`.
// Cascata e mercado reservam o crédito por Rodada, não por Conta: antes deles o runner pergunta ao banco se a Rodada inteira cabe
// no que falta do dia (`rodadaEstouraOLimiteDoDia`). Sem créditos, a Rodada é pulada sem cobrar (`sem_creditos`); quem conta as
// puladas e pausa o Sinal na terceira seguida é `finish_signal_monitor_run`, lendo o motivo que a Rodada gravou.
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
export type MotivoDeParada = 'no_credits' | 'confirmar' | 'sem_teto' | 'teto_atingido' | 'contrato_inativo' | 'teto_diario'
export type ResultadoDaAbertura = 'go' | 'resume' | 'done' | 'skip' | MotivoDeParada

/** Por que uma Rodada parou, em código estável (`private.signal_monitor_runs.stop_reason`). A tela escreve a frase. */
export type MotivoDaRodada = 'sem_creditos' | 'teto' | 'teto_diario' | 'contrato_inativo' | 'prazo' | 'concluida' | 'erro'
/** Quem grava `perdida` é o banco (o horário passou sem a Rodada começar); o runner não a produz, mas a lista de Rodadas a devolve. */
export type MotivoRegistradoDaRodada = MotivoDaRodada | 'perdida'

const MOTIVO_DA_RODADA: Record<MotivoDeParada, MotivoDaRodada> = {
  no_credits: 'sem_creditos',
  confirmar: 'teto',
  sem_teto: 'teto',
  teto_atingido: 'teto',
  contrato_inativo: 'contrato_inativo',
  teto_diario: 'teto_diario',
}

/** O que uma chamada do runner soma à Rodada aberta. */
export interface ResumoDaRodada {
  /** As Contas que a fonte verificou de fato (não conta a Conta sem dado nem a que falhou). */
  verificadas?: number
  novos?: number
  repetidos?: number
  /** As Contas que o adaptador pulou por falta de dado: não são cobradas. */
  semDado?: number
  /** As reservas de crédito que esta chamada liquidou; o banco soma o que elas custaram. */
  reservas?: string[]
  /** Créditos cobrados por fora das reservas por Conta (a cascata reserva por rodada). */
  creditos?: number
  motivo?: MotivoDaRodada
}

/** Como o motor de cascata terminou, em código estável da Rodada. */
function motivoDaCascata(desfecho: string): MotivoDaRodada {
  switch (desfecho) {
    case 'concluida':
    case 'ja_rodou_hoje':
    case 'ja_concluida':
      return 'concluida'
    case 'parcial':
      return 'prazo'
    case 'sem_creditos':
      return 'sem_creditos'
    case 'automatico_parado':
    case 'limite_diario':
      return 'teto'
    default:
      return 'erro'
  }
}

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
  beginScan(args: {
    workspaceId: string
    userId: string | null
    monitorId: string
    accountId: string
    slot: string
    /** `manual` é o Rodar agora: cobra crédito e não consome o Teto de automação. Ausente é `agenda`. */
    origem?: 'agenda' | 'manual'
    /** O pedido do Rodar agora: com o Monitoramento e a Conta, identifica a cobrança. */
    pedidoId?: string
  }): Promise<{
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
    /** A Rodada que achou o Sinal (nova ou vista de novo). Sem ela, o Sinal é gravado como sempre. */
    runId?: string | null
  }): Promise<boolean>
  recordCost(args: { workspaceId: string; actorId: string; runId: string; items: number; costUsd: number | null }): Promise<void>
  /** finish_signal_monitor_run: `attempted` são as Contas que a rodada tentou (a rotação avança por elas); `continuar` pede a próxima rodada já. */
  finish(monitorId: string, attempted: number, error: string | null, continuar: boolean): Promise<void>
  /**
   * A Rodada inteira passaria do limite de créditos por dia do Sinal? Só para o que reserva por Rodada (cascata e mercado): o
   * caminho por Conta confere Conta a Conta em `begin_account_scan`. Sem este método, ou se a leitura falhar, a Rodada segue
   * (a cascata tem os seus próprios limites).
   */
  rodadaEstouraOLimiteDoDia?(monitorId: string): Promise<boolean>
  /**
   * Abre a Rodada (ou devolve a que já está aberta: a continuação da agendada, a do pedido manual). Sem este método, a
   * Rodada não é registrada. Uma falha ao registrar nunca derruba a varredura.
   */
  abrirRodada?(args: { monitorId: string; slot: string; pedidoId?: string }): Promise<string>
  /** Soma o que a chamada fez à Rodada e diz por que parou. */
  somarRodada?(rodadaId: string, resumo: ResumoDaRodada): Promise<void>
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

/** Um pedido do Rodar agora, reivindicado da fila: as Contas do escopo, a partir de onde a rotação parou. */
export interface PedidoManual {
  pedidoId: string
  workspaceId: string
  monitorId: string
  signalType: string
  criteria: Record<string, unknown>
  /** Quem pediu e ainda participa do Workspace; nulo quando saiu (o crédito é do Workspace). */
  requestedBy: string | null
  /** A hora do pedido: com o Monitoramento e a Conta, identifica a Rodada. */
  requestedAt: string
  accounts: ContaParaVarrer[]
}

/** A fila de pedidos do Rodar agora no banco. */
export interface Manuais {
  claim(limit: number): Promise<PedidoManual[]>
  /** finish_signal_run_request: `pendente` solta a reserva e continua depois; `feita` e `falhou` encerram o pedido e a Rodada. */
  finish(pedidoId: string, estado: 'pendente' | 'feita' | 'falhou', tentadas: number, erro: string | null): Promise<void>
  /** Chama o relógio de novo: o pedido que não coube no tempo da função continua sem esperar a próxima volta. */
  kick?(): Promise<void>
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
  /** A fila do Rodar agora; sem ela, a função não atende pedido manual. */
  manuais?: Manuais
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
const PEDIDOS_POR_CHAMADA = 3
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
  teto_diario: 'Este Sinal chegou ao limite de créditos de hoje. Ele volta a rodar amanhã.',
}

// A busca do clique fala com quem pediu; a mensal, com o teto. O saldo e o limite mensal são de quem pediu.
const MOTIVO_DA_BUSCA_PARADA: Record<MotivoDeParada, string> = {
  ...MOTIVO_DA_PARADA,
  no_credits: 'Sem créditos ou no limite mensal de quem pediu: a busca parou.',
}

// O Rodar agora fala com quem clicou: o saldo e o limite mensal são de quem pediu, e o limite do mês volta na renovação.
const MOTIVO_DA_PARADA_MANUAL: Record<MotivoDeParada, string> = {
  ...MOTIVO_DA_PARADA,
  no_credits: 'Sem créditos ou no limite mensal de quem pediu: a rodada parou.',
  teto_atingido: 'Limite do mês atingido. Ele volta na renovação ou fale com a equipe Althius.',
  teto_diario: 'Este Sinal chegou ao limite de créditos de hoje: a rodada parou. Ele volta amanhã.',
}
const MENSAGEM_DO_PEDIDO_QUE_FALHOU = 'A rodada falhou. Tente de novo.'

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

  /**
   * Varre uma Conta já aberta no banco. Devolve quantos Sinais achou (novos e vistos de novo); lança quando a varredura não
   * pôde concluir. `rodadaId` liga os Sinais à Rodada que os achou.
   */
  async function varrerConta(
    m: Pick<MonitorReivindicado, 'monitorId' | 'workspaceId' | 'signalType' | 'criteria'>,
    conta: ContaParaVarrer,
    adaptador: AdaptadorDeSinal,
    actor: ActorDoRegistro,
    { input, maxItems }: Entrada,
    rodadaId: string | null = null,
  ): Promise<{ novos: number; repetidos: number }> {
    const execucao = await deps.apify.run({ actorId: actor.actorId, input, maxItems, maxTotalChargeUsd: actor.maxCostUsd })
    const ctx = contextoDoAdaptador(m.workspaceId)
    let custoDoModelo = 0
    let itensDoModelo = 0
    if (ctx) ctx.custo = { adicionar: (usd, itens) => { custoDoModelo += usd; itensDoModelo += itens } }
    const brutos = adaptador.sinaisComContexto && ctx
      ? await adaptador.sinaisComContexto(execucao.items, conta, m.criteria, agora(), ctx)
      : adaptador.sinais(execucao.items, conta, m.criteria, agora())
    const encontrados = sinaisComDataValida(brutos, agora())
    let novos = 0
    for (const s of encontrados) {
      const novo = await deps.db.recordSignal({
        workspaceId: m.workspaceId,
        accountId: conta.id,
        monitorId: m.monitorId,
        signalType: m.signalType,
        eventKey: s.eventKey,
        phrase: s.phrase,
        firedAt: s.firedAt,
        source: s.source ?? null,
        evidence: s.evidence ?? null,
        ...(rodadaId ? { runId: rodadaId } : {}),
      })
      if (novo !== false) novos++
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
    return { novos, repetidos: encontrados.length - novos }
  }

  /** Abre (ou reencontra) a Rodada no banco. O registro nunca derruba a varredura: sem ele, a Rodada segue sem linha. */
  async function abrirRodada(args: { monitorId: string; slot: string; pedidoId?: string }): Promise<string | null> {
    if (!deps.db.abrirRodada) return null
    try {
      return await deps.db.abrirRodada(args)
    } catch (e) {
      log({ type: 'signal_runner', monitorId: args.monitorId, outcome: 'run_open_failed', message: String(e) })
      return null
    }
  }

  async function somarRodada(rodadaId: string | null, resumo: ResumoDaRodada): Promise<void> {
    if (!rodadaId || !deps.db.somarRodada) return
    try {
      await deps.db.somarRodada(rodadaId, resumo)
    } catch (e) {
      log({ type: 'signal_runner', outcome: 'run_progress_failed', message: String(e) })
    }
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
   * O limite de créditos por dia do Sinal, para o que reserva o crédito por Rodada (cascata e mercado). Se a Rodada inteira não
   * cabe no que falta de hoje, ela nem começa: nada é reservado, e o motivo `teto_diario` fica na Rodada e no Monitoramento.
   * Uma leitura que falha deixa a Rodada seguir: a cascata tem os seus próprios limites e o registro vai para o log.
   */
  async function estouraOLimiteDoDia(monitorId: string): Promise<boolean> {
    if (!deps.db.rodadaEstouraOLimiteDoDia) return false
    try {
      return await deps.db.rodadaEstouraOLimiteDoDia(monitorId)
    } catch (e) {
      log({ type: 'signal_runner', monitorId, outcome: 'daily_cap_check_failed', message: String(e) })
      return false
    }
  }

  /** Encerra a Rodada que nem começou porque o limite por dia do Sinal já foi gasto. */
  async function pararNoLimiteDoDia(m: MonitorReivindicado, rodadaId: string | null): Promise<{ scanned: number; signals: number }> {
    await somarRodada(rodadaId, { motivo: 'teto_diario' })
    await deps.db.finish(m.monitorId, 0, MOTIVO_DA_PARADA.teto_diario, false)
    return { scanned: 0, signals: 0 }
  }

  /**
   * Um Monitoramento de cascata: uma execução do motor para o público inteiro. A chave é o Monitoramento e a hora marcada
   * da rodada, então repetir a rodada nunca cobra nem grava duas vezes. O motivo de não ter rodado (saldo, automático em
   * "confirmar", teto, falha da fonte) volta em palavras do produto e fica no Monitoramento.
   */
  async function varrerPorCascata(
    m: MonitorReivindicado,
    prazo: number,
    rodadaId: string | null,
  ): Promise<{ scanned: number; signals: number }> {
    if (await estouraOLimiteDoDia(m.monitorId)) return await pararNoLimiteDoDia(m, rodadaId)
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
    const verificadas = r.desfecho === 'concluida' || r.desfecho === 'parcial' ? m.accounts.length : 0
    await somarRodada(rodadaId, {
      verificadas, novos: r.novos, repetidos: r.repetidos, creditos: r.creditosCobrados, motivo: motivoDaCascata(r.desfecho),
    })
    await deps.db.finish(m.monitorId, m.accounts.length, semProblema ? null : r.mensagem, false)
    return { scanned: verificadas, signals: r.novos }
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
    rodadaId: string | null,
  ): Promise<{ scanned: number; signals: number }> {
    if (devidas.length > 0 && await estouraOLimiteDoDia(m.monitorId)) return await pararNoLimiteDoDia(m, rodadaId)
    let sinais = 0
    let repetidos = 0
    let creditos = 0
    let alguma = false
    let acabouOTempo = false
    let falhou = false
    let semCreditos = false
    let teto = false
    let feitas = 0
    const problemas: string[] = []
    for (const tipo of devidas) {
      // Uma cascata nova só começa até o prazo para começar; o resto fica devido para a próxima rodada.
      if (agora() > prazo) {
        acabouOTempo = true
        break
      }
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
        repetidos += r.repetidos
        creditos += r.creditosCobrados
        alguma ||= r.desfecho === 'concluida' || r.desfecho === 'parcial'
        const motivo = motivoDaCascata(r.desfecho)
        if (motivo === 'sem_creditos') semCreditos = true
        else if (motivo === 'teto') teto = true
        else if (motivo === 'erro') falhou = true
        if (!(r.desfecho === 'concluida' || r.desfecho === 'ja_rodou_hoje' || r.desfecho === 'ja_concluida')) problemas.push(r.mensagem)
      } catch (e) {
        log({ type: 'signal_runner', monitorId: m.monitorId, signalType: tipo, outcome: 'cascade_failed', message: String(e) })
        falhou = true
        problemas.push(MENSAGEM_DA_RODADA_QUE_FALHOU)
      }
    }
    const faltam = devidas.length - feitas
    if (faltam > 0) problemas.push(`Rodamos ${feitas} de ${devidas.length} fontes; as outras entram na próxima rodada.`)
    const erro = [...new Set(problemas)].join(' ')
    await somarRodada(rodadaId, {
      verificadas: alguma ? m.accounts.length : 0,
      novos: sinais,
      repetidos,
      creditos,
      motivo: semCreditos ? 'sem_creditos' : teto ? 'teto' : acabouOTempo && faltam > 0 ? 'prazo' : falhou ? 'erro' : 'concluida',
    })
    // As fontes que faltam entram numa continuação da MESMA Rodada, com o mesmo lote de Contas: a rotação só avança quando a Rodada
    // fecha. Dizer que o lote foi tentado a cada continuação o esgotaria no banco (`round_attempted`) antes de a última fonte rodar.
    await deps.db.finish(m.monitorId, faltam > 0 ? 0 : m.accounts.length, erro || null, faltam > 0)
    return { scanned: alguma ? m.accounts.length : 0, signals: sinais }
  }

  /**
   * Um Monitoramento no mercado endereçável: uma execução da cascata da descoberta, sem Conta-alvo. Os cargos, o nicho, o
   * país e o estado vêm dos critérios; as Contas do Workspace só servem para casar (a cascata as lê). O preço é o fixo da
   * rodada, reservado pelo banco; a chave junta o Monitoramento e a hora marcada, então repetir a rodada nunca cobra nem
   * grava duas vezes. A empresa que é Conta recebe o Sinal; o resto vira candidata da Caixa de Descobertas, com aceite
   * manual. Nada cria Conta nem Sequência e nada envia mensagem.
   */
  async function varrerMercado(
    m: MonitorReivindicado,
    prazo: number,
    rodadaId: string | null,
  ): Promise<{ scanned: number; signals: number }> {
    if (!deps.cascatas) {
      await somarRodada(rodadaId, { motivo: 'erro' })
      await deps.db.finish(m.monitorId, 0, 'A busca no mercado endereçável não está disponível agora.', false)
      return { scanned: 0, signals: 0 }
    }
    if (await estouraOLimiteDoDia(m.monitorId)) return await pararNoLimiteDoDia(m, rodadaId)
    // Vagas mantém um tipo de Monitoramento público (`vaga_linkedin`, `vaga_indeed`) e uma cascata privada no mercado
    // (`vaga_mercado`, `vaga_indeed_mercado`). As demais fontes de descoberta usam o próprio signalType como cascata;
    // a guarda do banco só permite tipos explicitamente marcados como market_discovery.
    const tipoDaCascata = m.signalType === 'vaga_linkedin'
      ? CASCATA_DO_MERCADO
      : m.signalType === 'vaga_indeed' ? 'vaga_indeed_mercado' : m.signalType
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
    await somarRodada(rodadaId, { novos: r.novos, repetidos: r.repetidos, creditos: r.creditosCobrados, motivo: motivoDaCascata(r.desfecho) })
    await deps.db.finish(m.monitorId, 0, semProblema ? null : r.mensagem, false)
    return { scanned: 0, signals: r.novos }
  }

  /** O que uma volta pelas Contas do Plano fez. */
  interface ResultadoDasContas {
    tentadas: number
    varridas: number
    novos: number
    repetidos: number
    /** As Contas que o adaptador pulou por falta de dado: nada foi reservado nem cobrado por elas. */
    semDado: number
    erro: string | null
    continuar: boolean
    motivo: MotivoDaRodada
    /** As reservas que esta volta liquidou. */
    reservas: string[]
  }

  /**
   * A volta pelas Contas de um Plano com actor e adaptador, a mesma na Rodada agendada e no Rodar agora: a Conta sem o dado que
   * o actor precisa é pulada antes de abrir a varredura (nada é reservado nem cobrado); as outras abrem a varredura no banco
   * (que reserva o crédito e, só no automático, o Teto), rodam o actor e gravam os Sinais; a que falha não é cobrada. Uma
   * Conta nova só começa até o prazo; o que faltar fica para a chamada seguinte (`continuar`).
   */
  async function varrerContas(
    v: {
      workspaceId: string
      monitorId: string
      signalType: string
      criteria: Record<string, unknown>
      userId: string | null
      slot: string
      accounts: ContaParaVarrer[]
      origem: 'agenda' | 'manual'
      pedidoId?: string
      rodadaId: string | null
    },
    adaptador: AdaptadorDeSinal,
    actor: ActorDoRegistro,
    prazo: number,
  ): Promise<ResultadoDasContas> {
    const manual = v.origem === 'manual'
    const motivos = manual ? MOTIVO_DA_PARADA_MANUAL : MOTIVO_DA_PARADA
    let tentadas = 0
    let varridas = 0
    let novos = 0
    let repetidos = 0
    let erro: string | null = null
    let continuar = false
    let parou: MotivoDeParada | null = null
    const falhas: string[] = []
    const reservas: string[] = []
    const semDado = new Map<string, string[]>()
    const ilimitado = deps.db.creditsUnlimited ? await deps.db.creditsUnlimited(v.workspaceId) : false
    for (const conta of v.accounts) {
      if (agora() > prazo) {
        erro = `Varridas ${varridas} de ${v.accounts.length} Contas; o resto na próxima rodada.`
        continuar = true
        break
      }
      // A Conta sem o dado que o actor precisa não abre varredura: nada é reservado nem cobrado. Um adaptador que quebra
      // na entrada é falha só desta Conta.
      let entrada: Entrada | SemDadoParaVarrer
      try {
        entrada = montarEntrada(adaptador, conta, v.criteria, agora())
      } catch (e) {
        tentadas++
        falhas.push(conta.name)
        log({ type: 'signal_runner', monitorId: v.monitorId, accountId: conta.id, outcome: 'input_failed', message: String(e) })
        continue
      }
      if (entrada instanceof SemDadoParaVarrer) {
        tentadas++
        semDado.set(entrada.message, [...(semDado.get(entrada.message) ?? []), conta.name])
        continue
      }
      const aberto = await deps.db.beginScan({
        workspaceId: v.workspaceId,
        userId: v.userId,
        monitorId: v.monitorId,
        accountId: conta.id,
        slot: v.slot,
        ...(manual ? { origem: 'manual' as const, pedidoId: v.pedidoId } : {}),
      })
      const reservationId = aberto.reservationId
      const outcome = outcomeEfetivo(aberto.outcome, ilimitado, reservationId !== null)
      if (outcome === 'done' || outcome === 'skip') {
        tentadas++
        continue
      }
      if (outcome !== 'go' && outcome !== 'resume') {
        parou = outcome
        erro = motivos[outcome]
        break
      }
      tentadas++
      try {
        const achados = await varrerConta(v, conta, adaptador, actor, entrada, v.rodadaId)
        novos += achados.novos
        repetidos += achados.repetidos
        await deps.db.endScan(reservationId!, true)
        reservas.push(reservationId!)
        varridas++
      } catch (e) {
        // A Conta que não pôde ser varrida não é cobrada e devolve o teto; as outras seguem.
        await deps.db.endScan(reservationId!, false).catch((f) =>
          log({ type: 'signal_runner', monitorId: v.monitorId, outcome: 'end_failed', message: String(f) }))
        falhas.push(conta.name)
        log({ type: 'signal_runner', monitorId: v.monitorId, accountId: conta.id, outcome: 'account_failed', message: String(e) })
      }
    }
    const avisos = [...semDado].map(([motivo, contas]) => `${motivo}: ${contas.join(', ')}.`)
    if (falhas.length) avisos.push(`Não foi possível varrer: ${falhas.join(', ')}.`)
    if (avisos.length) erro = [erro, ...avisos].filter(Boolean).join(' ')
    const semDadoTotal = [...semDado.values()].reduce((total, contas) => total + contas.length, 0)
    const motivo: MotivoDaRodada = parou
      ? MOTIVO_DA_RODADA[parou]
      : continuar
      ? 'prazo'
      : varridas === 0 && falhas.length > 0
      ? 'erro'
      : 'concluida'
    return { tentadas, varridas, novos, repetidos, semDado: semDadoTotal, erro, continuar, motivo, reservas }
  }

  async function varrerMonitor(m: MonitorReivindicado, prazo: number): Promise<{ scanned: number; signals: number }> {
    // O tempo já acabou nos Monitoramentos anteriores: este nem começa; solta a reserva e volta já.
    if (agora() > prazo) {
      await deps.db.finish(m.monitorId, 0, null, true)
      return { scanned: 0, signals: 0 }
    }
    // Toda Rodada grava uma linha; a que continua da chamada anterior usa a mesma.
    const rodadaId = await abrirRodada({ monitorId: m.monitorId, slot: m.slot })
    try {
      return await varrerMonitorNaRodada(m, prazo, rodadaId)
    } catch (e) {
      await somarRodada(rodadaId, { motivo: 'erro' })
      throw e
    }
  }

  async function varrerMonitorNaRodada(
    m: MonitorReivindicado,
    prazo: number,
    rodadaId: string | null,
  ): Promise<{ scanned: number; signals: number }> {
    if (deps.db.escopo && (await deps.db.escopo(m.monitorId)) === 'mercado') return await varrerMercado(m, prazo, rodadaId)
    if (deps.cascatas && await deps.cascatas.ehCascata(m.signalType)) return await varrerPorCascata(m, prazo, rodadaId)
    const adaptador = deps.adaptadores[m.signalType]
    const actor = adaptador ? await deps.db.actorForType(m.signalType) : null
    // O tipo genérico do catálogo é atendido por cascatas; o tipo com actor disponível segue pelo actor, como sempre.
    if (deps.cascatas?.planoDoMonitor && !(adaptador && actor?.state === 'available')) {
      const plano = await deps.cascatas.planoDoMonitor(m.monitorId)
      if (plano.disponiveis.length > 0) return await varrerPorCascatasDoTipo(m, plano.devidas, prazo, rodadaId)
    }
    if (!adaptador) {
      await somarRodada(rodadaId, { motivo: 'erro' })
      await deps.db.finish(m.monitorId, 0, `Ainda não há adaptador para o Sinal ${m.signalType}.`, false)
      return { scanned: 0, signals: 0 }
    }
    if (!actor || actor.state !== 'available') {
      await somarRodada(rodadaId, { motivo: 'erro' })
      await deps.db.finish(m.monitorId, 0, 'A fonte de dados deste Sinal não está disponível.', false)
      return { scanned: 0, signals: 0 }
    }

    const r = await varrerContas(
      {
        workspaceId: m.workspaceId,
        monitorId: m.monitorId,
        signalType: m.signalType,
        criteria: m.criteria,
        userId: m.createdBy,
        slot: m.slot,
        accounts: m.accounts,
        origem: 'agenda',
        rodadaId,
      },
      adaptador,
      actor,
      prazo,
    )
    await somarRodada(rodadaId, {
      verificadas: r.varridas, novos: r.novos, repetidos: r.repetidos, semDado: r.semDado, reservas: r.reservas, motivo: r.motivo,
    })
    await deps.db.finish(m.monitorId, r.tentadas, r.erro, r.continuar)
    return { scanned: r.varridas, signals: r.novos + r.repetidos }
  }

  /**
   * Um pedido do Rodar agora: roda o Plano do Monitoramento só nas Contas do escopo, com a varredura em modo manual. A
   * cobrança é a de toda varredura (o crédito por Conta verificada, o saldo e os limites), menos o Teto de automação: o clique
   * é a confirmação. A Rodada tem a sua linha; se o tempo da função acabar no meio, o pedido volta à fila e a Rodada continua
   * na chamada seguinte, sem cobrar a mesma Conta duas vezes. O Monitoramento (estado e horário da próxima Rodada) não muda.
   */
  async function varrerPedido(
    p: PedidoManual,
    manuais: Manuais,
    prazo: number,
  ): Promise<{ scanned: number; signals: number; continua: boolean }> {
    // O tempo já acabou nos pedidos anteriores: este nem começa e volta à fila.
    if (agora() > prazo) {
      await manuais.finish(p.pedidoId, 'pendente', 0, null)
      return { scanned: 0, signals: 0, continua: false }
    }
    const rodadaId = await abrirRodada({ monitorId: p.monitorId, slot: p.requestedAt, pedidoId: p.pedidoId })
    try {
      const adaptador = deps.adaptadores[p.signalType]
      const actor = adaptador ? await deps.db.actorForType(p.signalType) : null
      if (!adaptador || !actor || actor.state !== 'available') {
        await somarRodada(rodadaId, { motivo: 'erro' })
        await manuais.finish(p.pedidoId, 'falhou', 0, 'A fonte de dados deste Sinal não está disponível.')
        return { scanned: 0, signals: 0, continua: false }
      }
      const r = await varrerContas(
        {
          workspaceId: p.workspaceId,
          monitorId: p.monitorId,
          signalType: p.signalType,
          criteria: p.criteria,
          userId: p.requestedBy,
          slot: p.requestedAt,
          accounts: p.accounts,
          origem: 'manual',
          pedidoId: p.pedidoId,
          rodadaId,
        },
        adaptador,
        actor,
        prazo,
      )
      await somarRodada(rodadaId, {
        verificadas: r.varridas, novos: r.novos, repetidos: r.repetidos, semDado: r.semDado, reservas: r.reservas, motivo: r.motivo,
      })
      await manuais.finish(p.pedidoId, r.continuar ? 'pendente' : r.motivo === 'erro' ? 'falhou' : 'feita', r.tentadas, r.erro)
      // Só chama o relógio se algo andou: um pedido que volta sem tentar nenhuma Conta espera a próxima volta, sem laço.
      return { scanned: r.varridas, signals: r.novos + r.repetidos, continua: r.continuar && r.tentadas > 0 }
    } catch (e) {
      log({ type: 'signal_runner', monitorId: p.monitorId, requestId: p.pedidoId, outcome: 'run_request_failed', message: String(e) })
      await somarRodada(rodadaId, { motivo: 'erro' })
      await manuais.finish(p.pedidoId, 'falhou', 0, MENSAGEM_DO_PEDIDO_QUE_FALHOU).catch(() => {})
      return { scanned: 0, signals: 0, continua: false }
    }
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
        const achados = await varrerConta({ ...m, workspaceId: b.workspaceId }, b.account, adaptador, actor, entrada)
        sinais += achados.novos + achados.repetidos
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
    // Os pedidos do Rodar agora vêm depois das buscas (que são curtas) e antes dos Monitoramentos do relógio: quem clicou espera.
    const totalDosPedidos = { count: 0, scanned: 0, signals: 0 }
    let algumPedidoContinua = false
    if (deps.manuais) {
      try {
        const fila = await deps.manuais.claim(PEDIDOS_POR_CHAMADA)
        for (const p of fila) {
          totalDosPedidos.count++
          const r = await varrerPedido(p, deps.manuais, prazo)
          totalDosPedidos.scanned += r.scanned
          totalDosPedidos.signals += r.signals
          algumPedidoContinua ||= r.continua
        }
      } catch (e) {
        log({ type: 'signal_runner', outcome: 'run_request_claim_failed', message: String(e) })
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
    log({
      type: 'signal_runner', outcome: 'done', monitors: monitores.length, scanned, signals, rescans: totalDasBuscas.count,
      ...(deps.manuais ? { runRequests: totalDosPedidos.count } : {}),
    })
    // Uma busca que voltou à fila espera o relógio; chamá-lo já poupa 10 minutos a quem clicou.
    if (algumaVoltou) await deps.buscas?.kick().catch((e) => log({ type: 'signal_runner', outcome: 'kick_failed', message: String(e) }))
    if (algumPedidoContinua) await deps.manuais?.kick?.().catch((e) => log({ type: 'signal_runner', outcome: 'kick_failed', message: String(e) }))
    return responder({
      monitors: monitores.length,
      scanned,
      signals,
      ...(deps.buscas ? { rescans: totalDasBuscas } : {}),
      ...(deps.manuais ? { runRequests: totalDosPedidos } : {}),
    })
  }
}
