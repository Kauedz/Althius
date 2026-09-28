// O e-mail do Convite (CRM-03). O Administrador registra o Convite no banco (invite_to_workspace) e pede o envio aqui:
// a função lê o Convite com a sessão de quem pede, então só um Administrador do Workspace recebe o token de um Convite
// pendente, e manda o e-mail pelo provedor (Resend) com o link de aceite. A resposta só diz que o e-mail saiu quando o
// provedor confirma; o link continua na tela para ser copiado se o envio falhar. Banco e provedor entram por injeção de
// dependência, para o teste ir da requisição à resposta sem rede.
import { comCors, origensPermitidas } from '../_shared/cors.ts'

/** O Convite pendente, como o Administrador que pede o envio o enxerga. */
export interface ConviteParaEnviar {
  email: string
  role: 'admin' | 'member'
  token: string
  expiresAt: string
  workspaceName: string
  /** O nome de quem convida, salvo em Meu perfil; sem ele, o e-mail da sessão. */
  inviterName: string
}

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /**
   * O Convite pendente, lido com a sessão de quem pede (list_workspace_invitations): o token só vem para Administrador
   * e só enquanto o Convite está pendente. Null quando não há o que enviar.
   */
  pendingInvitation(args: {
    workspaceId: string
    invitationId: string
    authorization: string
    apikey: string
  }): Promise<ConviteParaEnviar | null>
}

export interface EmailDeConvite {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

export interface Mail {
  /** Envia pelo provedor. Lança MailRequestError quando ele responde fora de 2xx; outro erro deixa o envio incerto. */
  send(email: EmailDeConvite): Promise<{ id: string }>
}

/** O provedor respondeu, mas recusou: o e-mail não saiu. */
export class MailRequestError extends Error {
  constructor(readonly status: number, readonly detail = '') {
    super(`Provedor de e-mail respondeu HTTP ${status}`)
    this.name = 'MailRequestError'
  }
}

export interface Deps {
  db: Db
  mail: Mail
  appOrigin: string
  /** O remetente, ex.: "Althius <contato@althius.com.br>". */
  from: string
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const PAPEL = { admin: 'Administrador', member: 'Membro' } as const
const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A origem do link: a de quem pediu, se o app a permite; senão a primeira origem publicada. */
function origemDoLink(req: Request, appOrigin: string) {
  const origem = req.headers.get('Origin') ?? ''
  const permitidas = origensPermitidas(appOrigin)
  return permitidas.includes(origem) || ORIGEM_LOCAL.test(origem) ? origem : permitidas[0]
}

export function montarEmail(convite: ConviteParaEnviar, link: string, from: string): EmailDeConvite {
  const papel = PAPEL[convite.role]
  const validade = DATA.format(new Date(convite.expiresAt))
  const subject = `${convite.inviterName} convidou você para o Workspace ${convite.workspaceName} na Althius`
  const text = [
    `${convite.inviterName} convidou você para o Workspace ${convite.workspaceName} na Althius, como ${papel}.`,
    '',
    `Para aceitar, abra o link e entre com este e-mail (${convite.email}):`,
    link,
    '',
    `O convite vale até ${validade}. Se você não esperava este convite, ignore este e-mail.`,
  ].join('\n')
  const html = [
    `<h2>Convite para o Workspace ${escaparHtml(convite.workspaceName)}</h2>`,
    `<p>${escaparHtml(convite.inviterName)} convidou você para o Workspace <strong>${
      escaparHtml(convite.workspaceName)
    }</strong> na Althius, como ${papel}.</p>`,
    `<p>Para aceitar, entre com este e-mail (${escaparHtml(convite.email)}):</p>`,
    `<p><a href="${escaparHtml(link)}">Aceitar o convite</a></p>`,
    `<p>Se o botão não abrir, copie este endereço no navegador:<br>${escaparHtml(link)}</p>`,
    `<p>O convite vale até ${validade}. Se você não esperava este convite, ignore este e-mail.</p>`,
  ].join('\n')
  return { from, to: convite.email, subject, text, html }
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
    const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : ''
    if (!UUID.test(workspaceId) || !UUID.test(invitationId)) {
      return respond({ error: 'Workspace e Convite são obrigatórios.' }, 400)
    }

    let convite: ConviteParaEnviar | null
    try {
      convite = await deps.db.pendingInvitation({ workspaceId, invitationId, authorization, apikey })
    } catch {
      convite = null
    }
    if (!convite) return respond({ error: 'Convite pendente não encontrado para você enviar.' }, 404)

    const link = `${origemDoLink(req, deps.appOrigin)}/convite/${encodeURIComponent(convite.token)}`
    try {
      const { id } = await deps.mail.send(montarEmail(convite, link, deps.from))
      log({ type: 'invitation_email', invitationId, outcome: 'sent', providerId: id })
      return respond({ sent: true, email: convite.email })
    } catch (error) {
      if (error instanceof MailRequestError) {
        log({ type: 'invitation_email', invitationId, outcome: 'refused', status: error.status, detail: error.detail })
        return respond({
          error: 'O provedor de e-mail não aceitou o envio. O convite continua valendo: copie o link e envie à pessoa.',
        }, 502)
      }
      log({ type: 'invitation_email', invitationId, outcome: 'uncertain' })
      return respond({
        error:
          'Não foi possível confirmar o envio do e-mail. Confira a caixa da pessoa antes de reenviar, ou copie o link e envie.',
      }, 504)
    }
  })
}
