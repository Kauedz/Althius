// As Conversas dos Agentes no Workspace operacional (CRM-14). O pedido vai à Edge Function agent-conversation, que o
// guarda no banco e roda a Execução depois de responder; os passos chegam lendo o banco (get_agent_run_events) a partir
// do último passo lido. Assim, recarregar a página ou perder a conexão só retoma a leitura: o pedido não roda de novo,
// e a mesma tentativa reenviada (mesmo clientRequestId) cai na mesma Execução. Falha é passo de falha, nunca resposta.

import type { SupabaseClient } from '@supabase/supabase-js'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'
import { reconhecerMencoes } from './mencoes'
import type {
  AgenteId,
  AnexoDaMensagem,
  ConversaDoSlack,
  ConversaDoWhatsApp,
  ConversaRetomada,
  ConversasRetomadas,
  FonteDeAgentes,
  LinkDoPasso,
  Mensagem,
  PassoDaConversa,
  PassoDaCoordenacao,
  ResumoDeConversa,
  Sugestao,
  TurnoRetomado,
} from './tipos'

type Tipo = 'agente' | 'coordenada'

/** De onde veio a Conversa: da Althius ou de um thread do Slack (slack-canal 06). */
type Origem = 'althius' | 'slack' | 'whatsapp'

interface Evento {
  seq: number
  kind: 'chamada' | 'ferramenta' | 'feito' | 'texto' | 'resposta' | 'falha'
  agent_id: string | null
  payload: { texto?: string; descricao?: string; estado?: string; motivo?: string; link?: unknown }
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
  | 'abrirConversaDoSlack'
  | 'abrirConversaDoWhatsApp'
  | 'historicoDeConversas'
  | 'arquivarConversa'
  | 'abrirConversaDoAgente'
  | 'novaConversaDoAgente'
  | 'conversaDoAgenteAtual'
  | 'sugestoesDoAgente'
  | 'anexarArquivo'
  | 'removerAnexo'
  | 'urlDoAnexo'
  | 'pararPedido'
>

interface ConversaListada {
  id: string
  kind: Tipo
  agent_id: string | null
  title: string | null
  named?: boolean
  first_request: string | null
  updated_at: string
  open_run_id: string | null
  origin?: Origem
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
  automation_cap_reached:
    'O teto mensal desta Rotina foi atingido, e a Execução parou antes de gastar mais. Um Administrador pode subir o teto em Configurações.',
  workspace_ai_key_invalid: 'O provedor de IA recusou a chave do Workspace. Avise o Administrador.',
  workspace_ai_key_unavailable: 'A chave de IA do Workspace não está disponível. Avise o Administrador.',
  workspace_ai_key_unsupported:
    'Este Workspace usa a própria chave de IA, e o motor dos Agentes ainda não a aceita. Avise o Administrador.',
  hermes_unreachable: 'O motor dos Agentes não respondeu. Confira se ele está ligado e tente de novo.',
  hermes_failed: 'O motor dos Agentes não conseguiu terminar este pedido. Tente de novo.',
  cancelled: 'Você parou este pedido.',
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
  if (kind === 'ferramenta') return { tipo: 'ferramenta', agenteId, descricao: descricaoDaConsulta(payload), ...linkDoPasso(payload) }
  if (kind === 'feito') return { tipo: 'feito', agenteId, resumo: payload.texto ?? '' }
  return null
}

export function passoDaConversa(evento: Evento): PassoDaConversa | null {
  const { kind, agent_id: agenteId, payload } = evento
  if (kind === 'falha') return { tipo: 'falha', motivo: mensagemDaFalha(payload.motivo) }
  if (!agenteId) return null
  if (kind === 'texto') return { tipo: 'texto', agenteId, texto: payload.texto ?? '' }
  if (kind === 'ferramenta') return { tipo: 'ferramenta', agenteId, descricao: descricaoDaConsulta(payload), ...linkDoPasso(payload) }
  return null
}

/** O link do passo de ferramenta (Etapa 5b), só nos tipos conhecidos; um link estranho é ignorado. */
function linkDoPasso(payload: Evento['payload']): { link?: LinkDoPasso } {
  const link = payload.link as { tipo?: unknown; id?: unknown } | undefined
  if (link?.tipo === 'descobertas') return { link: { tipo: 'descobertas' } }
  if (link?.tipo === 'aprovacao' && typeof link.id === 'string' && link.id) return { link: { tipo: 'aprovacao', id: link.id } }
  return {}
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
  // A Execução em curso de cada lugar (nulo = a Coordenação), para o Parar.
  const emCurso = new Map<AgenteId | null, string>()

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
    anexos: AnexoDaMensagem[] = [],
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
        ...(anexos.length ? { attachments: anexos.map((anexo) => anexo.id) } : {}),
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
    const inicio = await enviar(mensagem.texto, porAgente.get(agenteId) ?? null, agenteId, mensagem.anexos)
    if ('motivo' in inicio) {
      yield { tipo: 'falha', motivo: inicio.motivo }
      return
    }
    porAgente.set(agenteId, inicio.conversationId)
    emCurso.set(agenteId, inicio.runId)
    yield* acompanhar(inicio.runId, 0, passoDaConversa)
  }

  async function* conversarCoordenado(pedido: Mensagem, anteriores: Mensagem[]): AsyncGenerator<PassoDaCoordenacao> {
    const inicio = await enviar(pedido.texto, anteriores.length > 0 ? coordenada : null, null, pedido.anexos)
    if ('motivo' in inicio) {
      yield { tipo: 'falha', motivo: inicio.motivo }
      return
    }
    coordenada = inicio.conversationId
    emCurso.set(null, inicio.runId)
    yield* acompanhar(inicio.runId, 0, passoDaCoordenacao)
  }

  /** Os anexos de cada pedido da Conversa. Sem a função (migração ainda não aplicada) ou com falha, nenhum. */
  async function anexosDaConversa(id: string): Promise<Map<string, AnexoDaMensagem[]>> {
    const porExecucao = new Map<string, AnexoDaMensagem[]>()
    const { data, error } = await cliente.rpc('list_agent_conversation_attachments', { p_conversation_id: id })
    if (error || !Array.isArray(data)) return porExecucao
    for (const linha of data as { run_id: string; id: string; file_name: string; mime: string; size: number }[]) {
      const anexo: AnexoDaMensagem = {
        id: linha.id,
        nome: linha.file_name,
        mime: linha.mime,
        tamanho: Number(linha.size),
        tipo: linha.mime.startsWith('image/') ? 'imagem' : 'arquivo',
      }
      porExecucao.set(linha.run_id, [...(porExecucao.get(linha.run_id) ?? []), anexo])
    }
    return porExecucao
  }

  async function erroDaFuncao(error: unknown, padrao: string): Promise<Error> {
    const corpo = await corpoDoErroDaFuncao(error)
    if (typeof corpo?.error === 'string') return new Error(corpo.error)
    return new Error(`${padrao} ${await motivoDaFalhaDaFuncao('agent-attachments', error, 'APP_ORIGIN')}`)
  }

  async function anexarArquivo(arquivo: File): Promise<AnexoDaMensagem> {
    const corpo = new FormData()
    corpo.set('workspaceId', workspaceId)
    corpo.set('file', arquivo, arquivo.name)
    const { data, error } = await cliente.functions.invoke('agent-attachments', { body: corpo })
    if (error) throw await erroDaFuncao(error, 'Não foi possível anexar o arquivo.')
    const anexo = data as { id?: unknown; tipo?: unknown; mime?: unknown; tamanho?: unknown } | null
    if (typeof anexo?.id !== 'string') throw new Error('Não foi possível anexar o arquivo.')
    return {
      id: anexo.id,
      nome: arquivo.name || 'anexo',
      mime: typeof anexo.mime === 'string' ? anexo.mime : arquivo.type,
      tamanho: typeof anexo.tamanho === 'number' ? anexo.tamanho : arquivo.size,
      tipo: anexo.tipo === 'imagem' ? 'imagem' : 'arquivo',
    }
  }

  async function removerAnexo(id: string): Promise<void> {
    await cliente.functions.invoke('agent-attachments', { body: { action: 'remove', attachmentId: id } })
  }

  async function urlDoAnexo(id: string): Promise<string> {
    const { data, error } = await cliente.functions.invoke('agent-attachments', { body: { action: 'url', attachmentId: id } })
    if (error) throw await erroDaFuncao(error, 'Não foi possível abrir o anexo.')
    const url = (data as { url?: unknown } | null)?.url
    if (typeof url !== 'string') throw new Error('Não foi possível abrir o anexo.')
    return url
  }

  async function pararPedido(agenteId: AgenteId | null): Promise<void> {
    const runId = emCurso.get(agenteId)
    if (!runId) return
    const { error } = await cliente.rpc('cancel_agent_run', { p_run_id: runId })
    if (error) throw new Error('Não foi possível parar o pedido. Tente de novo.')
  }

  /** Uma Conversa salva: os pedidos terminados com os passos, e a leitura do que ainda está rodando. */
  async function lerConversa<P>(
    id: string,
    converter: (evento: Evento) => P | null,
    lugar: AgenteId | null,
    registrarEmCurso = true,
  ) {
    const { data, error } = await cliente.rpc('get_agent_conversation', { p_conversation_id: id })
    if (error) throw new Error('Não foi possível carregar a Conversa.')
    const salva = data as { agent_id: string | null; origin?: Origem; runs: ExecucaoSalva[] }
    const execucoes = salva.runs
    const anexos = await anexosDaConversa(id)
    const turnos: TurnoRetomado<P>[] = execucoes.map((execucao) => ({
      pedido: execucao.request_text,
      passos: execucao.events.flatMap((evento) => converter(evento) ?? []),
      ...(anexos.get(execucao.id)?.length ? { anexos: anexos.get(execucao.id) } : {}),
    }))
    const aberta = execucoes.at(-1)
    const emAndamento = aberta && !terminou(aberta.status)
      ? acompanhar(aberta.id, aberta.events.at(-1)?.seq ?? 0, converter)
      : undefined
    if (registrarEmCurso && aberta && emAndamento) emCurso.set(lugar, aberta.id)
    return { turnos, emAndamento, agenteId: salva.agent_id, origem: salva.origin ?? 'althius' }
  }

  async function retomarConversas(): Promise<ConversasRetomadas> {
    const { data, error } = await cliente.rpc('list_agent_conversations', { p_workspace_id: workspaceId })
    if (error) throw new Error('Não foi possível carregar as Conversas.')
    // A Conversa do Slack continua no thread: a página do Agente retoma só a da Althius.
    const linhas = (data as { id: string; kind: Tipo; agent_id: string | null; origin?: Origem }[])
      .filter((linha) => linha.origin !== 'slack' && linha.origin !== 'whatsapp')
    // A mais recente de cada lugar, como estava antes de recarregar.
    const ultimaCoordenada = linhas.find((linha) => linha.kind === 'coordenada')
    const ultimas = new Map<AgenteId, string>()
    for (const linha of linhas) {
      if (linha.kind === 'agente' && linha.agent_id && !ultimas.has(linha.agent_id)) ultimas.set(linha.agent_id, linha.id)
    }
    const retomadas: ConversasRetomadas = { coordenada: null, porAgente: {} }
    if (ultimaCoordenada) {
      coordenada = ultimaCoordenada.id
      const { turnos, emAndamento } = await lerConversa(ultimaCoordenada.id, passoDaCoordenacao, null)
      retomadas.coordenada = { turnos, emAndamento }
    }
    for (const [agenteId, id] of ultimas) {
      porAgente.set(agenteId, id)
      const { turnos, emAndamento } = await lerConversa(id, passoDaConversa, agenteId)
      retomadas.porAgente[agenteId] = { turnos, emAndamento }
    }
    return retomadas
  }

  /**
   * O histórico de quem pede com um Agente (ou com a Coordenação, sem Agente), da mais recente à mais antiga, sem as
   * arquivadas. A página seguinte pede as anteriores a `antesDe`.
   */
  async function historicoDeConversas(agenteId: AgenteId | null, antesDe?: string): Promise<ResumoDeConversa[]> {
    const { data, error } = await cliente.rpc('list_agent_conversations_of_agent', {
      p_workspace_id: workspaceId,
      p_agent_id: agenteId,
      p_limit: 30,
      p_before: antesDe ?? null,
    })
    if (error) throw new Error('Não foi possível carregar as Conversas.')
    return (data as ConversaListada[]).map((linha) => {
      const doSlack = linha.origin === 'slack' && linha.agent_id ? { agenteId: linha.agent_id } : undefined
      return {
        id: linha.id,
        titulo: linha.named ? linha.title : null,
        primeiroPedido: linha.first_request ?? '',
        atualizadaEm: linha.updated_at,
        emAndamento: linha.open_run_id !== null,
        ...(doSlack ? { doSlack } : {}),
        ...(linha.origin === 'whatsapp' ? { doWhatsapp: true as const } : {}),
      }
    })
  }

  /** As Conversas coordenadas salvas, da mais recente à mais antiga. */
  async function conversasSalvas(): Promise<ResumoDeConversa[]> {
    return historicoDeConversas(null)
  }

  async function arquivarConversa(id: string): Promise<void> {
    const { error } = await cliente.rpc('archive_agent_conversation', { p_conversation_id: id })
    if (!error) {
      if (coordenada === id) coordenada = null
      for (const [agenteId, conversa] of porAgente) if (conversa === id) porAgente.delete(agenteId)
      return
    }
    if (error.code === 'P0002') throw new Error('Esta Conversa não existe mais.')
    throw new Error('Não foi possível arquivar a Conversa. Tente de novo.')
  }

  /** Abre uma Conversa salva com o Agente: o próximo pedido a ele continua esta. */
  async function abrirConversaDoAgente(agenteId: AgenteId, id: string): Promise<ConversaRetomada<PassoDaConversa>> {
    const conversa = await lerConversa(id, passoDaConversa, agenteId)
    porAgente.set(agenteId, id)
    return conversa
  }

  /** As sugestões de pedido do Agente, a partir dos dados do Workspace. Sem resposta, nenhuma. */
  async function sugestoesDoAgente(agenteId: AgenteId): Promise<Sugestao[]> {
    const { data, error } = await cliente.rpc('agent_prompt_suggestions', { p_workspace_id: workspaceId, p_agent_id: agenteId })
    if (error || !Array.isArray(data)) return []
    return (data as { id?: unknown; texto?: unknown }[])
      .filter((item) => typeof item.id === 'string' && typeof item.texto === 'string')
      .map((item) => ({ id: `dados-${item.id as string}`, texto: item.texto as string }))
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
    const { turnos, emAndamento } = await lerConversa(id, passoDaCoordenacao, null)
    coordenada = id
    return { turnos, emAndamento }
  }

  /** Só lê: a Conversa do Slack continua no thread, e nenhum pedido daqui a continua. */
  async function abrirConversaDoSlack(id: string): Promise<ConversaDoSlack> {
    const { turnos, emAndamento, agenteId, origem } = await lerConversa(id, passoDaConversa, null, false)
    if (origem !== 'slack' || !agenteId) throw new Error('Esta Conversa não veio do Slack.')
    return { turnos, emAndamento, agenteId }
  }

  /** Abre só para leitura: as Conversas do WhatsApp continuam pelo Canal, nunca pelo composer do app. */
  async function abrirConversaDoWhatsApp(id: string): Promise<ConversaDoWhatsApp> {
    const { turnos, emAndamento, origem } = await lerConversa(id, passoDaCoordenacao, null, false)
    if (origem !== 'whatsapp') throw new Error('Esta Conversa não veio do WhatsApp.')
    return { turnos, emAndamento }
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
    abrirConversaDoSlack,
    abrirConversaDoWhatsApp,
    historicoDeConversas,
    arquivarConversa,
    abrirConversaDoAgente,
    novaConversaDoAgente: (agenteId) => {
      porAgente.delete(agenteId)
    },
    conversaDoAgenteAtual: (agenteId) => porAgente.get(agenteId) ?? null,
    sugestoesDoAgente,
    anexarArquivo,
    removerAnexo,
    urlDoAnexo,
    pararPedido,
  }
}
