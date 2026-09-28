// O e-mail do Convite (CRM-03). O Administrador registra o Convite no banco (invite_to_workspace) e pede o envio aqui.
// A função reserva o envio no banco com a sessão de quem pede (claim_invitation_email): o banco confere que é
// Administrador ativo, que o Convite está pendente e os limites de envio, e devolve o token. Só então o e-mail sai pelo
// provedor (Resend) com o link de aceite. A resposta só diz que o e-mail saiu quando o provedor confirma; o link
// continua na tela para ser copiado se o envio falhar. Banco e provedor entram por injeção de dependência, para o teste
// ir da requisição à resposta sem rede.
import { comCors, origemDoAppParaLink } from '../_shared/cors.ts'

/** O Convite pendente, como a reserva no banco o devolve. */
export interface ConviteParaEnviar {
  email: string
  role: 'admin' | 'member'
  token: string
  expiresAt: string
  workspaceName: string
  /** O nome de quem convida, salvo em Meu perfil; sem ele, o do cadastro ou o e-mail. */
  inviterName: string
}

export type ReservaDoEnvio =
  | { kind: 'reserved'; convite: ConviteParaEnviar }
  /** Não é Administrador ativo do Workspace, ou o Convite não está pendente nele. */
  | { kind: 'not_found' }
  /** O Convite ou o Workspace passou do limite de e-mails. */
  | { kind: 'limit_reached' }

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC claim_invitation_email, com a sessão de quem pede. Lança quando o banco falha por outro motivo. */
  claimInvitationEmail(args: {
    workspaceId: string
    invitationId: string
    authorization: string
    apikey: string
  }): Promise<ReservaDoEnvio>
}

export interface EmailDeConvite {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

export interface Mail {
  /** Envia pelo provedor. Lança MailRequestError quando ele recusa; outro erro deixa o envio incerto. */
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
const PAPEL = { admin: 'Administrador', member: 'Membro' } as const
const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})
/** Nomes escritos por quem usa o app entram no corpo, nunca no assunto, e cortados neste tamanho. */
const LIMITE_DO_NOME = 80

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cortar(texto: string) {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > LIMITE_DO_NOME ? `${limpo.slice(0, LIMITE_DO_NOME - 1)}…` : limpo
}

export function montarEmail(convite: ConviteParaEnviar, link: string, from: string): EmailDeConvite {
  const papel = PAPEL[convite.role]
  const validade = DATA.format(new Date(convite.expiresAt))
  const workspace = cortar(convite.workspaceName)
  const quemConvida = cortar(convite.inviterName)
  const text = [
    `${quemConvida} convidou você para o Workspace ${workspace} na Althius, como ${papel}.`,
    '',
    `Para aceitar, abra o link e entre, ou crie sua conta, com este mesmo e-mail (${convite.email}):`,
    link,
    '',
    `O convite vale até ${validade}. Se você não esperava este convite, ignore este e-mail.`,
  ].join('\n')
  const html = [
    `<h2>Convite para um Workspace na Althius</h2>`,
    `<p>${escaparHtml(quemConvida)} convidou você para o Workspace <strong>${
      escaparHtml(workspace)
    }</strong> na Althius, como ${papel}.</p>`,
    `<p>Para aceitar, entre, ou crie sua conta, com este mesmo e-mail (${escaparHtml(convite.email)}):</p>`,
    `<p><a href="${escaparHtml(link)}">Aceitar o convite</a></p>`,
    `<p>Se o botão não abrir, copie este endereço no navegador:<br>${escaparHtml(link)}</p>`,
    `<p>O convite vale até ${validade}. Se você não esperava este convite, ignore este e-mail.</p>`,
  ].join('\n')
  return { from, to: convite.email, subject: 'Convite para um Workspace na Althius', text, html }
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

    let reserva: ReservaDoEnvio
    try {
      reserva = await deps.db.claimInvitationEmail({ workspaceId, invitationId, authorization, apikey })
    } catch (error) {
      log({ type: 'invitation_email', invitationId, outcome: 'claim_failed', message: String(error) })
      return respond({ error: 'Não foi possível consultar o convite agora.' }, 500)
    }
    if (reserva.kind === 'not_found') {
      return respond({ error: 'Só um Administrador do Workspace envia o e-mail de um convite pendente.' }, 404)
    }
    if (reserva.kind === 'limit_reached') {
      return respond(
        { error: 'Este convite já recebeu e-mails há pouco. Espere alguns minutos antes de reenviar.' },
        429,
      )
    }

    const link = `${origemDoAppParaLink(req, deps.appOrigin)}/convite/${encodeURIComponent(reserva.convite.token)}`
    try {
      const { id } = await deps.mail.send(montarEmail(reserva.convite, link, deps.from))
      log({ type: 'invitation_email', invitationId, outcome: 'sent', providerId: id })
      return respond({ sent: true, email: reserva.convite.email })
    } catch (error) {
      if (error instanceof MailRequestError) {
        log({ type: 'invitation_email', invitationId, outcome: 'refused', status: error.status, detail: error.detail })
        return respond({ error: 'O provedor de e-mail não aceitou o envio.' }, 502)
      }
      log({ type: 'invitation_email', invitationId, outcome: 'uncertain' })
      return respond({ error: 'O provedor de e-mail não confirmou o envio a tempo.' }, 504)
    }
  })
}
