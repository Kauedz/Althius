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
  /**
   * agent_run_playbook: a Empresa e as seções do Playbook da Especialidade, só as já escritas. Opcional: um motor sem
   * ela roda como antes, sem o contexto da empresa.
   */
  playbook?(runId: string, specialty: string): Promise<SecaoDoPlaybookNaExecucao[]>
  /**
   * record_agent_run_cost: grava o custo real da Execução já fechada (tokens somados dos eventos e o modelo). Opcional:
   * um motor sem ela roda como antes, sem registrar custo.
   */
  custo?(runId: string): Promise<void>
}

/** Uma seção do Playbook do Workspace como o motor a recebe. */
export interface SecaoDoPlaybookNaExecucao {
  section: string
  name: string
  content: { texto?: unknown; linhas?: unknown } | null
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
  const comUso = (payload: Record<string, unknown>, uso?: UsoDeTokens) => (uso ? { ...payload, uso } : payload)
  return {
    /** A Coordenação chamou o Agente; da segunda rodada em diante, o evento diz qual rodada é. */
    chamada: (agenteId: string, rodada = 1) => db.append(runId, 'chamada', agenteId, rodada > 1 ? { rodada } : {}),
    /** O Agente terminou a parte dele, numa Coordenação, com o que a chamada gastou. */
    feito: (agenteId: string, texto: string, uso?: UsoDeTokens) =>
      db.append(runId, 'feito', agenteId, comUso({ texto }, uso)),
    /** O Agente respondeu na página dele, com o que a chamada gastou. */
    texto: (agenteId: string | null, texto: string, uso?: UsoDeTokens) =>
      db.append(runId, 'texto', agenteId, comUso({ texto }, uso)),
    /** A resposta final, com o que a Coordenação gastou para escolher e juntar. */
    resposta: (texto: string, uso?: UsoDeTokens) => db.append(runId, 'resposta', null, comUso({ texto }, uso)),
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

// ---------------------------------------------------------------------------------------------------------------------
// Cada Agente com a própria vez, em rodadas (agentes-em-conversa, ticket 02).

/** Rodadas por pedido: cada Agente fala na sua vez, e só volta a falar se pediu para continuar. */
export const MAX_RODADAS_DO_PEDIDO = 3

/** O que uma chamada ao modelo gastou, para os créditos. Só entra no evento quando o motor informa. */
export interface UsoDeTokens {
  entrada: number
  saida: number
}

export function somarUso(...usos: (UsoDeTokens | undefined)[]): UsoDeTokens | undefined {
  const presentes = usos.filter((uso): uso is UsoDeTokens => uso !== undefined)
  if (presentes.length === 0) return undefined
  return {
    entrada: presentes.reduce((total, uso) => total + uso.entrada, 0),
    saida: presentes.reduce((total, uso) => total + uso.saida, 0),
  }
}

/** Uma fala de um Agente na Conversa, já sem a linha de desfecho. */
export interface Fala {
  agente: AgenteDoWorkspace
  texto: string
  rodada: number
}

/** Como o Agente termina a vez dele: `pronto`, `pergunta` (falta algo que só o usuário sabe) ou `continuar`. */
export type Desfecho = 'pronto' | 'pergunta' | 'continuar'

/** O que o Agente precisa saber sobre o fim da resposta dele; entra nas instruções de todo Agente, em qualquer motor. */
export const INSTRUCAO_DE_DESFECHO = [
  'Responda com o seu trabalho de verdade, nunca com um aviso de que você foi acionado ou de que a equipe conversou.',
  'Termine sempre com uma última linha "STATUS: pronto", "STATUS: pergunta" ou "STATUS: continuar".',
  'Use "STATUS: pergunta" quando faltar uma informação que só o usuário tem (a sua resposta inteira é então a ' +
  'pergunta, curta e específica) ou quando a próxima ação depender de uma Aprovação. Use "STATUS: continuar" só ' +
  'quando precisar ver o que os outros Agentes responderam para completar o seu trabalho. Nos demais casos, "STATUS: pronto".',
].join('\n')

/** Separa a linha "STATUS: ..." do texto da resposta. Sem a linha (ou com uma que não vale), o Agente terminou. */
export function lerDesfecho(bruto: string): { texto: string; desfecho: Desfecho } {
  const linhas = bruto.trimEnd().split('\n')
  const ultima = linhas.at(-1)?.replace(/[*_`]/g, '').trim() ?? ''
  const achou = /^status\s*:\s*(pronto|pergunta|continuar)\.?$/i.exec(ultima)
  if (!achou) return { texto: bruto.trim(), desfecho: 'pronto' }
  return { texto: linhas.slice(0, -1).join('\n').trim(), desfecho: achou[1].toLowerCase() as Desfecho }
}

/** O texto de uma etapa vazio, ou só um aviso de que o Agente "foi acionado", não é trabalho: é falha. */
const AVISO_SEM_TRABALHO = [
  /^(fui|foi|fomos|foram|sou|estou|estamos)\s+(acionad|chamad|convocad)/i,
  /^(os\s+agentes\s+)?(conversaram|conversamos|conversou|discutiram|discutimos)\s+(sobre|a\s+respeito)/i,
  /^(agente\s+)?(acionad|chamad|convocad)[oa]s?\b/i,
]

export function textoDeEtapaValido(texto: string): boolean {
  const limpo = texto.trim().replace(/[.!\s]+$/, '')
  return limpo.length > 0 && !AVISO_SEM_TRABALHO.some((aviso) => aviso.test(limpo))
}

/** As falas até aqui, como o próximo Agente as lê: "Nome: texto". */
export function contribuicoesDe(falas: Fala[]): string[] {
  return falas.map((fala) => `${fala.agente.name}: ${fala.texto}`)
}

export interface ResultadoDoAgente {
  /** O texto como o modelo devolveu, com a linha de desfecho se houver. */
  texto: string
  uso?: UsoDeTokens
}

/**
 * O que muda de um motor para outro: como escolher os Agentes, como um Agente trabalha e como juntar o que disseram.
 * Cada método é uma chamada ao modelo; a ordem, as rodadas e os eventos são deste módulo.
 */
export interface Executor {
  escolher(): Promise<{ agentes: string[]; resposta_direta: string; uso?: UsoDeTokens }>
  trabalhar(agente: AgenteDoWorkspace, falas: Fala[], rodada: number): Promise<ResultadoDoAgente>
  sintetizar(falas: Fala[]): Promise<{ texto: string; uso?: UsoDeTokens }>
}

interface Rodadas {
  falas: Fala[]
  /** A fala em que um Agente pediu uma informação ao usuário: a Conversa para nela. */
  pergunta: Fala | null
}

/**
 * Cada Agente fala na sua vez, vendo tudo o que já foi dito. Na primeira rodada falam todos, em ordem; nas seguintes,
 * só os que pediram para continuar, até `MAX_RODADAS_DO_PEDIDO`. Para na hora quando um Agente pergunta ao usuário.
 */
export async function rodarRodadas(
  { agentes, executor, antes, aoFalar, maximo = MAX_RODADAS_DO_PEDIDO }: {
    agentes: AgenteDoWorkspace[]
    executor: Pick<Executor, 'trabalhar'>
    antes?: (agente: AgenteDoWorkspace, rodada: number) => Promise<unknown>
    aoFalar: (fala: Fala, uso?: UsoDeTokens) => Promise<unknown>
    maximo?: number
  },
): Promise<Rodadas> {
  const falas: Fala[] = []
  let daVez = agentes
  for (let rodada = 1; rodada <= maximo && daVez.length > 0; rodada++) {
    const continuam: AgenteDoWorkspace[] = []
    for (const agente of daVez) {
      await antes?.(agente, rodada)
      const resultado = await executor.trabalhar(agente, falas, rodada)
      const { texto, desfecho } = lerDesfecho(resultado.texto)
      if (!textoDeEtapaValido(texto)) throw new ErroDoModelo('model_empty')
      const fala = { agente, texto, rodada }
      falas.push(fala)
      await aoFalar(fala, resultado.uso)
      if (desfecho === 'pergunta') return { falas, pergunta: fala }
      if (desfecho === 'continuar') continuam.push(agente)
    }
    daVez = continuam
  }
  return { falas, pergunta: null }
}

/** A Conversa na página de um Agente: ele responde, cada @mencionado entra em seguida, e quem pediu volta a falar. */
export async function conversarNaPagina(
  { reserva, db, executor }: { reserva: Reserva; db: RunDb; executor: Executor },
): Promise<void> {
  const registro = registrador(db, reserva.run_id)
  await rodarRodadas({
    agentes: participantesDaConversa(reserva),
    executor,
    aoFalar: (fala, uso) => registro.texto(fala.agente.id, fala.texto, uso),
  })
}

/** A Coordenação: escolhe os Agentes, cada um trabalha na sua vez e ela junta o que disseram numa resposta. */
export async function coordenarPedido(
  { reserva, db, executor }: { reserva: Reserva; db: RunDb; executor: Executor },
): Promise<void> {
  const registro = registrador(db, reserva.run_id)
  const escolha = await executor.escolher()
  const chamados = chamadosDaCoordenacao(reserva, escolha.agentes)
  if (chamados.length === 0) {
    const direta = escolha.resposta_direta.trim()
    if (!direta) throw new ErroDoModelo('model_empty')
    await registro.resposta(direta, escolha.uso)
    return
  }
  const { falas, pergunta } = await rodarRodadas({
    agentes: chamados,
    executor,
    antes: (agente, rodada) => registro.chamada(agente.id, rodada),
    aoFalar: (fala, uso) => registro.feito(fala.agente.id, fala.texto, uso),
  })
  if (pergunta) {
    await registro.resposta(
      `${pergunta.agente.name} precisa de uma informação sua para continuar: ${pergunta.texto}`,
      escolha.uso,
    )
    return
  }
  const final = await executor.sintetizar(falas)
  const texto = final.texto.trim()
  if (!texto) throw new ErroDoModelo('model_empty')
  await registro.resposta(texto, somarUso(escolha.uso, final.uso))
}

// ---------------------------------------------------------------------------------------------------------------------
// O contexto do Playbook nos Agentes (agentes-em-conversa, ticket 03).

/** O Playbook entra no prompt até este tamanho; o que passar é cortado, com o aviso. */
export const MAX_CARACTERES_DO_PLAYBOOK = 24_000

function linhasComoTexto(linhas: unknown): string[] {
  if (!Array.isArray(linhas)) return []
  return linhas.flatMap((linha) => {
    if (!linha || typeof linha !== 'object') return []
    const campos = Object.entries(linha as Record<string, unknown>)
      .filter(([, valor]) => typeof valor === 'string' && valor.trim() !== '')
      .map(([campo, valor]) => `${campo}: ${String(valor).trim()}`)
    return campos.length ? [`- ${campos.join('; ')}`] : []
  })
}

function corpoDaSecao(secao: SecaoDoPlaybookNaExecucao): string {
  const texto = typeof secao.content?.texto === 'string' ? secao.content.texto.trim() : ''
  return [texto, ...linhasComoTexto(secao.content?.linhas)].filter(Boolean).join('\n')
}

/**
 * O que o Agente sabe da empresa, pelo Playbook do Workspace. Sem a seção Empresa (ou sem Playbook nenhum), ele é
 * mandado a perguntar o que a empresa vende antes de propor qualquer coisa. Só texto do Playbook: nunca dado de
 * Contatos. `undefined` quando o motor não leu o Playbook: nada é dito, e o Agente trabalha como antes.
 */
export function contextoDoPlaybook(secoes: SecaoDoPlaybookNaExecucao[] | undefined): string {
  if (secoes === undefined) return ''
  const escritas = secoes.filter((secao) => corpoDaSecao(secao) !== '')
  const partes: string[] = []
  if (escritas.length > 0) {
    let corpo = escritas.map((secao) => `### ${secao.name}\n${corpoDaSecao(secao)}`).join('\n\n')
    if (corpo.length > MAX_CARACTERES_DO_PLAYBOOK) {
      corpo = `${corpo.slice(0, MAX_CARACTERES_DO_PLAYBOOK)}\n[…o Playbook foi cortado por ser longo]`
    }
    partes.push(
      'Playbook do Workspace: o que a empresa definiu sobre si mesma. Use isto como a fonte sobre a empresa, e ao ' +
      'usar algo daqui cite a seção entre parênteses, por exemplo "(Playbook, seção ICP)".\n\n' + corpo,
    )
  }
  if (!escritas.some((secao) => secao.section === 'empresa')) {
    partes.push(
      'O Playbook deste Workspace ainda não tem a seção Empresa. Antes de propor ICP, Personas, textos ou qualquer ' +
      'conteúdo sobre a empresa, pergunte ao usuário o que a empresa vende, para quem e quais são os melhores ' +
      'clientes (termine com "STATUS: pergunta"). Não invente nada sobre a empresa.',
    )
  }
  partes.push(
    'Se faltar no Playbook algo de que você precisa, diga o que falta e pergunte ao usuário; não preencha com suposição.',
  )
  return partes.join('\n\n')
}

/**
 * O contexto do Playbook de cada Especialidade numa Execução, lido uma vez só por Especialidade (os Agentes voltam a
 * falar nas rodadas). Uma falha na leitura vira `undefined`: o Agente trabalha sem o contexto, e a falha vai ao log.
 */
export function leitorDoPlaybook(
  db: RunDb,
  runId: string,
  log: (fields: Record<string, unknown>) => void,
  tipoDoLog: string,
): (specialty: string) => Promise<string> {
  const lidos = new Map<string, Promise<string>>()
  return (specialty) => {
    let lido = lidos.get(specialty)
    if (!lido) {
      lido = (async () => {
        if (!db.playbook) return ''
        try {
          return contextoDoPlaybook(await db.playbook(runId, specialty))
        } catch (error) {
          log({ type: tipoDoLog, runId, outcome: 'playbook_failed', message: String(error) })
          return ''
        }
      })()
      lidos.set(specialty, lido)
    }
    return lido
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// O custo real de cada Execução (creditos-e-planos, ticket 01).

/**
 * Registra o custo de uma Execução já fechada, sucesso ou falha (a falha também gastou). O registro é só medida: se
 * falhar, a Execução não muda, e a falha vai ao log.
 */
export async function registrarCustoDaExecucao(
  db: RunDb,
  runId: string,
  log: (fields: Record<string, unknown>) => void,
  tipoDoLog: string,
): Promise<void> {
  if (!db.custo) return
  try {
    await db.custo(runId)
  } catch (error) {
    log({ type: tipoDoLog, runId, outcome: 'cost_failed', message: String(error) })
  }
}
