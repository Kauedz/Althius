// O núcleo do envio de um passo de E-mail, compartilhado pelo envio pedido pelo titular (sequence-step-sends) e pelo
// Executor (sequence-runner). A função não decide nada sozinha: confere a conversa na Unipile, o banco libera o envio
// depois de revalidar tudo, a Unipile envia e o banco grava o resultado. Quem chama só escolhe como liberar: pelo
// titular (release_sequence_step_send) ou pelo Executor (release_due_step_send).
import type { IngestedEmail, IngestEmailEventInput } from './ingest-email-event.ts'

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
  | 'contact_unlinked'
  | 'step_missing'
  | 'reply_found'
  | 'thread_check_failed'
  | 'not_due'
  | 'outside_window'
  | 'authorization_revoked'
  | 'not_scheduled'
  | 'destination_bounced'

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

export interface Conversation {
  unipile_account_id: string
  provider_thread_id: string | null
  /** O id do último e-mail enviado ao Contato: sem eco do webhook, é por ele que a conversa é descoberta. */
  provider_email_id: string | null
}

/** O que o núcleo do envio usa do banco. */
export interface SendStepDb {
  /** RPC conversation_for_send: a Conta remetente e a conversa que um passo "Re:" continua, ou null. */
  conversationForSend(sendId: string, userId: string): Promise<Conversation | null>
  /** RPC ingest_unipile_email_event, para gravar o que a conferência da conversa encontrar. */
  ingestEmailEvent(input: IngestEmailEventInput): Promise<IngestedEmail>
  /** RPC record_sequence_step_send_result. */
  recordStepSendResult(input: {
    sendId: string
    outcome: SendOutcome
    providerEmailId?: string | null
    providerMessageId?: string | null
    error?: string | null
    /** O prazo que a Unipile pediu antes de tentar de novo (Retry-After), em segundos. */
    retryAfterSeconds?: number | null
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
  constructor(readonly status: number, readonly retryAfterSeconds: number | null = null) {
    super(`Unipile respondeu HTTP ${status}`)
    this.name = 'UnipileRequestError'
  }
}

/** A Unipile respondeu 2xx, mas sem o `id` do EmailSent: o envio provavelmente saiu, então fica incerto. */
export class UnipileUnreadableResponse extends Error {
  constructor() {
    super('Unipile respondeu 2xx sem o id do e-mail enviado')
    this.name = 'UnipileUnreadableResponse'
  }
}

export interface UnipileMail {
  sendEmail(accountId: string, email: OutgoingEmail, options: { signal: AbortSignal }): Promise<EmailSent>
  /** Um e-mail enviado (GET /v2/{account_id}/emails/{email_id}), para descobrir a conversa sem o eco. */
  getEmail(accountId: string, emailId: string): Promise<Record<string, unknown>>
  /** Os e-mails de uma conversa (GET /v2/{account_id}/threads/{thread_id}). */
  listThreadEmails(accountId: string, threadId: string): Promise<Record<string, unknown>[]>
  /** Os endereços do titular na conta (GET /v2/{account_id}/email-senders). */
  listEmailSenders(accountId: string): Promise<string[]>
}

export const BLOCKED_MESSAGES: Record<BlockedOutcome, string> = {
  owner_not_responsible: 'Só o Vendedor responsável, com Participação ativa, envia os passos desta Sequência.',
  in_flight: 'Este passo já está sendo enviado.',
  already_sent: 'Este passo já foi enviado.',
  reconcile_required: 'O último envio deste passo ficou incerto e precisa ser conferido antes de reenviar.',
  not_confirmed: 'Confirme o passo antes de enviar.',
  sequence_not_active: 'A Sequência não está ativa.',
  sender_not_ready: 'Sua Conta remetente de E-mail não está pronta para enviar.',
  destination_changed:
    'O e-mail do Contato mudou depois da confirmação. Reconfirme o passo para enviar ao novo Destino.',
  contact_unlinked: 'O Contato não está mais vinculado à Conta-alvo. Ajuste o passo e confirme de novo.',
  step_missing: 'O passo não existe mais no documento da Sequência.',
  reply_found: 'O Contato já respondeu nesta conversa. A resposta foi registrada e a Sequência ficou pausada.',
  thread_check_failed: 'Não foi possível conferir a conversa na Unipile antes de enviar. Tente de novo em instantes.',
  not_due: 'Este passo está programado para mais tarde e sai no horário dele.',
  outside_window: 'Agora está fora da janela de horário deste passo. Ele sai no próximo horário válido.',
  authorization_revoked: 'A Sequência mudou depois da ativação. Ative os envios de novo para enviar este passo.',
  not_scheduled: 'Este passo espera o envio manual do Vendedor responsável.',
  destination_bounced: 'O e-mail deste Contato já voltou nesta Sequência. Corrija o e-mail e reconfirme o passo.',
}

export type StepSendResult =
  /** Não saiu: a conversa, o banco ou a hora do passo barraram. */
  | { kind: 'blocked'; outcome: BlockedOutcome }
  /** O Envio não existe. */
  | { kind: 'not_found' }
  /** O banco falhou ao liberar: nada foi enviado. */
  | { kind: 'release_error' }
  /** A Unipile foi chamada. `recorded` diz se o resultado ficou gravado; sem ele, o envio precisa ser conferido. */
  | { kind: 'attempted'; outcome: SendOutcome; recorded: boolean }

export interface SendStepDeps {
  db: SendStepDb
  unipile: UnipileMail
  /** Depois disso, o resultado é incerto: pode ter saído ou não. Padrão 25 s. */
  sendTimeoutMs?: number
}

/**
 * Confere uma conversa com o Contato na Unipile: cada e-mail dela passa pela ingestão, que grava e pausa a Sequência
 * quando acha uma resposta ainda não gravada. `ownerAddresses` evita pedir os endereços do titular de novo quando
 * várias conversas da mesma conta são conferidas em seguida.
 */
export async function checkConversation(
  deps: Pick<SendStepDeps, 'db' | 'unipile'>,
  conversation: Conversation,
  ownerAddresses?: string[],
): Promise<'clear' | 'reply_found' | 'failed'> {
  if (!conversation.provider_thread_id && !conversation.provider_email_id) return 'clear'
  const account = conversation.unipile_account_id
  let replyFound = false
  try {
    const senders = ownerAddresses ?? await deps.unipile.listEmailSenders(account)
    const ingest = async (email: Record<string, unknown>) => {
      if (typeof email.id !== 'string' || !email.id) return
      const ingested = await deps.db.ingestEmailEvent({
        eventId: `thread-check:${account}:${email.id}`,
        eventType: 'email.new',
        unipileAccountId: account,
        email,
        ownerAddresses: senders,
      })
      if (ingested.outcome === 'reply') replyFound = true
    }
    let threadId = conversation.provider_thread_id
    if (!threadId && conversation.provider_email_id) {
      // Sem o eco do webhook, o e-mail enviado é lido de volta: a ingestão o reconhece como eco e guarda a conversa.
      const sent = await deps.unipile.getEmail(account, conversation.provider_email_id)
      await ingest(sent)
      threadId = typeof sent.thread_id === 'string' && sent.thread_id ? sent.thread_id : null
    }
    if (threadId) {
      for (const email of await deps.unipile.listThreadEmails(account, threadId)) await ingest(email)
    }
  } catch {
    return 'failed'
  }
  return replyFound ? 'reply_found' : 'clear'
}

export async function sendStep(
  deps: SendStepDeps,
  args: { sendId: string; userId: string; release: () => Promise<ReleaseResult> },
): Promise<StepSendResult> {
  const { sendId, userId } = args

  // Antes do próximo passo de uma conversa já aberta com o Contato, conferir a conversa pela API: a Unipile
  // reentrega o webhook só duas vezes, e uma resposta perdida não pode deixar a Sequência seguir.
  let conversation: Conversation | null
  try {
    conversation = await deps.db.conversationForSend(sendId, userId)
  } catch {
    return { kind: 'blocked', outcome: 'thread_check_failed' }
  }
  if (conversation) {
    const checked = await checkConversation(deps, conversation)
    if (checked === 'failed') return { kind: 'blocked', outcome: 'thread_check_failed' }
    if (checked === 'reply_found') return { kind: 'blocked', outcome: 'reply_found' }
  }

  let released: ReleaseResult
  try {
    released = await args.release()
  } catch (error) {
    return (error as { code?: string })?.code === 'P0002' ? { kind: 'not_found' } : { kind: 'release_error' }
  }
  if (released.outcome !== 'released') return { kind: 'blocked', outcome: released.outcome }

  const email: OutgoingEmail = {
    to: [{
      email: released.destination,
      ...(released.contact_name ? { display_name: released.contact_name } : {}),
    }],
    subject: released.subject,
    plain_text: released.body,
    custom_headers: [{ name: released.tracking_header_name, value: released.tracking_header_value }],
    ...(released.reply_to_message_id ? { reply_to_message_id: released.reply_to_message_id } : {}),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.sendTimeoutMs ?? 25_000)
  let result: { outcome: SendOutcome; sent?: EmailSent; error?: string; retryAfterSeconds?: number | null }
  try {
    const sent = await deps.unipile.sendEmail(released.unipile_account_id, email, { signal: controller.signal })
    result = { outcome: 'sent', sent }
  } catch (error) {
    // Fora de 2xx o provedor recusou. Timeout, falha de rede ou 2xx ilegível deixam dúvida: pode ter saído.
    if (error instanceof UnipileRequestError) {
      result = { outcome: 'failed', error: `HTTP ${error.status}`, retryAfterSeconds: error.retryAfterSeconds }
    } else if (error instanceof UnipileUnreadableResponse) {
      result = { outcome: 'uncertain', error: 'unreadable_response' }
    } else {
      result = { outcome: 'uncertain', error: controller.signal.aborted ? 'timeout' : 'network' }
    }
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
      retryAfterSeconds: result.retryAfterSeconds ?? null,
    })
  } catch {
    return { kind: 'attempted', outcome: result.outcome, recorded: false }
  }
  return { kind: 'attempted', outcome: result.outcome, recorded: true }
}
