// A Execução de um pedido (CRM-14), depois que ele está guardado na fila. Reserva a Execução no banco, roda o Agente da
// página ou a Coordenação (ADR-0004) e grava cada passo antes do seguinte, para a tela acompanhar pelo banco. Termina
// com sucesso só depois de gravar a resposta; qualquer falha do modelo, da ferramenta ou do banco fecha a Execução como
// falha, com o motivo, sem resposta inventada. Banco e modelo entram por injeção de dependência, para o teste rodar sem
// rede.
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'

export interface AgenteDoWorkspace {
  id: string
  name: string
  specialty: string
  kind: string
  instructions: string
  voice_tone: string
}

/** O que claim_agent_run devolve: só o que o modelo precisa saber. */
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

export interface RunDb {
  /** claim_agent_run: a reserva, ou null quando a Execução não está na fila (já rodou, ou quem pediu saiu). */
  claim(runId: string): Promise<Reserva | null>
  append(runId: string, kind: TipoDeEvento, agentId: string | null, payload: Record<string, unknown>): Promise<number>
  finish(runId: string, status: 'succeeded' | 'failed', errorCode: string | null, model: string | null): Promise<void>
  searchAccounts(runId: string, termo: string): Promise<ContaEncontrada[]>
}

export interface Modelo {
  /** O id do modelo, gravado na Execução. */
  nome: string
  /** Uma chamada à Messages API. Lança ErroDoModelo quando a API recusa ou não responde. */
  criar(
    params: Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, 'model'>,
  ): Promise<Anthropic.Beta.Messages.BetaMessage>
}

/** Uma falha que vira o motivo gravado na Execução (`error_code`). */
export class ErroDoModelo extends Error {
  constructor(readonly codigo: string) {
    super(codigo)
    this.name = 'ErroDoModelo'
  }
}

export interface RunnerDeps {
  db: RunDb
  modelo: Modelo
  log?: (fields: Record<string, unknown>) => void
}

const ESPECIALIDADES: Record<string, string> = {
  scopus: 'Especialista em ICP: define o ICP a partir dos melhores clientes e dá nota de aderência a cada Conta-alvo.',
  ethos: 'Especialista em Persona: descreve dores, objeções e gatilhos de cada papel do Comitê de compra.',
  rhetor: 'Especialista em escrita persuasiva: escreve e-mails, sequências, posts e copy no tom da marca.',
  oraculum: 'Especialista em GEO: mede como a marca aparece nos assistentes de IA e recomenda o que publicar.',
}

const MAX_TOKENS = 16000
/** Rodadas de ferramenta por Agente num pedido. */
const MAX_RODADAS = 4
/** Agentes chamados pela Coordenação num pedido, contando os @mencionados. */
const MAX_CHAMADOS = 4

const BUSCAR_CONTAS: Anthropic.Beta.Messages.BetaTool = {
  name: 'buscar_contas_alvo',
  description:
    'Busca Contas-alvo ativas do Workspace pelo nome ou pelo domínio. Devolve até 10, com nome, domínio, segmento, ' +
    'origem e a data da última Interação. Termo vazio lista as mais recentes.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { termo: { type: 'string', description: 'Parte do nome ou do domínio da Conta-alvo.' } },
    required: ['termo'],
    additionalProperties: false,
  },
}

const REGRAS = [
  'Responda em português do Brasil, direto e sem enrolação.',
  'Nunca invente dados, números, nomes ou fatos. Se não souber, ou se a consulta não trouxer, diga que não sabe.',
  'Os dados do Workspace só chegam pela ferramenta buscar_contas_alvo. Nenhuma Integração externa está conectada: ' +
  'você não envia, não grava e não altera nada fora da Althius. Se o pedido exigir isso, diga o que faria e que ' +
  'depende de conectar a Integração.',
].join('\n')

function systemDoAgente(agente: AgenteDoWorkspace, workspace: string): string {
  return [
    `Você é ${agente.name}, um Agente da Althius no Workspace "${workspace}".`,
    ESPECIALIDADES[agente.specialty] ?? '',
    agente.instructions ? `Instruções do Workspace para você:\n${agente.instructions}` : '',
    agente.voice_tone ? `Tom de voz: ${agente.voice_tone}` : '',
    REGRAS,
  ].filter(Boolean).join('\n\n')
}

function historico(reserva: Reserva): Anthropic.Beta.Messages.BetaMessageParam[] {
  return reserva.history.flatMap((troca): Anthropic.Beta.Messages.BetaMessageParam[] =>
    troca.answer
      ? [{ role: 'user', content: troca.request }, { role: 'assistant', content: troca.answer }]
      : [{ role: 'user', content: troca.request }]
  )
}

function textoDe(resposta: Anthropic.Beta.Messages.BetaMessage): string {
  return resposta.content.flatMap((bloco) => (bloco.type === 'text' ? [bloco.text] : [])).join('\n').trim()
}

/** A resposta só serve se o modelo terminou: recusa e corte por tamanho são falhas, não respostas. */
function conferirParada(resposta: Anthropic.Beta.Messages.BetaMessage) {
  if (resposta.stop_reason === 'refusal') throw new ErroDoModelo('model_refusal')
  if (resposta.stop_reason === 'max_tokens') throw new ErroDoModelo('model_incomplete')
}

function lerTermo(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const termo = (input as Record<string, unknown>).termo
  return typeof termo === 'string' && termo.length <= 200 ? termo.trim() : null
}

export function createRunner(deps: RunnerDeps): (runId: string) => Promise<void> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const { db, modelo } = deps

  /** Um Agente trabalha no pedido, com a consulta de Contas-alvo, e devolve o texto final dele. */
  async function trabalhar(reserva: Reserva, agente: AgenteDoWorkspace, contribuicoes: string[]): Promise<string> {
    const pedido = contribuicoes.length
      ? `${reserva.request_text}\n\nO que outros Agentes já responderam neste pedido:\n${contribuicoes.join('\n\n')}`
      : reserva.request_text
    const mensagens: Anthropic.Beta.Messages.BetaMessageParam[] = [...historico(reserva), {
      role: 'user',
      content: pedido,
    }]
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const resposta = await modelo.criar({
        max_tokens: MAX_TOKENS,
        system: systemDoAgente(agente, reserva.workspace_name),
        tools: [BUSCAR_CONTAS],
        messages: mensagens,
        output_config: { effort: 'medium' },
      })
      conferirParada(resposta)
      const chamadas = resposta.content.filter((bloco) => bloco.type === 'tool_use')
      if (resposta.stop_reason !== 'tool_use' || chamadas.length === 0) {
        const texto = textoDe(resposta)
        if (!texto) throw new ErroDoModelo('model_empty')
        return texto
      }
      mensagens.push({ role: 'assistant', content: resposta.content })
      const resultados: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
      for (const chamada of chamadas) {
        if (chamada.type !== 'tool_use') continue
        const termo = chamada.name === BUSCAR_CONTAS.name ? lerTermo(chamada.input) : null
        if (termo === null) {
          await db.append(reserva.run_id, 'ferramenta', agente.id, {
            ferramenta: chamada.name,
            descricao: 'Pediu uma consulta que não existe',
            estado: 'falhou',
          })
          resultados.push({
            type: 'tool_result',
            tool_use_id: chamada.id,
            is_error: true,
            content: 'Consulta inválida.',
          })
          continue
        }
        const descricao = termo ? `Consultou as Contas-alvo: "${termo}"` : 'Consultou as Contas-alvo mais recentes'
        let contas: ContaEncontrada[]
        try {
          contas = await db.searchAccounts(reserva.run_id, termo)
        } catch (error) {
          log({ type: 'agent_run', runId: reserva.run_id, outcome: 'tool_failed', message: String(error) })
          await db.append(reserva.run_id, 'ferramenta', agente.id, {
            ferramenta: chamada.name,
            descricao,
            estado: 'falhou',
          })
          resultados.push({
            type: 'tool_result',
            tool_use_id: chamada.id,
            is_error: true,
            content: 'A consulta falhou. Não use dados desta consulta.',
          })
          continue
        }
        await db.append(reserva.run_id, 'ferramenta', agente.id, {
          ferramenta: chamada.name,
          descricao,
          estado: 'concluida',
          resultados: contas.length,
        })
        resultados.push({ type: 'tool_result', tool_use_id: chamada.id, content: JSON.stringify(contas) })
      }
      mensagens.push({ role: 'user', content: resultados })
    }
    throw new ErroDoModelo('tool_loop_limit')
  }

  /** A Conversa na página de um Agente: ele responde, e cada @mencionado entra em seguida. */
  async function conversar(reserva: Reserva) {
    const porId = new Map(reserva.agents.map((agente) => [agente.id, agente]))
    const anfitriao = reserva.agent_id ? porId.get(reserva.agent_id) : undefined
    if (!anfitriao) throw new ErroDoModelo('agent_not_found')
    const participantes = [
      anfitriao,
      ...reserva.mentions.filter((id) => id !== anfitriao.id).flatMap((id) => porId.get(id) ?? []),
    ]
    const contribuicoes: string[] = []
    for (const agente of participantes) {
      const texto = await trabalhar(reserva, agente, contribuicoes)
      await db.append(reserva.run_id, 'texto', agente.id, { texto })
      contribuicoes.push(`${agente.name}: ${texto}`)
    }
  }

  /** A Coordenação escolhe os Agentes do pedido, sempre com os @mencionados, sem agir ela mesma. */
  async function escolher(reserva: Reserva): Promise<{ agentes: string[]; resposta_direta: string }> {
    const lista = reserva.agents
      .map((agente) => `- ${agente.id}: ${agente.name} (${ESPECIALIDADES[agente.specialty] ?? agente.specialty})`)
      .join('\n')
    const resposta = await modelo.criar({
      max_tokens: MAX_TOKENS,
      system: [
        'Você é a Coordenação da Althius. Você não é um Agente: não tem nome, não consulta dados e não age.',
        'Escolha quais Agentes do Workspace devem trabalhar no pedido (no máximo 3), pelo id. Chame um Agente padrão, a ' +
        'menos que o pedido cite um Agente criado. Se o pedido for só uma saudação ou uma dúvida sobre a própria ' +
        'Althius, não chame ninguém e escreva a resposta direta; nos outros casos, deixe resposta_direta vazia.',
        `Agentes do Workspace "${reserva.workspace_name}":\n${lista}`,
        REGRAS,
      ].join('\n\n'),
      messages: [...historico(reserva), { role: 'user', content: reserva.request_text }],
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              agentes: { type: 'array', items: { type: 'string', enum: reserva.agents.map((agente) => agente.id) } },
              resposta_direta: { type: 'string' },
            },
            required: ['agentes', 'resposta_direta'],
            additionalProperties: false,
          },
        },
      },
    })
    conferirParada(resposta)
    try {
      const escolha = JSON.parse(textoDe(resposta))
      if (!Array.isArray(escolha?.agentes) || typeof escolha?.resposta_direta !== 'string') throw new Error()
      return escolha
    } catch {
      throw new ErroDoModelo('model_invalid_output')
    }
  }

  async function coordenar(reserva: Reserva) {
    const porId = new Map(reserva.agents.map((agente) => [agente.id, agente]))
    const escolha = await escolher(reserva)
    const ids = [...new Set([...reserva.mentions, ...escolha.agentes.slice(0, 3)])].filter((id) => porId.has(id))
    const chamados = ids.slice(0, MAX_CHAMADOS).map((id) => porId.get(id)!)
    if (chamados.length === 0) {
      const direta = escolha.resposta_direta.trim()
      if (!direta) throw new ErroDoModelo('model_empty')
      await db.append(reserva.run_id, 'resposta', null, { texto: direta })
      return
    }
    const contribuicoes: string[] = []
    for (const agente of chamados) {
      await db.append(reserva.run_id, 'chamada', agente.id, {})
      const texto = await trabalhar(reserva, agente, contribuicoes)
      await db.append(reserva.run_id, 'feito', agente.id, { texto })
      contribuicoes.push(`${agente.name}: ${texto}`)
    }
    const final = await modelo.criar({
      max_tokens: MAX_TOKENS,
      system: [
        'Você é a Coordenação da Althius. Junte o que os Agentes responderam numa resposta única ao pedido, sem ' +
        'acrescentar fato que eles não trouxeram e dizendo de qual Agente veio cada parte quando isso ajudar.',
        REGRAS,
      ].join('\n\n'),
      messages: [{
        role: 'user',
        content: `Pedido: ${reserva.request_text}\n\nRespostas dos Agentes:\n${contribuicoes.join('\n\n')}`,
      }],
      output_config: { effort: 'low' },
    })
    conferirParada(final)
    const texto = textoDe(final)
    if (!texto) throw new ErroDoModelo('model_empty')
    await db.append(reserva.run_id, 'resposta', null, { texto })
  }

  return async (runId) => {
    const reserva = await db.claim(runId)
    if (!reserva) {
      log({ type: 'agent_run', runId, outcome: 'not_claimed' })
      return
    }
    try {
      if (reserva.kind === 'agente') await conversar(reserva)
      else await coordenar(reserva)
      await db.finish(runId, 'succeeded', null, modelo.nome)
      log({ type: 'agent_run', runId, kind: reserva.kind, outcome: 'succeeded' })
    } catch (error) {
      const codigo = error instanceof ErroDoModelo ? error.codigo : 'internal_error'
      log({
        type: 'agent_run',
        runId,
        kind: reserva.kind,
        outcome: 'failed',
        errorCode: codigo,
        message: String(error),
      })
      try {
        await db.finish(runId, 'failed', codigo, modelo.nome)
      } catch (erroAoFechar) {
        // A Execução já fechou (o prazo venceu) ou o banco caiu: a leitura seguinte a fecha como timeout.
        log({ type: 'agent_run', runId, outcome: 'finish_failed', message: String(erroAoFechar) })
      }
    }
  }
}
