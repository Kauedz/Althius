// A Execução de um pedido (CRM-14), depois que ele está guardado na fila. Reserva a Execução no banco, roda o Agente da
// página ou a Coordenação (ADR-0004) e grava cada passo antes do seguinte, para a tela acompanhar pelo banco. Termina
// com sucesso só depois de gravar a resposta; qualquer falha do modelo, da ferramenta ou do banco fecha a Execução como
// falha, com o motivo, sem resposta inventada. Banco e modelo entram por injeção de dependência, para o teste rodar sem
// rede.
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import {
  criarSessaoDeFerramentas,
  type DepsDasFerramentas,
  eventoDoPasso,
  type SessaoDeFerramentas,
  textoDoMural,
} from '../_shared/ferramentas-dos-agentes.ts'
import {
  type AgenteDoWorkspace,
  type ChaveDoCliente,
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
  registrarCustoDaExecucao,
  type Reserva,
  type ResultadoDoAgente,
  type RunDb,
  semAChave,
  type TipoDeEvento,
  somarUso,
  type UsoDeTokens,
} from '../_shared/orquestracao.ts'

// O contrato com o banco e as falhas do modelo moram no módulo compartilhado; quem já importava daqui continua igual.
export { ErroDoModelo }
export type { AgenteDoWorkspace, ChaveDoCliente, ContaEncontrada, Reserva, RunDb, TipoDeEvento }

export interface Modelo {
  /** O id do modelo, gravado na Execução. */
  nome: string
  /** Uma chamada à Messages API. Lança ErroDoModelo quando a API recusa ou não responde. */
  criar(
    params: Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, 'model'>,
  ): Promise<Anthropic.Beta.Messages.BetaMessage>
}

export interface RunnerDeps {
  db: RunDb
  /** O modelo da Althius, de quem não ligou a chave de IA do próprio cliente. */
  modelo: Modelo
  /** O modelo com a chave do cliente; null quando o provedor dela não é aceito aqui. */
  modeloDoCliente?: (chave: ChaveDoCliente) => Modelo | null
  log?: (fields: Record<string, unknown>) => void
  /**
   * As ferramentas dos Agentes (Etapa 5b): buscar contas pelo ICP, ler o Workspace, consultar uma Integração e propor
   * Enviar ao CRM. Sem elas, o Agente só consulta as Contas-alvo, como antes.
   */
  ferramentas?: DepsDasFerramentas
}

/**
 * A Execução do Canal Slack (slack-canal 03) roda só com o Agente do fio: um fio, um Agente (Q20). Sem os outros Agentes
 * na reserva, ninguém entra por Menção, nem pela do pedido nem pela que o Agente escrever (o "Agente chama Agente" do
 * PR-11 não vale no Canal).
 */
function soComOAgenteDoFio(reserva: Reserva): Reserva {
  if ((reserva as Reserva & { trigger_kind?: string }).trigger_kind !== 'canal') return reserva
  return { ...reserva, mentions: [], agents: reserva.agents.filter((agente) => agente.id === reserva.agent_id) }
}

const MAX_TOKENS = 16000
/** Rodadas de ferramenta por Agente num pedido. */
const MAX_RODADAS = 4

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

/** As regras quando o Agente tem as ferramentas: ele age, mas só pelo que elas permitem, e diz o que fez. */
const REGRAS_COM_FERRAMENTAS = [
  'Responda em português do Brasil, direto e sem enrolação.',
  'Nunca invente dados, números, nomes ou fatos. Se não souber, ou se a ferramenta não trouxer, diga que não sabe.',
  'Os dados do Workspace e das Integrações só chegam pelas ferramentas que você recebeu. Use-as para agir: ler as ' +
  'Contas-alvo e os Sinais, consultar o CRM, pedir buscas, propor envios e propor mudanças no Playbook. Você não age ' +
  'fora delas. Uma ação ou mudança que precisa de Aprovação só vale depois que um Administrador aprovar: diga isso, sem ' +
  'fingir que já foi feita. Diga em ' +
  'uma frase o que você fez com cada ferramenta.',
].join('\n')

function systemDoAgente(agente: AgenteDoWorkspace, workspace: string, playbook = '', comFerramentas = false): string {
  return [
    `Você é ${agente.name}, um Agente da Althius no Workspace "${workspace}".`,
    ESPECIALIDADES[agente.specialty] ?? '',
    agente.instructions ? `Instruções do Workspace para você:\n${agente.instructions}` : '',
    agente.voice_tone ? `Tom de voz: ${agente.voice_tone}` : '',
    playbook,
    comFerramentas ? REGRAS_COM_FERRAMENTAS : REGRAS,
    INSTRUCAO_DE_DESFECHO,
  ].filter(Boolean).join('\n\n')
}

function ferramentasDoModelo(sessao: SessaoDeFerramentas | null, agente: AgenteDoWorkspace): Anthropic.Beta.Messages.BetaTool[] {
  if (!sessao) return []
  return sessao.paraOAgente(agente).map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.esquema as Anthropic.Beta.Messages.BetaTool['input_schema'],
  }))
}

function textoDe(resposta: Anthropic.Beta.Messages.BetaMessage): string {
  return resposta.content.flatMap((bloco) => (bloco.type === 'text' ? [bloco.text] : [])).join('\n').trim()
}

/** O que a chamada gastou, quando o motor informa (a Messages API informa; os testes e alguns motores não). */
export function usoDe(resposta: Anthropic.Beta.Messages.BetaMessage): UsoDeTokens | undefined {
  const uso = resposta.usage as { input_tokens?: number; output_tokens?: number } | undefined
  if (typeof uso?.input_tokens !== 'number' || typeof uso?.output_tokens !== 'number') return undefined
  return { entrada: uso.input_tokens, saida: uso.output_tokens }
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

/**
 * O modelo do cliente por dentro: um provedor que recusa a chave dá à Execução o motivo da chave, não o do modelo da
 * Althius, e nada do que ele devolver leva a chave para o log ou para o motivo da Execução.
 */
export function comAChaveDoCliente(modelo: Modelo, apiKey: string): Modelo {
  return {
    nome: modelo.nome,
    async criar(params) {
      try {
        return await modelo.criar(params)
      } catch (erro) {
        if (erro instanceof ErroDoModelo) {
          if (erro.codigo === 'model_auth') throw new ErroDoModelo('workspace_ai_key_invalid')
          throw new ErroDoModelo(erro.codigo, semAChave(erro.detalhe, apiKey))
        }
        throw new Error(semAChave(String(erro), apiKey))
      }
    },
  }
}

export function createRunner(deps: RunnerDeps): (runId: string) => Promise<void> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const { db } = deps

  /**
   * O modelo desta Execução: o do cliente, quando o Workspace ligou a chave de IA dele; senão o da Althius. Chave
   * ligada que não dá para usar falha com o motivo, em vez de a Execução cair no modelo da Althius às custas dela.
   */
  async function modeloDaExecucao(runId: string): Promise<Modelo> {
    const chave = await db.chaveDoCliente?.(runId)
    if (!chave) return deps.modelo
    const doCliente = deps.modeloDoCliente?.(chave)
    if (!doCliente) throw new ErroDoModelo('workspace_ai_key_unsupported')
    return comAChaveDoCliente(doCliente, chave.apiKey)
  }

  /** Um Agente trabalha no pedido, com a consulta de Contas-alvo, e devolve o texto final dele. */
  async function trabalhar(
    modelo: Modelo,
    reserva: Reserva,
    agente: AgenteDoWorkspace,
    contribuicoes: string[],
    playbook = '',
    sessao: SessaoDeFerramentas | null = null,
  ): Promise<ResultadoDoAgente> {
    const mural = sessao ? textoDoMural(sessao.mural()) : ''
    const pedido = [
      reserva.request_text,
      contribuicoes.length ? `O que outros Agentes já responderam neste pedido:\n${contribuicoes.join('\n\n')}` : '',
      mural,
    ].filter(Boolean).join('\n\n')
    const mensagens: Anthropic.Beta.Messages.BetaMessageParam[] = [...historicoDaConversa(reserva), {
      role: 'user',
      content: pedido,
    }]
    let uso: UsoDeTokens | undefined
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const resposta = await modelo.criar({
        max_tokens: MAX_TOKENS,
        system: systemDoAgente(agente, reserva.workspace_name, playbook, !!sessao),
        tools: [BUSCAR_CONTAS, ...ferramentasDoModelo(sessao, agente)],
        messages: mensagens,
        output_config: { effort: 'medium' },
      })
      conferirParada(resposta)
      uso = somarUso(uso, usoDe(resposta))
      const chamadas = resposta.content.filter((bloco) => bloco.type === 'tool_use')
      if (resposta.stop_reason !== 'tool_use' || chamadas.length === 0) {
        const texto = textoDe(resposta)
        if (!texto) throw new ErroDoModelo('model_empty')
        return { texto, uso }
      }
      mensagens.push({ role: 'assistant', content: resposta.content })
      const resultados: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
      for (const chamada of chamadas) {
        if (chamada.type !== 'tool_use') continue
        if (sessao && chamada.name !== BUSCAR_CONTAS.name && sessao.conhece(chamada.name)) {
          // Uma ferramenta do catálogo: a sessão confere quem pode, executa e nunca lança.
          const r = await sessao.chamar(agente, chamada.name, chamada.input)
          await db.append(reserva.run_id, 'ferramenta', agente.id, eventoDoPasso(chamada.name, r.passo))
          resultados.push({
            type: 'tool_result',
            tool_use_id: chamada.id,
            content: r.paraOAgente,
            ...(r.erro ? { is_error: true } : {}),
          })
          continue
        }
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

  /** A Coordenação escolhe os Agentes do pedido, sempre com os @mencionados, sem agir ela mesma. */
  async function escolher(
    modelo: Modelo,
    reserva: Reserva,
  ): Promise<{ agentes: string[]; resposta_direta: string; uso?: UsoDeTokens }> {
    const lista = reserva.agents
      .map((agente) => `- ${agente.id}: ${agente.name} (${ESPECIALIDADES[agente.specialty] ?? agente.specialty})`)
      .join('\n')
    const resposta = await modelo.criar({
      max_tokens: MAX_TOKENS,
      system: [
        'Você é a Coordenação da Althius. Você não é um Agente: você só escolhe quais Agentes trabalham no pedido.',
        'Os Agentes consultam os dados do Workspace (as Contas-alvo) e fazem o trabalho da Especialidade deles. Todo ' +
        'pedido sobre dados do Workspace (Contas-alvo, empresas, clientes, prospecção) ou sobre ICP, Personas, textos ' +
        'e presença da marca precisa de pelo menos um Agente: na dúvida, chame o Scopus.',
        'Escolha até 3 Agentes pelo id. Chame um Agente padrão, a menos que o pedido cite um Agente criado. Só se o ' +
        'pedido for uma saudação ou uma dúvida sobre como usar a Althius, não chame ninguém e escreva resposta_direta; ' +
        'nos outros casos, deixe resposta_direta vazia.',
        `Agentes do Workspace "${reserva.workspace_name}":\n${lista}`,
        'Responda em português do Brasil. Nunca invente dados.',
      ].join('\n\n'),
      messages: [...historicoDaConversa(reserva), { role: 'user', content: reserva.request_text }],
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
      return { ...escolha, uso: usoDe(resposta) }
    } catch {
      throw new ErroDoModelo('model_invalid_output')
    }
  }

  /** Juntar o que os Agentes disseram numa resposta só, sem acrescentar fato que eles não trouxeram. */
  async function sintetizar(
    modelo: Modelo,
    reserva: Reserva,
    contribuicoes: string[],
  ): Promise<{ texto: string; uso?: UsoDeTokens }> {
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
    return { texto: textoDe(final), uso: usoDe(final) }
  }

  /** O que muda no motor da ponte: as chamadas à Messages API. A ordem e os eventos são de _shared/orquestracao.ts. */
  function executorDe(modelo: Modelo, reserva: Reserva, sessao: SessaoDeFerramentas | null): Executor {
    const playbookDe = leitorDoPlaybook(db, reserva.run_id, log, 'agent_run')
    return {
      escolher: () => escolher(modelo, reserva),
      trabalhar: async (agente, falas) =>
        trabalhar(modelo, reserva, agente, contribuicoesDe(falas), await playbookDe(agente.specialty), sessao),
      sintetizar: (falas) => sintetizar(modelo, reserva, contribuicoesDe(falas)),
    }
  }

  /**
   * As ferramentas desta Execução, com o contexto (Workspace, quem pediu, Permissões) lido uma vez. Sem o contexto, o
   * pedido roda como antes, só com a consulta de Contas-alvo, e a falha vai ao log.
   */
  async function sessaoDaExecucao(runId: string): Promise<SessaoDeFerramentas | null> {
    if (!deps.ferramentas) return null
    try {
      const ctx = await deps.ferramentas.banco.contexto(runId)
      return criarSessaoDeFerramentas(deps.ferramentas, { runId, ctx })
    } catch (error) {
      log({ type: 'agent_run', runId, outcome: 'tools_context_failed', message: String(error) })
      return null
    }
  }

  return async (runId) => {
    const reservada = await db.claim(runId)
    if (!reservada) {
      log({ type: 'agent_run', runId, outcome: 'not_claimed' })
      return
    }
    const reserva = soComOAgenteDoFio(reservada)
    let modelo = deps.modelo
    try {
      modelo = await modeloDaExecucao(runId)
      const executor = executorDe(modelo, reserva, await sessaoDaExecucao(runId))
      if (reserva.kind === 'agente') await conversarNaPagina({ reserva, db, executor })
      else await coordenarPedido({ reserva, db, executor })
      await db.finish(runId, 'succeeded', null, modelo.nome)
      log({ type: 'agent_run', runId, kind: reserva.kind, outcome: 'succeeded' })
      await registrarCustoDaExecucao(db, runId, log, 'agent_run')
    } catch (error) {
      const codigo = codigoDoErro(error)
      log({
        type: 'agent_run',
        runId,
        kind: reserva.kind,
        outcome: 'failed',
        errorCode: codigo,
        message: String(error),
      })
      await fecharComFalha({ db, runId, codigo, modelo: modelo.nome, log, tipoDoLog: 'agent_run' })
      await registrarCustoDaExecucao(db, runId, log, 'agent_run')
    }
  }
}
