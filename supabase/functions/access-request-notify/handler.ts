// Aviso de um pedido de acesso (acesso-e-planos). O visitante do Workspace de demonstração manda o formulário "Fale com a
// equipe Althius" (submit_access_request) e chama esta função. Ela reserva o aviso no banco com a sessão de quem pede
// (claim_access_request_notice): uma vez só. O e-mail sai para a equipe Althius, nunca para um endereço que o cliente
// escolha. Se o provedor recusar, o aviso é solto para uma nova tentativa. Banco e provedor entram por injeção de
// dependência, para o teste ir da requisição à resposta sem rede.
import { comCors } from '../_shared/cors.ts'
import { MailRequestError, type Mail } from '../workspace-invitation-email/handler.ts'

export const DESTINO = 'althius.relacionamento@gmail.com'
const ASSUNTO = 'Novo pedido de acesso à Althius'

export interface PedidoDeAcesso {
  nome: string
  empresa: string
  telefone: string
  mensagem: string
  email: string
}

export type ReservaDoAviso = { kind: 'reserved'; pedido: PedidoDeAcesso } | { kind: 'already' }

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  claimAccessRequestNotice(args: { requestId: string; authorization: string; apikey: string }): Promise<ReservaDoAviso>
  /** Solta o aviso quando o provedor recusou o envio. Uma falha aqui só vai para o log. */
  releaseAccessRequestNotice(args: { requestId: string; authorization: string; apikey: string }): Promise<void>
}

export interface Deps {
  db: Db
  mail: Mail
  appOrigin: string
  from: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const LIMITE = 2000

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cortar(texto: string, limite = LIMITE) {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo
}

export function montarEmail(pedido: PedidoDeAcesso, from: string) {
  const nome = cortar(pedido.nome, 120)
  const empresa = cortar(pedido.empresa, 160)
  const telefone = cortar(pedido.telefone, 40)
  const email = cortar(pedido.email, 200)
  const mensagem = cortar(pedido.mensagem)
  const text = [
    `Novo pedido de acesso à Althius, vindo do Workspace de demonstração.`,
    '',
    `Nome: ${nome}`,
    `Empresa: ${empresa}`,
    `Telefone: ${telefone}`,
    `E-mail da conta: ${email}`,
    '',
    `Mensagem: ${mensagem}`,
  ].join('\n')
  const html = [
    `<h2>Novo pedido de acesso à Althius</h2>`,
    `<p>Vindo do Workspace de demonstração.</p>`,
    `<p><strong>Nome:</strong> ${escaparHtml(nome)}</p>`,
    `<p><strong>Empresa:</strong> ${escaparHtml(empresa)}</p>`,
    `<p><strong>Telefone:</strong> ${escaparHtml(telefone)}</p>`,
    `<p><strong>E-mail da conta:</strong> ${escaparHtml(email)}</p>`,
    `<p><strong>Mensagem:</strong> ${escaparHtml(mensagem)}</p>`,
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
    const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
    if (!UUID.test(requestId)) return respond({ error: 'O pedido é obrigatório.' }, 400)

    let reserva: ReservaDoAviso
    try {
      reserva = await deps.db.claimAccessRequestNotice({ requestId, authorization, apikey })
    } catch (error) {
      log({ type: 'access_request_notify', requestId, outcome: 'claim_failed', message: String(error) })
      return respond({ error: 'Não foi possível consultar o pedido agora.' }, 500)
    }
    if (reserva.kind === 'already') {
      log({ type: 'access_request_notify', requestId, outcome: 'already' })
      return respond({ sent: true, already: true })
    }

    try {
      const { id } = await deps.mail.send(montarEmail(reserva.pedido, deps.from))
      log({ type: 'access_request_notify', requestId, outcome: 'sent', providerId: id })
      return respond({ sent: true })
    } catch (error) {
      if (error instanceof MailRequestError) {
        // O provedor recusou: o e-mail não saiu, então o aviso volta a poder ser reservado.
        await deps.db.releaseAccessRequestNotice({ requestId, authorization, apikey }).catch((falha) =>
          log({ type: 'access_request_notify', requestId, outcome: 'release_failed', message: String(falha) })
        )
        log({ type: 'access_request_notify', requestId, outcome: 'refused', status: error.status, detail: error.detail })
        return respond({ error: 'O provedor de e-mail não aceitou o envio.' }, 502)
      }
      // Falha de rede ou prazo: o envio é incerto. Não solta o aviso, para não mandar duas vezes.
      log({ type: 'access_request_notify', requestId, outcome: 'uncertain', message: String(error) })
      return respond({ error: 'Não foi possível confirmar o envio agora.' }, 504)
    }
  })
}
