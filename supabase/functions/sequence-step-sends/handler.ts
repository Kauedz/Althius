// Envio de um passo de E-mail pedido pelo titular (canais-04). A função confirma quem pede e a Participação dele, e o
// núcleo compartilhado (../_shared/send-step.ts) confere a conversa, libera pelo banco (release_sequence_step_send),
// envia pela Unipile e grava o resultado. A Unipile e o banco entram por injeção de dependência, para o teste ir da
// requisição à resposta sem rede.
import { comCors } from '../_shared/cors.ts'
import {
  blockedMessage,
  type ReleaseResult,
  sendStep,
  type SendStepDb,
  type StepSendResult,
  type UnipileMail,
} from '../_shared/send-step.ts'
import { sendWhatsappStep, type WhatsappPort } from '../_shared/send-whatsapp.ts'

export {
  type BlockedOutcome,
  type BlockedSend,
  type Conversation,
  type EmailSent,
  type OutgoingEmail,
  type ReleasedSend,
  type ReleaseResult,
  type SendOutcome,
  type UnipileMail,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from '../_shared/send-step.ts'

export interface Db extends SendStepDb {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  hasActiveMembership(workspaceId: string, userId: string): Promise<boolean>
  /** RPC release_sequence_step_send. Lança um erro com code quando o banco recusa (ex.: P0002). */
  releaseStepSend(sendId: string, userId: string): Promise<ReleaseResult>
}

export interface Deps {
  db: Db
  unipile: UnipileMail
  /** O caminho do WhatsApp (canais-06). Sem ele, todo envio segue pelo caminho do E-mail. */
  whatsapp?: WhatsappPort
  appOrigin: string
  /** Depois disso, o resultado é incerto: pode ter saído ou não. Padrão 25 s. */
  sendTimeoutMs?: number
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
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
    if (body?.action !== 'send') return respond({ error: 'Ação não reconhecida.' }, 400)
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : ''
    const sendId = typeof body.sendId === 'string' ? body.sendId : ''
    if (!UUID.test(workspaceId)) return respond({ error: 'Workspace obrigatório.' }, 400)
    if (!UUID.test(sendId)) return respond({ error: 'Envio obrigatório.' }, 400)

    if (!(await deps.db.hasActiveMembership(workspaceId, user.userId))) {
      return respond({ error: 'Participação ativa no Workspace não encontrada.' }, 403)
    }

    // O canal do Envio decide o caminho. Sem o caminho do WhatsApp configurado, ou sem conseguir saber o canal, o envio
    // segue pelo E-mail, e a liberação do banco recusa um Envio de outro canal (wrong_channel).
    let channel: 'email' | 'whatsapp' = 'email'
    if (deps.whatsapp) {
      try {
        if (await deps.whatsapp.db.stepSendChannel(sendId, user.userId) === 'whatsapp') channel = 'whatsapp'
      } catch {
        channel = 'email'
      }
    }

    const whatsapp = deps.whatsapp
    const result: StepSendResult = channel === 'whatsapp' && whatsapp
      ? await sendWhatsappStep(whatsapp, { sendId, release: () => whatsapp.db.releaseSend(sendId, user.userId) })
      : await sendStep(deps, {
        sendId,
        userId: user.userId,
        release: () => deps.db.releaseStepSend(sendId, user.userId),
      })

    switch (result.kind) {
      case 'blocked':
        return respond({ outcome: result.outcome, sendId, message: blockedMessage(result.outcome, channel) }, 409)
      case 'not_found':
        return respond({ error: 'Envio não encontrado.' }, 404)
      case 'release_error':
        return respond({ error: 'Não foi possível liberar o envio.' }, 500)
    }
    if (!result.recorded) {
      return respond({
        outcome: 'uncertain',
        sendId,
        message: 'O envio foi tentado, mas o resultado ainda não foi gravado. Confira antes de reenviar.',
      }, 500)
    }
    if (result.outcome === 'sent') return respond({ outcome: 'sent', sendId })
    if (result.outcome === 'failed') {
      return respond({
        outcome: 'failed',
        sendId,
        message: 'A Unipile não aceitou o envio. Reconfirme o passo para tentar de novo.',
      }, 502)
    }
    return respond({
      outcome: 'uncertain',
      sendId,
      message: channel === 'whatsapp'
        ? 'A Unipile não confirmou o envio. Confira no seu WhatsApp se a mensagem saiu e diga isso aqui: a Althius nunca reenvia sozinha.'
        : 'A Unipile não respondeu a tempo. O envio será conferido antes de qualquer reenvio.',
    }, 504)
  })
}
