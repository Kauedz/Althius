// O worker do Hermes (CRM-14, motor Hermes). Roda fora do Supabase, ao lado do Hermes: no computador do Nan para o
// teste local, depois na VPS. Busca os pedidos que o app guardou (list_queued_agent_runs), reserva cada um uma vez só
// (claim_agent_run), entrega ao Hermes pela API de runs dele (POST /v1/runs, com Idempotency-Key) e grava a resposta
// pelo mesmo contrato da ponte (append_agent_run_event e finish_agent_run). O Hermes não aparece para o usuário: para
// ele, é a inteligência da Althius, que chama o Scopus, o Ethos, o Rhetor e o Oraculum (ADR-0004, ADR-0018).
import { REGRA_DE_MARCA } from '../_shared/marca.ts'
import {
  criarSessaoDeFerramentas,
  type DepsDasFerramentas,
  eventoDoPasso,
  instrucoesDasFerramentas,
  lerPedidoDeFerramenta,
  type SessaoDeFerramentas,
  textoDoMural,
} from '../_shared/ferramentas-dos-agentes.ts'
import {
  type AgenteDoWorkspace,
  agentesMencionados,
  agentesPorId,
  cobrandoOsCreditos,
  codigoDoErro,
  type ContaEncontrada,
  contribuicoesDe,
  conversarNaPagina,
  coordenarPedido,
  ErroDoModelo,
  ESPECIALIDADES,
  type Executor,
  fecharComFalha,
  historicoDaConversa,
  INSTRUCAO_DE_DESFECHO,
  leitorDoPlaybook,
  MAX_PARTICIPANTES_DA_CONVERSA,
  registrador,
  registrarCustoDaExecucao,
  type Reserva,
  type ResultadoDoAgente,
  type RunDb,
  somarUso,
  type UsoDeTokens,
  lerAnexos,
  reservaComAnexos,
} from '../_shared/orquestracao.ts'

export interface FilaDb extends RunDb {
  /** Renova o sinal somente depois de confirmar que o motor responde. */
  sinalDeVida?(): Promise<void>
  /** list_queued_agent_runs: os pedidos na fila, do mais antigo ao mais novo. */
  listQueued(limit: number): Promise<string[]>
  /**
   * agent_run_uses_own_ai_key: o Workspace da Execução ligou a chave de IA do próprio cliente. O Hermes tem o modelo
   * dele e não sabe usá-la, então a Execução falha com o motivo (a chave em si nunca passa pelo worker). Opcional: um
   * banco sem ela roda sempre no Hermes.
   */
  usaChaveDoCliente?(runId: string): Promise<boolean>
}

export type FimDoHermes =
  /** `uso`: o que o run gastou, quando o Hermes informa (o GET /v1/runs/{id} de um run concluído traz `usage`). */
  | { status: 'completed'; output: string; uso?: UsoDeTokens }
  | { status: 'failed' | 'cancelled' | 'interrupted' | 'timeout'; error: string }

export interface Hermes {
  /** GET /health: o Hermes está de pé. */
  vivo(): Promise<boolean>
  /** POST /v1/runs: começa a execução e devolve o run_id do Hermes. */
  iniciar(corpo: CorpoDoRun, idempotencyKey: string): Promise<string>
  /** GET /v1/runs/{id} até um estado final, ou o prazo. */
  aguardar(runId: string): Promise<FimDoHermes>
}

export interface CorpoDoRun {
  input: string
  instructions: string
  conversation_history: { role: 'user' | 'assistant'; content: string }[]
}

function linhaDoAgente(agente: AgenteDoWorkspace): string {
  const instrucoes = agente.instructions ? ` Instruções do Workspace: ${agente.instructions}` : ''
  const tom = agente.voice_tone ? ` Tom de voz: ${agente.voice_tone}.` : ''
  return `- ${agente.name} (${ESPECIALIDADES[agente.specialty] ?? agente.specialty})${instrucoes}${tom}`
}

/** As instruções da Execução: quem responde, os Agentes, as Contas-alvo do Workspace e o formato. Exportado para teste. */
export function corpoDoRun(reserva: Reserva, contas: ContaEncontrada[]): CorpoDoRun {
  const anfitriao = reserva.agent_id ? agentesPorId(reserva).get(reserva.agent_id) : undefined
  const mencionados = agentesMencionados(reserva).map((agente) => agente.name)
  const partes = [
    'Você é a inteligência da Althius, uma plataforma de prospecção B2B. Nunca diga o nome do motor que você usa nem ' +
    'que é um modelo de IA de terceiros: para o usuário, você é a Althius.',
    `Workspace: "${reserva.workspace_name}". Os Agentes deste Workspace, cada um com uma Especialidade:\n` +
    reserva.agents.map(linhaDoAgente).join('\n'),
    contas.length
      ? `Contas-alvo ativas do Workspace (até 10, as mais recentes):\n${JSON.stringify(contas)}`
      : 'O Workspace ainda não tem Contas-alvo ativas.',
    'Regras: responda em português do Brasil, direto. Nunca invente dados, números, nomes ou fatos: use só o que está ' +
    'aqui ou na conversa, e diga "não sei" quando faltar. Nenhuma Integração está conectada: não envie mensagem, não ' +
    'grave nada fora da Althius, não use terminal nem arquivos do computador. Se o pedido exigir isso, diga o que faria.',
    REGRA_DE_MARCA,
  ]
  if (reserva.kind === 'agente' && anfitriao && mencionados.length) {
    // Com Menção, cada Agente fala por si (PR-11): o mesmo JSON de etapas da Coordenação, uma etapa por Agente.
    const quem = [anfitriao.name, ...mencionados.filter((nome) => nome !== anfitriao.name)]
    partes.push(
      `Esta é a Conversa na página de ${anfitriao.name}, e o pedido menciona ${mencionados.join(', ')}. Cada um ` +
        `responde por si, com a própria Especialidade, nesta ordem: ${quem.join(', ')}. ` +
        'Responda SÓ com um objeto JSON, sem texto fora dele: ' +
        '{"etapas": [{"agente": "<nome exato do Agente>", "texto": "<a fala dele ao usuário>"}], "resposta": ""}.',
    )
  } else if (reserva.kind === 'agente' && anfitriao) {
    partes.push(`Responda como ${anfitriao.name}, com a Especialidade dele, em texto corrido.`)
  } else {
    partes.push(
      'Você coordena: decida quais Agentes trabalham no pedido (na dúvida sobre dados do Workspace, o Scopus) e faça o ' +
        'trabalho de cada um. ' +
        (mencionados.length ? `Os Agentes mencionados precisam trabalhar: ${mencionados.join(', ')}. ` : '') +
        'Responda SÓ com um objeto JSON, sem texto fora dele: ' +
        '{"etapas": [{"agente": "<nome exato do Agente>", "texto": "<o que ele fez>"}], "resposta": "<a resposta final ' +
        'ao usuário>"}. Para uma saudação ou dúvida sobre como usar a Althius, "etapas" fica vazio.',
    )
  }
  return {
    input: reserva.request_text,
    instructions: partes.join('\n\n'),
    conversation_history: historicoDaConversa(reserva),
  }
}

/** Tira o raciocínio que alguns modelos mostram (<think>...</think>) e as cercas de código em volta do JSON. */
export function limparSaida(texto: string): string {
  return texto.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    .trim()
}

interface Coordenado {
  etapas: { agente: string; texto: string }[]
  resposta: string
}

function lerCoordenado(texto: string): Coordenado | null {
  try {
    const dado = JSON.parse(texto)
    if (typeof dado?.resposta !== 'string' || !Array.isArray(dado?.etapas)) return null
    const etapas = dado.etapas.filter((e: unknown): e is { agente: string; texto: string } =>
      typeof (e as { agente?: unknown })?.agente === 'string' && typeof (e as { texto?: unknown })?.texto === 'string'
    )
    return { etapas, resposta: dado.resposta }
  } catch {
    return null
  }
}

const IDENTIDADE =
  'Você é a inteligência da Althius, uma plataforma de prospecção B2B. Nunca diga o nome do motor que você usa nem ' +
  'que é um modelo de IA de terceiros: para o usuário, você é a Althius.'

const REGRAS_DO_HERMES =
  'Regras: responda em português do Brasil, direto. Nunca invente dados, números, nomes ou fatos: use só o que está ' +
  'aqui ou na conversa, e diga "não sei" quando faltar. Nenhuma Integração está conectada: não envie mensagem, não ' +
  'grave nada fora da Althius, não use terminal nem arquivos do computador. Se o pedido exigir isso, diga o que faria.'

function contasDoWorkspace(contas: ContaEncontrada[]): string {
  return contas.length
    ? `Contas-alvo ativas do Workspace (até 10, as mais recentes):\n${JSON.stringify(contas)}`
    : 'O Workspace ainda não tem Contas-alvo ativas.'
}

const REGRAS_COM_FERRAMENTAS =
  'Regras: responda em português do Brasil, direto. Nunca invente dados, números, nomes ou fatos: use só o que está ' +
  'aqui, na conversa ou no resultado das ferramentas, e diga "não sei" quando faltar. Você só age pelas ferramentas da ' +
  'Althius descritas abaixo: não use terminal, arquivos do computador nem outras ferramentas. Uma ação ou uma mudança ' +
  'no Playbook que precisa de Aprovação só vale depois que um Administrador aprovar (uma Sequência proposta, depois que ' +
  'o Vendedor responsável aprovar e clicar em "Ativar envios"): diga isso, sem fingir que já foi feita.'

/** Os outros Agentes do Workspace, que o Agente pode chamar escrevendo "@Nome" na resposta (PR-11). */
function outrosAgentes(reserva: Reserva, agente: AgenteDoWorkspace): string {
  const outros = reserva.agents.filter((a) => a.id !== agente.id).map((a) => `@${a.name}`)
  return outros.length
    ? `Se precisar da contribuição de outro Agente, escreva o nome dele com @ na resposta (${outros.join(', ')}): ele ` +
      'fala em seguida, nesta mesma Conversa. Só chame quando a Especialidade dele for necessária.'
    : ''
}

/** As instruções de um Agente na sua vez: quem ele é, o que sabe do Workspace e como termina a resposta. */
export function instrucoesDoAgente(
  reserva: Reserva,
  agente: AgenteDoWorkspace,
  contas: ContaEncontrada[],
  playbook = '',
  ferramentas = '',
): string {
  return [
    IDENTIDADE,
    `Você é ${agente.name}, um Agente da Althius no Workspace "${reserva.workspace_name}".`,
    ESPECIALIDADES[agente.specialty] ?? '',
    agente.instructions ? `Instruções do Workspace para você: ${agente.instructions}` : '',
    agente.voice_tone ? `Tom de voz: ${agente.voice_tone}` : '',
    playbook,
    contasDoWorkspace(contas),
    ferramentas ? REGRAS_COM_FERRAMENTAS : REGRAS_DO_HERMES,
    REGRA_DE_MARCA,
    ferramentas,
    outrosAgentes(reserva, agente),
    INSTRUCAO_DE_DESFECHO,
  ].filter(Boolean).join('\n\n')
}

/** Chamadas ao Hermes por Agente e por rodada quando ele usa ferramentas: as que pedem ferramenta e a resposta. */
const MAX_PASSOS_COM_FERRAMENTA = 4

/** As instruções da Coordenação para escolher quem trabalha: uma lista de ids em JSON, sem agir ela mesma. */
export function instrucoesDaEscolha(reserva: Reserva): string {
  const lista = reserva.agents
    .map((agente) => `- ${agente.id}: ${agente.name} (${ESPECIALIDADES[agente.specialty] ?? agente.specialty})`)
    .join('\n')
  return [
    IDENTIDADE,
    'Você coordena: não faz o trabalho, só escolhe quais Agentes trabalham no pedido. Todo pedido sobre dados do ' +
    'Workspace (Contas-alvo, empresas, prospecção) ou sobre ICP, Personas, textos e presença da marca precisa de pelo ' +
    'menos um Agente: na dúvida, chame o Scopus. Escolha até 3 Agentes pelo id. Só se o pedido for uma saudação ou uma ' +
    'dúvida sobre como usar a Althius, não chame ninguém e escreva resposta_direta.',
    `Agentes do Workspace "${reserva.workspace_name}":\n${lista}`,
    'Responda SÓ com um objeto JSON, sem texto fora dele: {"agentes": ["<id>", ...], "resposta_direta": "<vazio, ou a ' +
    'resposta quando ninguém for chamado>"}.',
    REGRAS_DO_HERMES,
    REGRA_DE_MARCA,
  ].join('\n\n')
}

const INSTRUCOES_DA_SINTESE = [
  IDENTIDADE,
  'Você coordena: junte o que os Agentes responderam numa resposta única ao pedido, sem acrescentar fato que eles ' +
  'não trouxeram e dizendo de qual Agente veio cada parte quando isso ajudar.',
  REGRAS_DO_HERMES,
].join('\n\n')

function lerEscolha(saida: string): { agentes: string[]; resposta_direta: string } {
  const candidatos = [saida, /\{[\s\S]*\}/.exec(saida)?.[0] ?? '']
  for (const candidato of candidatos) {
    try {
      const dado = JSON.parse(candidato)
      if (Array.isArray(dado?.agentes) && typeof dado?.resposta_direta === 'string') {
        return { agentes: dado.agentes.filter((id: unknown): id is string => typeof id === 'string'), resposta_direta: dado.resposta_direta }
      }
    } catch { /* tenta o próximo candidato */ }
  }
  throw new ErroDoModelo('model_invalid_output')
}

/** Se a Execução vai pelo modo por Agente: sempre com Menção ou na página de um Agente; senão, o modo configurado. */
export function precisaDoModoPorAgente(reserva: Pick<Reserva, 'kind' | 'mentions'>, porAgente = false): boolean {
  return porAgente || reserva.kind === 'agente' || reserva.mentions.length > 0
}

/**
 * A Execução do Canal Slack (slack-canal 03) roda só com o Agente do fio: um fio, um Agente (Q20). Sem os outros Agentes
 * na reserva, ninguém entra por Menção, nem pela do pedido nem pela que o Agente escrever (o "Agente chama Agente" do
 * PR-11 não vale no Canal), e as instruções não oferecem outro Agente para chamar.
 */
export function soComOAgenteDoFio(reserva: Reserva): Reserva {
  if ((reserva as Reserva & { trigger_kind?: string }).trigger_kind !== 'canal') return reserva
  return { ...reserva, mentions: [], agents: reserva.agents.filter((agente) => agente.id === reserva.agent_id) }
}

export interface WorkerDeps {
  db: FilaDb
  hermes: Hermes
  log?: (fields: Record<string, unknown>) => void
  /** Temporizador periódico; devolve o cancelamento ao encerrar a rodada. */
  agendarSinal?: (renovar: () => Promise<void>, intervaloMs: number) => () => void
  /**
   * Cada Agente vira uma chamada separada ao Hermes, na sua vez e em rodadas (agentes-em-conversa, ticket 02). Sem isso,
   * o worker faz uma chamada só, que devolve as etapas de todos os Agentes juntas (o primeiro modo do motor Hermes).
   */
  porAgente?: boolean
  /**
   * As ferramentas dos Agentes (Etapa 5b), no modo por Agente: o Agente pede em JSON e o worker executa pelo catálogo
   * compartilhado. Sem elas, o Agente só lê as Contas-alvo das instruções, como antes.
   */
  ferramentas?: DepsDasFerramentas
}

export function createWorker(deps: WorkerDeps) {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const { db, hermes } = deps

  async function falhar(runId: string, codigo: string, detalhe = '') {
    log({ type: 'hermes_worker', runId, outcome: 'failed', errorCode: codigo, detail: detalhe })
    await fecharComFalha({ db, runId, codigo, modelo: 'hermes', log, tipoDoLog: 'hermes_worker' })
    await registrarCustoDaExecucao(db, runId, log, 'hermes_worker')
  }

  /** Roda uma Execução reservada, do pedido ao Hermes e de volta ao banco. */
  async function processar(reservada: Reserva) {
    const reserva = soComOAgenteDoFio(reservada)
    const runId = reserva.run_id
    let contas: ContaEncontrada[] = []
    try {
      contas = await db.searchAccounts(runId, '')
    } catch (error) {
      log({ type: 'hermes_worker', runId, outcome: 'accounts_failed', message: String(error) })
    }
    let fim: FimDoHermes
    try {
      const idHermes = await hermes.iniciar(corpoDoRun(reserva, contas), `althius-${runId}`)
      fim = await hermes.aguardar(idHermes)
    } catch (error) {
      return falhar(runId, 'hermes_unreachable', String(error))
    }
    if (fim.status !== 'completed') {
      return falhar(runId, fim.status === 'timeout' ? 'timeout' : 'hermes_failed', fim.error)
    }

    const saida = limparSaida(fim.output)
    if (!saida) return falhar(runId, 'model_empty')
    try {
      const registro = registrador(db, runId)
      if (reserva.kind === 'agente' && agentesMencionados(reserva).length) {
        await falasPorAgente(reserva, saida)
      } else if (reserva.kind === 'agente') {
        await registro.texto(reserva.agent_id, saida)
      } else {
        const coordenado = lerCoordenado(saida)
        const porNome = new Map(reserva.agents.map((agente) => [agente.name.toLowerCase(), agente.id]))
        for (const etapa of coordenado?.etapas ?? []) {
          const agenteId = porNome.get(etapa.agente.trim().toLowerCase())
          if (!agenteId) continue
          await registro.chamada(agenteId)
          await registro.feito(agenteId, etapa.texto)
        }
        // Sem o JSON pedido, a saída inteira vira a resposta: é o que o motor respondeu, não um texto nosso.
        const resposta = coordenado?.resposta.trim() || (coordenado ? '' : saida)
        if (!resposta) return falhar(runId, 'model_empty')
        await registro.resposta(resposta)
      }
      await db.finish(runId, 'succeeded', null, 'hermes')
      await registrarCustoDaExecucao(db, runId, log, 'hermes_worker')
      log({ type: 'hermes_worker', runId, kind: reserva.kind, outcome: 'succeeded' })
    } catch (error) {
      await falhar(runId, 'internal_error', String(error))
    }
  }

  /**
   * O modo de uma chamada na página de um Agente com Menção (fallback, PR-11): uma fala por Agente, na ordem anfitrião e
   * mencionados, cada uma cobrada como a rodada daquele Agente. Sem o JSON, a saída inteira fica com o anfitrião.
   */
  async function falasPorAgente(reserva: Reserva, saida: string) {
    const registro = registrador(db, reserva.run_id)
    const porNome = new Map(reserva.agents.map((agente) => [agente.name.toLowerCase(), agente]))
    const permitidos = new Set([reserva.agent_id, ...reserva.mentions])
    const vistos = new Set<string>()
    const etapas = (lerCoordenado(saida)?.etapas ?? []).flatMap((etapa) => {
      const agente = porNome.get(etapa.agente.trim().toLowerCase())
      const texto = etapa.texto.trim()
      if (!agente || !texto || !permitidos.has(agente.id) || vistos.has(agente.id)) return []
      if (vistos.size >= MAX_PARTICIPANTES_DA_CONVERSA) return []
      vistos.add(agente.id)
      return [{ agente, texto }]
    })
    const anfitriao = agentesPorId(reserva).get(reserva.agent_id ?? '')
    const falas = etapas.length ? etapas : anfitriao ? [{ agente: anfitriao, texto: saida }] : []
    if (!falas.length) throw new ErroDoModelo('agent_not_found')
    // A cobrança é a mesma do modo por Agente: cada fala abre e fecha a rodada do Agente que falou.
    const cobranca = cobrandoOsCreditos(
      { escolher: () => Promise.reject(new Error('sem escolha')), sintetizar: () => Promise.reject(new Error('sem síntese')), trabalhar: (_a, _f, _r) => Promise.resolve({ texto: '' }) },
      db,
      reserva.run_id,
    )
    for (const fala of falas) {
      await cobranca.trabalhar(fala.agente, [], 1)
      await registro.texto(fala.agente.id, fala.texto)
    }
  }

  /** Uma chamada ao Hermes, do pedido ao texto limpo e ao que gastou; toda falha vira o motivo gravado na Execução. */
  async function passo(chave: string, corpo: CorpoDoRun): Promise<ResultadoDoAgente> {
    let fim: FimDoHermes
    try {
      fim = await hermes.aguardar(await hermes.iniciar(corpo, chave))
    } catch (error) {
      throw new ErroDoModelo('hermes_unreachable', String(error))
    }
    if (fim.status !== 'completed') {
      throw new ErroDoModelo(fim.status === 'timeout' ? 'timeout' : 'hermes_failed', fim.error)
    }
    const texto = limparSaida(fim.output)
    if (!texto) throw new ErroDoModelo('model_empty')
    return { texto, uso: fim.uso }
  }

  /** O Hermes como motor de cada passo: escolher, trabalhar na vez de cada Agente e juntar. */
  function executorDoHermes(reserva: Reserva, contas: ContaEncontrada[], sessao: SessaoDeFerramentas | null = null): Executor {
    const runId = reserva.run_id
    const historico = historicoDaConversa(reserva)
    const playbookDe = leitorDoPlaybook(db, runId, log, 'hermes_worker')
    return {
      async escolher() {
        const { texto, uso } = await passo(`althius-${runId}-escolha`, {
          input: reserva.request_text,
          instructions: instrucoesDaEscolha(reserva),
          conversation_history: historico,
        })
        return { ...lerEscolha(texto), uso }
      },
      async trabalhar(agente, falas, rodada) {
        const anteriores = contribuicoesDe(falas)
        let input = [
          reserva.request_text,
          anteriores.length ? `O que outros Agentes já responderam neste pedido:\n${anteriores.join('\n\n')}` : '',
          sessao ? textoDoMural(sessao.mural()) : '',
        ].filter(Boolean).join('\n\n')
        const ferramentas = sessao ? instrucoesDasFerramentas(sessao.paraOAgente(agente)) : ''
        const instructions = instrucoesDoAgente(reserva, agente, contas, await playbookDe(agente.specialty), ferramentas)
        const chave = `althius-${runId}-${agente.id}-r${rodada}`
        if (!ferramentas || !sessao) return passo(chave, { input, instructions, conversation_history: historico })
        // A ponte das ferramentas: cada pedido em JSON é executado aqui, e o resultado volta na próxima chamada. O uso
        // do Agente na rodada soma todas as chamadas, as que pediram ferramenta e a que respondeu.
        let uso: UsoDeTokens | undefined
        for (let i = 0; i < MAX_PASSOS_COM_FERRAMENTA; i++) {
          const chaveDoPasso = i === 0 ? chave : `${chave}-f${i}`
          const feito = await passo(chaveDoPasso, { input, instructions, conversation_history: historico })
          uso = somarUso(uso, feito.uso)
          const pedido = lerPedidoDeFerramenta(feito.texto)
          if (!pedido) return { texto: feito.texto, uso }
          const r = await sessao.chamar(agente, pedido.nome, pedido.entrada)
          // Um nome fora do catálogo não vira passo com o nome inventado: aparece como pedido inválido.
          await db.append(runId, 'ferramenta', agente.id, eventoDoPasso(sessao.conhece(pedido.nome) ? pedido.nome : 'invalida', r.passo))
          input = `${input}\n\nVocê pediu a ferramenta ${pedido.nome}.\nResultado da ferramenta ${pedido.nome}` +
            `${r.erro ? ' (falhou)' : ''}: ${r.paraOAgente}`
        }
        throw new ErroDoModelo('tool_loop_limit')
      },
      sintetizar(falas) {
        return passo(`althius-${runId}-sintese`, {
          input: `Pedido: ${reserva.request_text}\n\nRespostas dos Agentes:\n${contribuicoesDe(falas).join('\n\n')}`,
          instructions: INSTRUCOES_DA_SINTESE,
          conversation_history: [],
        })
      },
    }
  }

  /** Cada Agente com a própria vez: uma chamada ao Hermes por passo, com a ordem e os eventos do módulo compartilhado. */
  async function processarPorAgente(reserva: Reserva) {
    const runId = reserva.run_id
    let contas: ContaEncontrada[] = []
    try {
      contas = await db.searchAccounts(runId, '')
    } catch (error) {
      log({ type: 'hermes_worker', runId, outcome: 'accounts_failed', message: String(error) })
    }
    let sessao: SessaoDeFerramentas | null = null
    if (deps.ferramentas) {
      try {
        sessao = criarSessaoDeFerramentas(deps.ferramentas, { runId, ctx: await deps.ferramentas.banco.contexto(runId) })
      } catch (error) {
        log({ type: 'hermes_worker', runId, outcome: 'tools_context_failed', message: String(error) })
      }
    }
    try {
      const executor = executorDoHermes(reserva, contas, sessao)
      if (reserva.kind === 'agente') await conversarNaPagina({ reserva, db, executor })
      else await coordenarPedido({ reserva, db, executor })
      await db.finish(runId, 'succeeded', null, 'hermes')
      await registrarCustoDaExecucao(db, runId, log, 'hermes_worker')
      log({ type: 'hermes_worker', runId, kind: reserva.kind, outcome: 'succeeded', porAgente: true })
    } catch (error) {
      await falhar(runId, codigoDoErro(error), String(error))
    }
  }

  /**
   * Uma volta: se o Hermes está de pé, reserva e roda os pedidos da fila, um por vez. Devolve quantos rodou, ou null
   * quando o Hermes não respondeu (os pedidos ficam na fila, sem reserva).
   */
  async function rodada(limite = 5): Promise<number | null> {
    if (!(await hermes.vivo().catch(() => false))) return null
    await db.sinalDeVida?.()
    // A fila é sequencial e cada chamada pode levar minutos. O sinal não pode depender do fim do lote.
    let encerrada = false
    let renovacao: Promise<void> | undefined
    const agendar = deps.agendarSinal ?? ((renovar, intervaloMs) => {
      const timer = setInterval(() => { void renovar() }, intervaloMs)
      return () => clearInterval(timer)
    })
    const cancelar = db.sinalDeVida ? agendar(() => {
      if (encerrada) return Promise.resolve()
      if (renovacao) return renovacao
      renovacao = (async () => {
        if (await hermes.vivo() && !encerrada) await db.sinalDeVida?.()
      })().catch((error) => {
        log({ type: 'hermes_worker', outcome: 'heartbeat_failed', message: String(error) })
      }).finally(() => { renovacao = undefined })
      return renovacao
    }, 30_000) : () => {}
    try {
      let feitos = 0
      for (const runId of await db.listQueued(limite)) {
        const reservada = await db.claim(runId)
        if (!reservada) continue
        // Os anexos do pedido (PR-10) entram como texto: o Hermes não recebe imagem, só o nome dela.
        // A Execução do Canal (slack-canal 03) segue só com o Agente do fio, e o anexo continua no pedido.
        const reserva = soComOAgenteDoFio(reservaComAnexos(reservada, await lerAnexos(db, runId, log, 'hermes_worker')))
        // Sem saber se há chave do cliente, a Execução não roda: seria cobrada como se usasse o modelo dele.
        let comChaveDoCliente = false
        try {
          comChaveDoCliente = (await db.usaChaveDoCliente?.(runId)) === true
        } catch (error) {
          await falhar(runId, 'internal_error', String(error))
          feitos++
          continue
        }
        if (comChaveDoCliente) {
          await falhar(runId, 'workspace_ai_key_unsupported')
          feitos++
          continue
        }
        // A Menção e a página de um Agente vão sempre pelo modo por Agente, mesmo com HERMES_UMA_CHAMADA=true (PR-11):
        // no modo de uma chamada, o mencionado não falava. A chamada única fica só para a Coordenação sem Menção.
        await (precisaDoModoPorAgente(reserva, deps.porAgente) ? processarPorAgente(reserva) : processar(reserva))
        feitos++
      }
      return feitos
    } finally {
      encerrada = true
      cancelar()
      await renovacao
    }
  }

  return { rodada, processar }
}

/** O cliente HTTP da API do Hermes (`hermes gateway` com API_SERVER_ENABLED=true). */
export function hermesHttp(
  {
    url,
    chave,
    prazoMs = 8 * 60_000,
    intervaloMs = 2000,
    fetch: buscar = fetch,
    esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)),
  }: {
    url: string
    chave: string
    prazoMs?: number
    intervaloMs?: number
    fetch?: typeof fetch
    esperar?: (ms: number) => Promise<void>
  },
): Hermes {
  const base = url.replace(/\/+$/, '')
  const cabecalhos = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }
  return {
    async vivo() {
      const resposta = await buscar(`${base}/health`)
      await resposta.body?.cancel()
      return resposta.ok
    },
    async iniciar(corpo, idempotencyKey) {
      const resposta = await buscar(`${base}/v1/runs`, {
        method: 'POST',
        headers: { ...cabecalhos, 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(corpo),
      })
      const dado = await resposta.json().catch(() => null) as { run_id?: unknown } | null
      if (!resposta.ok || typeof dado?.run_id !== 'string') {
        throw new Error(`Hermes recusou o run: HTTP ${resposta.status}`)
      }
      return dado.run_id
    },
    async aguardar(runId) {
      const limite = Date.now() + prazoMs
      while (Date.now() < limite) {
        const resposta = await buscar(`${base}/v1/runs/${encodeURIComponent(runId)}`, { headers: cabecalhos })
        const dado = await resposta.json().catch(() => null) as
          | {
            status?: string
            output?: unknown
            error?: unknown
            usage?: { input_tokens?: unknown; output_tokens?: unknown }
          }
          | null
        if (!resposta.ok || !dado) throw new Error(`Hermes não respondeu o status: HTTP ${resposta.status}`)
        if (dado.status === 'completed') {
          const { input_tokens, output_tokens } = dado.usage ?? {}
          const uso = typeof input_tokens === 'number' && typeof output_tokens === 'number'
            ? { entrada: input_tokens, saida: output_tokens }
            : undefined
          return { status: 'completed', output: String(dado.output ?? ''), ...(uso ? { uso } : {}) }
        }
        if (dado.status === 'failed' || dado.status === 'cancelled' || dado.status === 'interrupted') {
          return { status: dado.status, error: String(dado.error ?? '') }
        }
        await esperar(intervaloMs)
      }
      // Passou do prazo: pede para o Hermes parar, e a Execução fecha como timeout.
      await buscar(`${base}/v1/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST', headers: cabecalhos })
        .then((r) => r.body?.cancel()).catch(() => {})
      return { status: 'timeout', error: 'prazo do worker' }
    },
  }
}
