// Envio de um passo de E-mail confirmado (canais-04). A função não decide nada sozinha: o banco libera o
// envio (release_sequence_step_send) depois de revalidar Sequência, titular, Conta remetente e Destino,
// a Unipile envia, e o banco grava o resultado (record_sequence_step_send_result). A Unipile e o banco
// entram por injeção de dependência, para o teste ir da requisição à resposta sem rede.

export type SendOutcome = 'sent' | 'failed' | 'uncertain'

export type BlockedOutcome =
  | 'owner_not_responsible'
  | 'in_flight'
  | 'already_sent'
  | 'reconcile_required'
  | 'not_confirmed'
  | 'sequence_not_active'
  | 'sender_not_ready'
  | 'destination_changed'
  | 'step_missing'

export interface ReleasedSend {
  outcome: 'released'
  send_id: string
  unipile_account_id: string
  destination: string
  contact_name: string | null
  subject: string
  body: string
  reply_to_message_id: string | null
  tracking_header_name: string
  tracking_header_value: string
}

export interface BlockedSend {
  outcome: BlockedOutcome
  send_id: string
}

export type ReleaseResult = ReleasedSend | BlockedSend

export interface Db {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  hasActiveMembership(workspaceId: string, userId: string): Promise<boolean>
  /** RPC release_sequence_step_send. Lança um erro com code quando o banco recusa (ex.: P0002). */
  releaseStepSend(sendId: string, userId: string): Promise<ReleaseResult>
  /** RPC record_sequence_step_send_result. */
  recordStepSendResult(input: {
    sendId: string
    outcome: SendOutcome
    providerEmailId?: string | null
    providerMessageId?: string | null
    error?: string | null
  }): Promise<void>
}

export interface OutgoingEmail {
  to: { email: string; display_name?: string }[]
  subject: string
  plain_text: string
  custom_headers: { name: string; value: string }[]
  reply_to_message_id?: string
}

/** O que a Unipile devolve em POST /v2/{account_id}/emails/send: `{"object":"EmailSent","id","message_id"}`. */
export interface EmailSent {
  id: string
  message_id: string | null
}

/** A Unipile respondeu, mas fora de 2xx: o envio não aconteceu. */
export class UnipileRequestError extends Error {
  constructor(readonly status: number) {
    super(`Unipile respondeu HTTP ${status}`)
    this.name = 'UnipileRequestError'
  }
}

export interface UnipileMail {
  sendEmail(accountId: string, email: OutgoingEmail, options: { signal: AbortSignal }): Promise<EmailSent>
}

export interface Deps {
  db: Db
  unipile: UnipileMail
  appOrigin: string
  /** Depois disso, o resultado é incerto: pode ter saído ou não. Padrão 25 s. */
  sendTimeoutMs?: number
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const BLOCKED_MESSAGES: Record<BlockedOutcome, string> = {
  owner_not_responsible: 'Só o Vendedor responsável, com Participação ativa, envia os passos desta Sequência.',
  in_flight: 'Este passo já está sendo enviado.',
  already_sent: 'Este passo já foi enviado.',
  reconcile_required: 'O último envio deste passo ficou incerto e precisa ser conferido antes de reenviar.',
  not_confirmed: 'Confirme o passo antes de enviar.',
  sequence_not_active: 'A Sequência não está ativa.',
  sender_not_ready: 'Sua Conta remetente de E-mail não está pronta para enviar.',
  destination_changed: 'O e-mail do Contato mudou depois da confirmação. Reconfirme o passo para enviar ao novo Destino.',
  step_missing: 'O passo não existe mais no documento da Sequência.',
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': deps.appOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const timeoutMs = deps.sendTimeoutMs ?? 25_000

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey
      ? await deps.db.userFromJwt(authorization, apikey)
      : null
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

    let released: ReleaseResult
    try {
      released = await deps.db.releaseStepSend(sendId, user.userId)
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'P0002') return respond({ error: 'Envio não encontrado.' }, 404)
      return respond({ error: 'Não foi possível liberar o envio.' }, 500)
    }
    if (released.outcome !== 'released') {
      return respond({ outcome: released.outcome, sendId, message: BLOCKED_MESSAGES[released.outcome] }, 409)
    }

    const email: OutgoingEmail = {
      to: [{ email: released.destination, ...(released.contact_name ? { display_name: released.contact_name } : {}) }],
      subject: released.subject,
      plain_text: released.body,
      custom_headers: [{ name: released.tracking_header_name, value: released.tracking_header_value }],
      ...(released.reply_to_message_id ? { reply_to_message_id: released.reply_to_message_id } : {}),
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let result: { outcome: SendOutcome; sent?: EmailSent; error?: string }
    try {
      const sent = await deps.unipile.sendEmail(released.unipile_account_id, email, { signal: controller.signal })
      result = { outcome: 'sent', sent }
    } catch (error) {
      // Fora de 2xx o provedor recusou. Timeout ou falha de rede deixam dúvida: pode ter saído.
      result = error instanceof UnipileRequestError
        ? { outcome: 'failed', error: `HTTP ${error.status}` }
        : { outcome: 'uncertain', error: controller.signal.aborted ? 'timeout' : 'network' }
    } finally {
      clearTimeout(timer)
    }

    try {
      await deps.db.recordStepSendResult({
        sendId,
        outcome: result.outcome,
        providerEmailId: result.sent?.id ?? null,
        providerMessageId: result.sent?.message_id ?? null,
        error: result.error ?? null,
      })
    } catch {
      return respond({
        outcome: 'uncertain', sendId,
        message: 'O envio foi tentado, mas o resultado ainda não foi gravado. Confira antes de reenviar.',
      }, 500)
    }

    if (result.outcome === 'sent') return respond({ outcome: 'sent', sendId })
    if (result.outcome === 'failed') {
      return respond({ outcome: 'failed', sendId, message: 'A Unipile não aceitou o envio. Reconfirme o passo para tentar de novo.' }, 502)
    }
    return respond({
      outcome: 'uncertain', sendId,
      message: 'A Unipile não respondeu a tempo. O envio será conferido antes de qualquer reenvio.',
    }, 504)
  }
}
