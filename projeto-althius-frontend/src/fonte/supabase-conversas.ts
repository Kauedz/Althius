// As Conversas dos Agentes no Workspace operacional (CRM-14). O pedido vai à Edge Function agent-conversation, que o
// guarda no banco e roda a Execução depois de responder; os passos chegam lendo o banco (get_agent_run_events) a partir
// do último passo lido. Assim, recarregar a página ou perder a conexão só retoma a leitura: o pedido não roda de novo,
// e a mesma tentativa reenviada (mesmo clientRequestId) cai na mesma Execução. Falha é passo de falha, nunca resposta.

import type { SupabaseClient } from '@supabase/supabase-js'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'
import { reconhecerMencoes } from './mencoes'
import type {
  AgenteId,
  ConversaRetomada,
  ConversasRetomadas,
  FonteDeAgentes,
  Mensagem,
  PassoDaConversa,
  PassoDaCoordenacao,
  ResumoDeConversa,
  TurnoRetomado,
} from './tipos'

type Tipo = 'agente' | 'coordenada'

interface Evento {
  seq: number
  kind: 'chamada' | 'ferramenta' | 'feito' | 'texto' | 'resposta' | 'falha'
  agent_id: string | null
  payload: { texto?: string; descricao?: string; estado?: string; motivo?: string }
}

interface Leitura {
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  error_code: string | null
  events: Evento[]
}

interface ExecucaoSalva {
  id: string
  request_text: string
  status: Leitura['status']
  events: Evento[]
}

type Fonte = Pick<
  FonteDeAgentes,
  | 'conversar'
  | 'conversarCoordenado'
  | 'sugestoesCoordenadas'
  | 'retomarConversas'
  | 'conversasSalvas'
  | 'renomearConversa'
  | 'abrirConversa'
  | 'conversaCoordenadaAtual'
>

interface ConversaListada {
  id: string
  kind: Tipo
  title: string | null
  first_request: string | null
  updated_at: string
  open_run_id: string | null
}

const MOTIVOS: Record<string, string> = {
  timeout: 'O pedido passou do tempo e foi interrompido. Tente de novo.',
  model_refusal: 'O modelo recusou este pedido.',
  model_incomplete: 'A resposta ficou longa demais e foi cortada. Tente um pedido menor.',
  model_rate_limited: 'O modelo está sobrecarregado agora. Tente de novo em alguns minutos.',
  model_auth: 'A chave do modelo não vale. Avise o Administrador.',
  model_timeout: 'O modelo não respondeu a tempo. Tente de novo.',
  model_unreachable: 'Não foi possível falar com o modelo. Tente de novo.',
  membership_inactive: 'Você não participa mais deste Workspace.',
  insufficient_credits:
    'O Workspace está sem créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.',
  hermes_unreachable: 'O motor dos Agentes não respondeu. Confira se ele está ligado e tente de novo.',
  hermes_failed: 'O motor dos Agentes não conseguiu terminar este pedido. Tente de novo.',
}

/** O motivo gravado na Execução, em palavras de quem pediu. */
export function mensagemDaFalha(codigo: string | null | undefined): string {
  return (codigo && MOTIVOS[codigo]) || 'Não foi possível responder agora.'
}

export function passoDaCoordenacao(evento: Evento): PassoDaCoordenacao | null {
  const { kind, agent_id: agenteId, payload } = evento
  if (kind === 'resposta') return { tipo: 'resposta', texto: payload.texto ?? '' }
  if (kind === 'falha') return { tipo: 'falha', motivo: mensagemDaFalha(payload.motivo) }
  if (!agenteId) return null
  if (kind === 'chamada') return { tipo: 'chamada', agenteId }
  if (kind === 'ferramenta') return { tipo: 'ferramenta', agenteId, descricao: descricaoDaConsulta(payload) }
  if (kind === 'feito') return { tipo: 'feito', agenteId, resumo: payload.texto ?? '' }
  return null
}

export function passoDaConversa(evento: Evento): PassoDaConversa | null {
  const { kind, agent_id: agenteId, payload } = evento
  if (kind === 'falha') return { tipo: 'falha', motivo: mensagemDaFalha(payload.motivo) }
  if (!agenteId) return null
  if (kind === 'texto') return { tipo: 'texto', agenteId, texto: payload.texto ?? '' }
  if (kind === 'ferramenta') return { tipo: 'ferramenta', agenteId, descricao: descricaoDaConsulta(payload) }
  return null
}

function descricaoDaConsulta(payload: Evento['payload']): string {
  const descricao = payload.descricao ?? 'Consulta'
  return payload.estado === 'falhou' ? `${descricao} (falhou)` : descricao
}

/**
 * Se o Workspace operacional tem Conversas: a Edge Function responde se o modelo está configurado. Qualquer falha
 * (função não publicada, sem rede) conta como indisponível, e a tela diz isso em vez de simular.
 */
export async function conversasDisponiveis(cliente: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await cliente.functions.invoke('agent-conversation', { body: { action: 'capability' } })
    return !error && (data as { available?: unknown } | null)?.available === true
  } catch {
    return false
  }
}

const terminou = (status: Leitura['status']) => status === 'succeeded' || status === 'failed'

export function criarFonteDeConversasSupabase(
  cliente: SupabaseClient,
  workspaceId: string,
  { agentes, intervaloMs = 1500 }: { agentes: () => Promise<{ id: AgenteId; nome: string }[]>; intervaloMs?: number },
): Fonte {
  // A Conversa em curso de cada lugar: a do composer e a de cada Agente. Recarregar a página as recupera do banco.
  let coordenada: string | null = null
  const porAgente = new Map<AgenteId, string>()

  const esperar = () => new Promise((resolver) => setTimeout(resolver, intervaloMs))

  /** Lê os passos de uma Execução a partir de `depois`, até ela terminar. Sem conexão por um tempo, avisa e para. */
  async function* acompanhar<P>(runId: string, depois: number, converter: (evento: Evento) => P | null) {
    let ultimo = depois
    let falhasSeguidas = 0
    let viuFalha = false
    for (;;) {
      const { data, error } = await cliente.rpc('get_agent_run_events', { p_run_id: runId, p_after_seq: ultimo })
      if (error) {
        if (++falhasSeguidas >= 5) {
          yield { tipo: 'falha', motivo: 'Perdi a conexão com o Workspace. Recarregue a página para acompanhar a resposta.' } as P
          return
        }
        await esperar()
        continue
      }
      falhasSeguidas = 0
      const leitura = data as Leitura
      for (const evento of leitura.events) {
        ultimo = evento.seq
        if (evento.kind === 'falha') viuFalha = true
        const passo = converter(evento)
        if (passo) yield passo
      }
      if (terminou(leitura.status)) {
        // O banco sempre grava a falha como passo; se ela não veio, a tela ainda diz que falhou.
        if (leitura.status === 'failed' && !viuFalha) yield { tipo: 'falha', motivo: mensagemDaFalha(leitura.error_code) } as P
        return
      }
      await esperar()
    }
  }

  /** Guarda o pedido pela função. Devolve a Execução, ou o motivo para a pessoa quando foi recusado. */
  async function enviar(
    texto: string,
    conversa: string | null,
    agenteId: AgenteId | null,
  ): Promise<{ conversationId: string; runId: string } | { motivo: string }> {
    const mencionados = reconhecerMencoes(texto, await agentes().catch(() => [])).map((agente) => agente.id)
    const { data, error } = await cliente.functions.invoke('agent-conversation', {
      body: {
        action: 'send',
        workspaceId,
        conversationId: conversa,
        agentId: agenteId,
        text: texto,
        mentions: mencionados.slice(0, 4),
        clientRequestId: crypto.randomUUID(),
      },
    })
    if (error) {
      const corpo = await corpoDoErroDaFuncao(error)
      if (typeof corpo?.error === 'string') return { motivo: corpo.error }
      return { motivo: await motivoDaFalhaDaFuncao('agent-conversation', error, 'ANTHROPIC_API_KEY e APP_ORIGIN') }
    }
    return data as { conversationId: string; runId: string }
  }

  async function* conversar(agenteId: AgenteId, mensagem: Mensagem): AsyncGenerator<PassoDaConversa> {
    const inicio = await enviar(mensagem.texto, porAgente.get(agenteId) ?? null, agenteId)
    if ('motivo' in inicio) {
      yield { tipo: 'falha', motivo: inicio.motivo }
      return
    }
    porAgente.set(agenteId, inicio.conversationId)
    yield* acompanhar(inicio.runId, 0, passoDaConversa)
  }

  async function* conversarCoordenado(pedido: Mensagem, anteriores: Mensagem[]): AsyncGenerator<PassoDaCoordenacao> {
    const inicio = await enviar(pedido.texto, anteriores.length > 0 ? coordenada : null, null)
    if ('motivo' in inicio) {
      yield { tipo: 'falha', motivo: inicio.motivo }
      return
    }
    coordenada = inicio.conversationId
    yield* acompanhar(inicio.runId, 0, passoDaCoordenacao)
  }

  /** Uma Conversa salva: os pedidos terminados com os passos, e a leitura do que ainda está rodando. */
  async function lerConversa<P>(id: string, converter: (evento: Evento) => P | null) {
    const { data, error } = await cliente.rpc('get_agent_conversation', { p_conversation_id: id })
    if (error) throw new Error('Não foi possível carregar a Conversa.')
    const execucoes = (data as { runs: ExecucaoSalva[] }).runs
    const turnos: TurnoRetomado<P>[] = execucoes.map((execucao) => ({
      pedido: execucao.request_text,
      passos: execucao.events.flatMap((evento) => converter(evento) ?? []),
    }))
    const aberta = execucoes.at(-1)
    const emAndamento = aberta && !terminou(aberta.status)
      ? acompanhar(aberta.id, aberta.events.at(-1)?.seq ?? 0, converter)
      : undefined
    return { turnos, emAndamento }
  }

  async function retomarConversas(): Promise<ConversasRetomadas> {
    const { data, error } = await cliente.rpc('list_agent_conversations', { p_workspace_id: workspaceId })
    if (error) throw new Error('Não foi possível carregar as Conversas.')
    const linhas = data as { id: string; kind: Tipo; agent_id: string | null }[]
    // A mais recente de cada lugar, como estava antes de recarregar.
    const ultimaCoordenada = linhas.find((linha) => linha.kind === 'coordenada')
    const ultimas = new Map<AgenteId, string>()
    for (const linha of linhas) {
      if (linha.kind === 'agente' && linha.agent_id && !ultimas.has(linha.agent_id)) ultimas.set(linha.agent_id, linha.id)
    }
    const retomadas: ConversasRetomadas = { coordenada: null, porAgente: {} }
    if (ultimaCoordenada) {
      coordenada = ultimaCoordenada.id
      retomadas.coordenada = await lerConversa(ultimaCoordenada.id, passoDaCoordenacao)
    }
    for (const [agenteId, id] of ultimas) {
      porAgente.set(agenteId, id)
      retomadas.porAgente[agenteId] = await lerConversa(id, passoDaConversa)
    }
    return retomadas
  }

  /** As Conversas coordenadas salvas, da mais recente à mais antiga. */
  async function conversasSalvas(): Promise<ResumoDeConversa[]> {
    const { data, error } = await cliente.rpc('list_named_agent_conversations', { p_workspace_id: workspaceId })
    if (error) throw new Error('Não foi possível carregar as Conversas.')
    return (data as ConversaListada[])
      .filter((linha) => linha.kind === 'coordenada')
      .map((linha) => ({
        id: linha.id,
        titulo: linha.title,
        primeiroPedido: linha.first_request ?? '',
        atualizadaEm: linha.updated_at,
        emAndamento: linha.open_run_id !== null,
      }))
  }

  async function renomearConversa(id: string, titulo: string): Promise<void> {
    const { error } = await cliente.rpc('rename_agent_conversation', { p_conversation_id: id, p_title: titulo })
    if (!error) return
    if (error.code === '22023') throw new Error('O nome pode ter até 80 caracteres.')
    if (error.code === 'P0002') throw new Error('Esta Conversa não existe mais.')
    throw new Error('Não foi possível renomear a Conversa. Tente de novo.')
  }

  /** Abre uma Conversa salva: o próximo pedido da Coordenação passa a continuar esta. */
  async function abrirConversa(id: string): Promise<ConversaRetomada<PassoDaCoordenacao>> {
    const conversa = await lerConversa(id, passoDaCoordenacao)
    coordenada = id
    return conversa
  }

  return {
    conversar,
    conversarCoordenado,
    // Sem roteiros no Workspace operacional: as sugestões clicáveis são da Demonstração.
    sugestoesCoordenadas: async () => [],
    retomarConversas,
    conversasSalvas,
    renomearConversa,
    abrirConversa,
    conversaCoordenadaAtual: () => coordenada,
  }
}
