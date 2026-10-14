// A porta das Conversas dos Agentes (CRM-14). O navegador manda o pedido com o JWT de quem pede: a função o guarda no
// banco com a sessão dessa pessoa (start_agent_run confere a Participação, o Agente, as menções e a Conversa) e responde
// logo, com a Execução na fila. A Execução continua depois da resposta (waitUntil), e a tela acompanha os passos pelo
// banco, não por esta conexão. Sem a chave do modelo, a capacidade responde indisponível e nenhum pedido é guardado.
//
// E o Enviar ao CRM pelos Agentes (ADR-0023): com o CRM conectado pela autorização (servidor MCP), o Vendedor responsável
// pede, com o JWT dele,
//   POST { action: 'enviar_ao_crm', workspaceId, targetAccountId, integrationId, clientRequestId }
// e `begin_crm_handoff_by_agents` confere tudo no banco, monta o pacote, cria a Conversa e a Execução com ele e abre a
// tentativa ligada à Execução. A Execução roda como qualquer pedido; os Agentes escrevem pelas ferramentas do conector.
import { comCors } from '../_shared/cors.ts'

export type Inicio =
  | { kind: 'started'; conversationId: string; runId: string; status: string }
  /** Outro pedido desta Conversa ainda está rodando. */
  | { kind: 'busy' }
  /** A Conversa ou o Agente não existem para quem pede. */
  | { kind: 'not_found' }
  /** Quem pede não participa do Workspace. */
  | { kind: 'forbidden' }
  | { kind: 'invalid' }

export interface Pedido {
  authorization: string
  apikey: string
  workspaceId: string
  conversationId: string | null
  agentId: string | null
  text: string
  mentions: string[]
  clientRequestId: string
  /** Os anexos já subidos pela agent-attachments (PR-10), até 5. */
  attachments?: string[]
}

export interface PedidoDeEnvioAoCrm {
  userId: string
  workspaceId: string
  targetAccountId: string
  integrationId: string
  clientRequestId: string
}

export type InicioDoEnvioAoCrm =
  | { kind: 'started'; conversationId: string; runId: string; status: string }
  /** O banco recusou: a mensagem já está em palavras do produto. */
  | { kind: 'recusado'; httpStatus: number; code: string; mensagem: string }

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC start_agent_run, com a sessão de quem pede. Lança quando o banco falha por outro motivo. */
  startRun(pedido: Pedido): Promise<Inicio>
  /**
   * RPC reserve_agent_attachments, com a sessão de quem pede, antes de guardar o pedido: cada anexo tem de ser dela,
   * deste Workspace e já guardado. Devolve 'ok' ou o motivo da recusa.
   */
  reservarAnexos?(pedido: Pedido): Promise<'ok' | 'not_found' | 'invalid' | 'forbidden'>
  /** RPC `begin_crm_handoff_by_agents` (chave de serviço). Sem ele, `enviar_ao_crm` fica indisponível. */
  iniciarEnvioAoCrm?(pedido: PedidoDeEnvioAoCrm): Promise<InicioDoEnvioAoCrm>
}

export interface Deps {
  db: Db
  /** Roda a Execução; null quando o modelo não está configurado. */
  executar: ((runId: string) => Promise<void>) | null
  /** Continua um trabalho depois da resposta (EdgeRuntime.waitUntil). */
  waitUntil: (work: Promise<unknown>) => void
  appOrigin: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const TAMANHO_MAXIMO = 4000
const MAXIMO_DE_ANEXOS = 5
const ID_DA_INTEGRACAO = /^[a-z][a-z0-9-]{0,39}$/

/** A recusa de `begin_crm_handoff_by_agents` em palavras do produto (o banco já conferiu; aqui só se traduz). */
export function recusaDoEnvioPelosAgentes(codigo: string, mensagem: string): { httpStatus: number; code: string; mensagem: string } {
  if (codigo === '42501') {
    return mensagem.includes('responsible')
      ? { httpStatus: 403, code: 'nao_responsavel', mensagem: 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM.' }
      : { httpStatus: 403, code: 'participacao', mensagem: 'A sua Participação neste Workspace não está ativa.' }
  }
  if (codigo === 'P0002') return { httpStatus: 404, code: 'conta', mensagem: 'Conta-alvo não encontrada.' }
  if (codigo === '23505') {
    return {
      httpStatus: 409,
      code: 'ja_enviada',
      mensagem: 'Esta Conta-alvo já foi enviada ao CRM (ou está sendo enviada agora). Depois do envio, o CRM é a fonte da verdade.',
    }
  }
  if (codigo === '55000') {
    if (mensagem.includes('not a CRM')) return { httpStatus: 400, code: 'nao_crm', mensagem: 'Esta Integração não é um CRM.' }
    if (mensagem.includes('not enabled')) return { httpStatus: 409, code: 'nao_habilitada', mensagem: 'Este CRM não está habilitado neste Workspace.' }
    if (mensagem.includes('not by authorization')) {
      return { httpStatus: 409, code: 'pela_chave', mensagem: 'Este CRM está conectado pela chave de API: o envio sai direto, sem os Agentes.' }
    }
    if (mensagem.includes('no agent can write')) {
      return {
        httpStatus: 409,
        code: 'sem_agente',
        mensagem: 'Nenhum Agente pode escrever neste CRM. Dê ao Rhetor, ao Ethos ou ao Scopus a Permissão Propor ou Executar nele, em Agentes.',
      }
    }
    return { httpStatus: 409, code: 'sem_acesso', mensagem: 'Conecte a sua conta deste CRM em Conexões para enviar.' }
  }
  return { httpStatus: 502, code: 'indisponivel', mensagem: 'Não foi possível pedir o envio aos Agentes agora. Tente de novo em instantes.' }
}

function uuidOuNulo(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null) return null
  return typeof valor === 'string' && UUID.test(valor) ? valor : undefined
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  /** O Enviar ao CRM pelos Agentes: o banco confere e guarda; a Execução roda como qualquer pedido. */
  async function enviarAoCrm(userId: string, body: Record<string, unknown>): Promise<Response> {
    const executar = deps.executar
    if (!executar || !deps.db.iniciarEnvioAoCrm) {
      return respond({ error: 'As Conversas ainda não estão disponíveis neste ambiente.', code: 'model_unavailable' }, 503)
    }
    const workspaceId = uuidOuNulo(body.workspaceId)
    const targetAccountId = uuidOuNulo(body.targetAccountId)
    const clientRequestId = uuidOuNulo(body.clientRequestId)
    const integrationId = typeof body.integrationId === 'string' && ID_DA_INTEGRACAO.test(body.integrationId) ? body.integrationId : null
    if (!workspaceId || !targetAccountId || !clientRequestId || !integrationId) {
      return respond({ error: 'Pedido inválido.', code: 'invalido' }, 400)
    }
    let inicio: InicioDoEnvioAoCrm
    try {
      inicio = await deps.db.iniciarEnvioAoCrm({ userId, workspaceId, targetAccountId, integrationId, clientRequestId })
    } catch (error) {
      log({ type: 'agent_conversation', etapa: 'enviar_ao_crm', outcome: 'start_failed', message: String(error) })
      return respond({ error: 'Não foi possível pedir o envio aos Agentes agora.', code: 'indisponivel' }, 502)
    }
    if (inicio.kind === 'recusado') {
      log({ type: 'agent_conversation', etapa: 'enviar_ao_crm', outcome: 'refused', code: inicio.code })
      return respond({ error: inicio.mensagem, code: inicio.code }, inicio.httpStatus)
    }
    const { runId } = inicio
    if (inicio.status === 'queued') {
      deps.waitUntil(
        executar(runId).catch((error) =>
          log({ type: 'agent_conversation', runId, outcome: 'run_crashed', message: String(error) })
        ),
      )
    }
    log({ type: 'agent_conversation', etapa: 'enviar_ao_crm', runId, outcome: 'accepted', status: inicio.status })
    return respond({ conversationId: inicio.conversationId, runId, status: inicio.status }, 202)
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }

    if (body?.action === 'capability') return respond({ available: deps.executar !== null })
    if (body?.action === 'enviar_ao_crm') return await enviarAoCrm(user.userId, body)
    if (body?.action !== 'send') return respond({ error: 'Ação desconhecida.' }, 400)

    const executar = deps.executar
    if (!executar) {
      return respond(
        { error: 'As Conversas ainda não estão disponíveis neste ambiente.', code: 'model_unavailable' },
        503,
      )
    }

    const workspaceId = uuidOuNulo(body.workspaceId)
    const conversationId = uuidOuNulo(body.conversationId)
    const agentId = uuidOuNulo(body.agentId)
    const clientRequestId = uuidOuNulo(body.clientRequestId)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const mentions = Array.isArray(body.mentions) ? body.mentions : body.mentions === undefined ? [] : null
    const attachments = Array.isArray(body.attachments) ? body.attachments : body.attachments === undefined ? [] : null
    if (
      !workspaceId || conversationId === undefined || agentId === undefined || !clientRequestId || !mentions ||
      mentions.length > 4 || !mentions.every((id) => typeof id === 'string' && UUID.test(id)) || !attachments ||
      !attachments.every((id) => typeof id === 'string' && UUID.test(id))
    ) {
      return respond({ error: 'Pedido inválido.' }, 400)
    }
    if (new Set(attachments).size > MAXIMO_DE_ANEXOS) {
      return respond({ error: `Anexe até ${MAXIMO_DE_ANEXOS} arquivos por pedido.` }, 400)
    }
    if (!text || text.length > TAMANHO_MAXIMO) {
      return respond({ error: `Escreva um pedido de até ${TAMANHO_MAXIMO} caracteres.` }, 400)
    }

    const pedido: Pedido = {
      authorization,
      apikey,
      workspaceId,
      conversationId,
      agentId,
      text,
      mentions: mentions as string[],
      clientRequestId,
    }
    const anexos = [...new Set(attachments as string[])]
    if (anexos.length > 0) pedido.attachments = anexos
    // Os anexos são reservados antes de o pedido existir: quando a Execução nasce, o banco já os liga a ela, e nenhum
    // motor a pega sem eles.
    if (anexos.length > 0) {
      if (!deps.db.reservarAnexos) return respond({ error: 'Anexos ainda não estão disponíveis neste ambiente.' }, 503)
      let reserva: Awaited<ReturnType<NonNullable<Db['reservarAnexos']>>>
      try {
        reserva = await deps.db.reservarAnexos(pedido)
      } catch (error) {
        log({ type: 'agent_conversation', outcome: 'attachments_failed', message: String(error) })
        return respond({ error: 'Não foi possível preparar os anexos agora.' }, 500)
      }
      if (reserva === 'not_found') {
        return respond({ error: 'Um dos anexos não está disponível. Remova e anexe de novo.' }, 404)
      }
      if (reserva === 'forbidden') return respond({ error: 'Você não participa deste Workspace.' }, 403)
      if (reserva === 'invalid') return respond({ error: `Anexe até ${MAXIMO_DE_ANEXOS} arquivos por pedido.` }, 400)
    }

    let inicio: Inicio
    try {
      inicio = await deps.db.startRun(pedido)
    } catch (error) {
      log({ type: 'agent_conversation', outcome: 'start_failed', message: String(error) })
      return respond({ error: 'Não foi possível guardar o pedido agora.' }, 500)
    }
    switch (inicio.kind) {
      case 'busy':
        return respond({ error: 'Espere a resposta anterior terminar para mandar outro pedido.' }, 409)
      case 'not_found':
        return respond({ error: 'Conversa ou Agente não encontrado neste Workspace.' }, 404)
      case 'forbidden':
        return respond({ error: 'Você não participa deste Workspace.' }, 403)
      case 'invalid':
        return respond({ error: 'Pedido inválido.' }, 400)
    }

    // Um pedido repetido que já rodou não roda de novo; na fila, a reserva no banco garante uma execução só.
    if (inicio.status === 'queued') {
      deps.waitUntil(
        executar(inicio.runId).catch((error) =>
          log({ type: 'agent_conversation', runId: inicio.runId, outcome: 'run_crashed', message: String(error) })
        ),
      )
    }
    log({ type: 'agent_conversation', runId: inicio.runId, outcome: 'accepted', status: inicio.status })
    return respond({ conversationId: inicio.conversationId, runId: inicio.runId, status: inicio.status }, 202)
  })
}
