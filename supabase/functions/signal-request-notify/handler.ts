// Aviso de um pedido de Sinal (PR-A). Quem pediu grava o pedido (request_signal) e chama esta função.
// A função reserva o aviso no banco com a sessão de quem pede (claim_signal_request_notice): uma vez só.
// O e-mail sai para a equipe Althius, nunca para um endereço que o cliente escolha. Sem cobrança.
import { comCors } from '../_shared/cors.ts'
import { MailRequestError, type Mail } from '../workspace-invitation-email/handler.ts'

export const DESTINO = 'althius.relacionamento@gmail.com'
const ASSUNTO = 'Novo pedido de Sinal'

export interface PedidoParaAvisar {
  evento: string
  empresasOuNicho: string
  fontesConhecidas: string | null
  urgencia: string
  contato: { nome?: string; email?: string; whatsapp?: string }
  workspaceName: string
}

export type ReservaDoAviso = { kind: 'reserved'; pedido: PedidoParaAvisar } | { kind: 'already' }

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  claimSignalRequestNotice(args: {
    workspaceId: string
    requestId: string
    authorization: string
    apikey: string
  }): Promise<ReservaDoAviso>
}

export interface Deps {
  db: Db
  mail: Mail
  appOrigin: string
  from: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const URGENCIA: Record<string, string> = {
  esta_semana: 'Esta semana',
  este_mes: 'Este mês',
  sem_pressa: 'Sem pressa',
}
const LIMITE = 500

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cortar(texto: string) {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > LIMITE ? `${limpo.slice(0, LIMITE - 1)}…` : limpo
}

export function montarEmail(pedido: PedidoParaAvisar, from: string) {
  const evento = cortar(pedido.evento)
  const empresas = cortar(pedido.empresasOuNicho)
  const fontes = pedido.fontesConhecidas ? cortar(pedido.fontesConhecidas) : 'Não informou'
  const urgencia = URGENCIA[pedido.urgencia] ?? pedido.urgencia
  const nome = cortar(pedido.contato.nome ?? '')
  const email = cortar(pedido.contato.email ?? '')
  const whatsapp = pedido.contato.whatsapp ? cortar(pedido.contato.whatsapp) : 'Não informou'
  const workspace = cortar(pedido.workspaceName)
  const text = [
    `Novo pedido de Sinal no Workspace ${workspace}.`,
    '',
    `Evento: ${evento}`,
    `Empresas ou nicho: ${empresas}`,
    `Fontes conhecidas: ${fontes}`,
    `Urgência: ${urgencia}`,
    `Contato: ${nome} · ${email} · WhatsApp ${whatsapp}`,
  ].join('\n')
  const html = [
    `<h2>Novo pedido de Sinal</h2>`,
    `<p>Workspace <strong>${escaparHtml(workspace)}</strong>.</p>`,
    `<p><strong>Evento:</strong> ${escaparHtml(evento)}</p>`,
    `<p><strong>Empresas ou nicho:</strong> ${escaparHtml(empresas)}</p>`,
    `<p><strong>Fontes conhecidas:</strong> ${escaparHtml(fontes)}</p>`,
    `<p><strong>Urgência:</strong> ${escaparHtml(urgencia)}</p>`,
    `<p><strong>Contato:</strong> ${escaparHtml(nome)} · ${escaparHtml(email)} · WhatsApp ${escaparHtml(whatsapp)}</p>`,
  ].join('\n')
  return { from, to: DESTINO, subject: ASSUNTO, text, html }
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
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
    if (!UUID.test(workspaceId) || !UUID.test(requestId)) {
      return respond({ error: 'Workspace e pedido são obrigatórios.' }, 400)
    }

    let reserva: ReservaDoAviso
    try {
      reserva = await deps.db.claimSignalRequestNotice({ workspaceId, requestId, authorization, apikey })
    } catch (error) {
      log({ type: 'signal_request_notify', requestId, outcome: 'claim_failed', message: String(error) })
      return respond({ error: 'Não foi possível consultar o pedido agora.' }, 500)
    }
    if (reserva.kind === 'already') {
      log({ type: 'signal_request_notify', requestId, outcome: 'already' })
      return respond({ sent: true, already: true })
    }

    try {
      const { id } = await deps.mail.send(montarEmail(reserva.pedido, deps.from))
      log({ type: 'signal_request_notify', requestId, outcome: 'sent', providerId: id })
      return respond({ sent: true })
    } catch (error) {
      if (error instanceof MailRequestError) {
        log({ type: 'signal_request_notify', requestId, outcome: 'refused', status: error.status, detail: error.detail })
        return respond({ error: 'O provedor de e-mail não aceitou o envio.' }, 502)
      }
      log({ type: 'signal_request_notify', requestId, outcome: 'uncertain' })
      return respond({ error: 'O provedor de e-mail não confirmou o envio a tempo.' }, 504)
    }
  })
}
