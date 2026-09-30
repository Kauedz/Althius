// A orquestração dos Agentes (agentes-em-conversa, ticket 01): o que é igual em qualquer motor. Guarda o contrato
// com o banco da Execução (CRM-14: a Reserva, os tipos de evento e o formato de cada um), o vocabulário dos Agentes
// (as Especialidades), quem fala e em que ordem, e o fechamento de uma Execução que falhou. Não conhece o motor:
// a ponte (`agent-conversation`, que fala com a API de um modelo) e o worker do Hermes usam este módulo, e o modelo
// entra sempre por injeção nas pontas. Não importa nenhuma biblioteca de provedor.

export interface AgenteDoWorkspace {
  id: string
  name: string
  specialty: string
  kind: string
  instructions: string
  voice_tone: string
}

/** O que claim_agent_run devolve: só o que o motor precisa saber. */
export interface Reserva {
  run_id: string
  kind: 'agente' | 'coordenada'
  workspace_name: string
  request_text: string
  agent_id: string | null
  mentions: string[]
  agents: AgenteDoWorkspace[]
  history: { request: string; answer: string | null }[]
}

export type TipoDeEvento = 'chamada' | 'ferramenta' | 'feito' | 'texto' | 'resposta' | 'falha'

export interface ContaEncontrada {
  name: string
  domain: string
  segment: string | null
  origin: string
  last_interaction_at: string | null
}

/** O contrato com o banco da Execução: o encaixe de qualquer motor (ADR-0018). */
export interface RunDb {
  /** claim_agent_run: a reserva, ou null quando a Execução não está na fila (já rodou, ou quem pediu saiu). */
  claim(runId: string): Promise<Reserva | null>
  append(runId: string, kind: TipoDeEvento, agentId: string | null, payload: Record<string, unknown>): Promise<number>
  finish(runId: string, status: 'succeeded' | 'failed', errorCode: string | null, model: string | null): Promise<void>
  searchAccounts(runId: string, termo: string): Promise<ContaEncontrada[]>
}

/** Uma falha que vira o motivo gravado na Execução (`error_code`). */
export class ErroDoModelo extends Error {
  /** `detalhe` vai só para o log da função (ex.: o motivo que o provedor mandou), nunca para a tela. */
  constructor(readonly codigo: string, readonly detalhe = '') {
    super(detalhe ? `${codigo}: ${detalhe}` : codigo)
    this.name = 'ErroDoModelo'
  }
}

/** Quem é cada Especialidade, para o modelo saber o que fazer. Uma fonte só, para a ponte e o Hermes. */
export const ESPECIALIDADES: Record<string, string> = {
  scopus: 'Especialista em ICP: define o ICP a partir dos melhores clientes e dá nota de aderência a cada Conta-alvo.',
  ethos: 'Especialista em Persona: descreve dores, objeções e gatilhos de cada papel do Comitê de compra.',
  rhetor: 'Especialista em escrita persuasiva: escreve e-mails, sequências, posts e copy no tom da marca.',
  oraculum: 'Especialista em GEO: mede como a marca aparece nos assistentes de IA e recomenda o que publicar.',
}

/** Agentes chamados pela Coordenação num pedido, contando os @mencionados. */
export const MAX_CHAMADOS = 4
/** Agentes que a Coordenação escolhe por conta própria num pedido. */
export const MAX_ESCOLHIDOS = 3

/** A conversa até aqui, como pares de mensagens: um pedido sem resposta entra sozinho. */
export function historicoDaConversa(reserva: Reserva): { role: 'user' | 'assistant'; content: string }[] {
  return reserva.history.flatMap((troca) =>
    troca.answer
      ? [{ role: 'user' as const, content: troca.request }, { role: 'assistant' as const, content: troca.answer }]
      : [{ role: 'user' as const, content: troca.request }]
  )
}

/** Os Agentes do Workspace pelo id. */
export function agentesPorId(reserva: Reserva): Map<string, AgenteDoWorkspace> {
  return new Map(reserva.agents.map((agente) => [agente.id, agente]))
}

/** Os Agentes @mencionados no pedido que existem no Workspace, na ordem em que foram mencionados. */
export function agentesMencionados(reserva: Reserva): AgenteDoWorkspace[] {
  const porId = agentesPorId(reserva)
  return reserva.mentions.flatMap((id) => porId.get(id) ?? [])
}

/** O Agente de cuja página o pedido veio; `agent_not_found` quando ele já não existe. */
export function anfitriaoDaConversa(reserva: Reserva): AgenteDoWorkspace {
  const anfitriao = reserva.agent_id ? agentesPorId(reserva).get(reserva.agent_id) : undefined
  if (!anfitriao) throw new ErroDoModelo('agent_not_found')
  return anfitriao
}

/** Na página de um Agente: ele responde primeiro, e cada @mencionado entra em seguida. */
export function participantesDaConversa(reserva: Reserva): AgenteDoWorkspace[] {
  const anfitriao = anfitriaoDaConversa(reserva)
  return [anfitriao, ...agentesMencionados(reserva).filter((agente) => agente.id !== anfitriao.id)]
}

/** Na Coordenação: os @mencionados sempre trabalham, mais os que ela escolheu, até o limite. */
export function chamadosDaCoordenacao(reserva: Reserva, escolhidos: string[]): AgenteDoWorkspace[] {
  const porId = agentesPorId(reserva)
  const ids = [...new Set([...reserva.mentions, ...escolhidos.slice(0, MAX_ESCOLHIDOS)])].filter((id) => porId.has(id))
  return ids.slice(0, MAX_CHAMADOS).map((id) => porId.get(id)!)
}

/**
 * Grava os passos de uma Execução no formato que a tela lê (get_agent_run_events). Um lugar só para o tipo e o
 * conteúdo de cada evento, para nenhum motor gravar de um jeito diferente.
 */
export function registrador(db: RunDb, runId: string) {
  return {
    /** A Coordenação chamou o Agente. */
    chamada: (agenteId: string) => db.append(runId, 'chamada', agenteId, {}),
    /** O Agente terminou a parte dele, numa Coordenação. */
    feito: (agenteId: string, texto: string) => db.append(runId, 'feito', agenteId, { texto }),
    /** O Agente respondeu na página dele. */
    texto: (agenteId: string | null, texto: string) => db.append(runId, 'texto', agenteId, { texto }),
    /** A resposta final da Coordenação. */
    resposta: (texto: string) => db.append(runId, 'resposta', null, { texto }),
  }
}

/** O motivo que fica gravado na Execução: o da falha do modelo, ou `internal_error` para qualquer outra. */
export function codigoDoErro(error: unknown): string {
  return error instanceof ErroDoModelo ? error.codigo : 'internal_error'
}

/**
 * Fecha a Execução como falha, com o motivo. Se ela já fechou (o prazo venceu) ou o banco caiu, só registra: a leitura
 * seguinte a fecha como timeout.
 */
export async function fecharComFalha(
  { db, runId, codigo, modelo, log, tipoDoLog }: {
    db: RunDb
    runId: string
    codigo: string
    modelo: string | null
    log: (fields: Record<string, unknown>) => void
    tipoDoLog: string
  },
): Promise<void> {
  try {
    await db.finish(runId, 'failed', codigo, modelo)
  } catch (erroAoFechar) {
    log({ type: tipoDoLog, runId, outcome: 'finish_failed', message: String(erroAoFechar) })
  }
}
