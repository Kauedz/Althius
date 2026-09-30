// O worker do Hermes (CRM-14, motor Hermes). Roda fora do Supabase, ao lado do Hermes: no computador do Nan para o
// teste local, depois na VPS. Busca os pedidos que o app guardou (list_queued_agent_runs), reserva cada um uma vez só
// (claim_agent_run), entrega ao Hermes pela API de runs dele (POST /v1/runs, com Idempotency-Key) e grava a resposta
// pelo mesmo contrato da ponte (append_agent_run_event e finish_agent_run). O Hermes não aparece para o usuário: para
// ele, é a inteligência da Althius, que chama o Scopus, o Ethos, o Rhetor e o Oraculum (ADR-0004, ADR-0018).
import {
  type AgenteDoWorkspace,
  agentesMencionados,
  agentesPorId,
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
  registrador,
  type Reserva,
  type RunDb,
} from '../_shared/orquestracao.ts'

export interface FilaDb extends RunDb {
  /** list_queued_agent_runs: os pedidos na fila, do mais antigo ao mais novo. */
  listQueued(limit: number): Promise<string[]>
}

export type FimDoHermes =
  | { status: 'completed'; output: string }
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
  ]
  if (reserva.kind === 'agente' && anfitriao) {
    partes.push(
      `Responda como ${anfitriao.name}, com a Especialidade dele, em texto corrido.` +
        (mencionados.length ? ` O pedido também menciona ${mencionados.join(', ')}: inclua a contribuição deles.` : ''),
    )
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

/** As instruções de um Agente na sua vez: quem ele é, o que sabe do Workspace e como termina a resposta. */
export function instrucoesDoAgente(reserva: Reserva, agente: AgenteDoWorkspace, contas: ContaEncontrada[]): string {
  return [
    IDENTIDADE,
    `Você é ${agente.name}, um Agente da Althius no Workspace "${reserva.workspace_name}".`,
    ESPECIALIDADES[agente.specialty] ?? '',
    agente.instructions ? `Instruções do Workspace para você: ${agente.instructions}` : '',
    agente.voice_tone ? `Tom de voz: ${agente.voice_tone}` : '',
    contasDoWorkspace(contas),
    REGRAS_DO_HERMES,
    INSTRUCAO_DE_DESFECHO,
  ].filter(Boolean).join('\n\n')
}

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

export interface WorkerDeps {
  db: FilaDb
  hermes: Hermes
  log?: (fields: Record<string, unknown>) => void
  /**
   * Cada Agente vira uma chamada separada ao Hermes, na sua vez e em rodadas (agentes-em-conversa, ticket 02). Sem isso,
   * o worker faz uma chamada só, que devolve as etapas de todos os Agentes juntas (o primeiro modo do motor Hermes).
   */
  porAgente?: boolean
}

export function createWorker(deps: WorkerDeps) {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const { db, hermes } = deps

  async function falhar(runId: string, codigo: string, detalhe = '') {
    log({ type: 'hermes_worker', runId, outcome: 'failed', errorCode: codigo, detail: detalhe })
    await fecharComFalha({ db, runId, codigo, modelo: 'hermes', log, tipoDoLog: 'hermes_worker' })
  }

  /** Roda uma Execução reservada, do pedido ao Hermes e de volta ao banco. */
  async function processar(reserva: Reserva) {
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
      if (reserva.kind === 'agente') {
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
      log({ type: 'hermes_worker', runId, kind: reserva.kind, outcome: 'succeeded' })
    } catch (error) {
      await falhar(runId, 'internal_error', String(error))
    }
  }

  /** Uma chamada ao Hermes, do pedido ao texto limpo; toda falha vira o motivo gravado na Execução. */
  async function passo(chave: string, corpo: CorpoDoRun): Promise<string> {
    let fim: FimDoHermes
    try {
      fim = await hermes.aguardar(await hermes.iniciar(corpo, chave))
    } catch (error) {
      throw new ErroDoModelo('hermes_unreachable', String(error))
    }
    if (fim.status !== 'completed') {
      throw new ErroDoModelo(fim.status === 'timeout' ? 'timeout' : 'hermes_failed', fim.error)
    }
    const saida = limparSaida(fim.output)
    if (!saida) throw new ErroDoModelo('model_empty')
    return saida
  }

  /** O Hermes como motor de cada passo: escolher, trabalhar na vez de cada Agente e juntar. */
  function executorDoHermes(reserva: Reserva, contas: ContaEncontrada[]): Executor {
    const runId = reserva.run_id
    const historico = historicoDaConversa(reserva)
    return {
      async escolher() {
        return lerEscolha(
          await passo(`althius-${runId}-escolha`, {
            input: reserva.request_text,
            instructions: instrucoesDaEscolha(reserva),
            conversation_history: historico,
          }),
        )
      },
      async trabalhar(agente, falas, rodada) {
        const anteriores = contribuicoesDe(falas)
        const input = anteriores.length
          ? `${reserva.request_text}\n\nO que outros Agentes já responderam neste pedido:\n${anteriores.join('\n\n')}`
          : reserva.request_text
        return {
          texto: await passo(`althius-${runId}-${agente.id}-r${rodada}`, {
            input,
            instructions: instrucoesDoAgente(reserva, agente, contas),
            conversation_history: historico,
          }),
        }
      },
      async sintetizar(falas) {
        return {
          texto: await passo(`althius-${runId}-sintese`, {
            input: `Pedido: ${reserva.request_text}\n\nRespostas dos Agentes:\n${contribuicoesDe(falas).join('\n\n')}`,
            instructions: INSTRUCOES_DA_SINTESE,
            conversation_history: [],
          }),
        }
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
    try {
      const executor = executorDoHermes(reserva, contas)
      if (reserva.kind === 'agente') await conversarNaPagina({ reserva, db, executor })
      else await coordenarPedido({ reserva, db, executor })
      await db.finish(runId, 'succeeded', null, 'hermes')
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
    let feitos = 0
    for (const runId of await db.listQueued(limite)) {
      const reserva = await db.claim(runId)
      if (!reserva) continue
      await (deps.porAgente ? processarPorAgente(reserva) : processar(reserva))
      feitos++
    }
    return feitos
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
          | { status?: string; output?: unknown; error?: unknown }
          | null
        if (!resposta.ok || !dado) throw new Error(`Hermes não respondeu o status: HTTP ${resposta.status}`)
        if (dado.status === 'completed') return { status: 'completed', output: String(dado.output ?? '') }
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
