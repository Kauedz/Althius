// A porta das Conversas dos Agentes (CRM-14). O navegador manda o pedido com o JWT de quem pede: a função o guarda no
// banco com a sessão dessa pessoa (start_agent_run confere a Participação, o Agente, as menções e a Conversa) e responde
// logo, com a Execução na fila. A Execução continua depois da resposta (waitUntil), e a tela acompanha os passos pelo
// banco, não por esta conexão. Sem a chave do modelo, a capacidade responde indisponível e nenhum pedido é guardado.
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
}

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC start_agent_run, com a sessão de quem pede. Lança quando o banco falha por outro motivo. */
  startRun(pedido: Pedido): Promise<Inicio>
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

function uuidOuNulo(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null) return null
  return typeof valor === 'string' && UUID.test(valor) ? valor : undefined
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
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
    if (
      !workspaceId || conversationId === undefined || agentId === undefined || !clientRequestId || !mentions ||
      mentions.length > 4 || !mentions.every((id) => typeof id === 'string' && UUID.test(id))
    ) {
      return respond({ error: 'Pedido inválido.' }, 400)
    }
    if (!text || text.length > TAMANHO_MAXIMO) {
      return respond({ error: `Escreva um pedido de até ${TAMANHO_MAXIMO} caracteres.` }, 400)
    }

    let inicio: Inicio
    try {
      inicio = await deps.db.startRun({
        authorization,
        apikey,
        workspaceId,
        conversationId,
        agentId,
        text,
        mentions: mentions as string[],
        clientRequestId,
      })
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
