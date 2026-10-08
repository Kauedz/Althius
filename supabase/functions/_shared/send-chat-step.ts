// O núcleo do envio de um passo de WhatsApp ou LinkedIn (canais-06 e canais-07), irmão enxuto de send-step.ts. Quem
// chama é o Executor (sequence-runner). A função não decide nada sozinha: confere a conversa na Unipile, o banco libera
// o envio depois de revalidar tudo (titular, versão, pausa, janela, Conta remetente do canal e Destino fixado), a
// Unipile envia e o banco grava o resultado. Sem chave de idempotência na Unipile, o controle é da Althius: timeout,
// falha de rede e 2xx ilegível deixam o envio INCERTO, que nunca é reenviado às cegas.
import {
  type BlockedOutcome,
  BLOCKED_MESSAGES,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from './send-step.ts'
import type { IngestChatEventInput, IngestedChat } from './ingest-chat-event.ts'
import { type OutgoingAttachment, prepareAttachments, type StepAttachmentSource } from './anexos-do-envio.ts'

export type ChatChannel = 'whatsapp' | 'linkedin'
/** A intenção do passo do LinkedIn (`subtipoLinkedIn` do documento). A ação que sai depende da relação. */
export type LinkedInSubtype = 'convite' | 'mensagem' | 'inmail'
export type LinkedInAction = LinkedInSubtype

/**
 * O que o núcleo grava no Envio. `blocked` é um impedimento que o Vendedor responsável precisa resolver (crédito,
 * assinatura, relação, nota longa...): o Envio fica falho com o motivo, sem nova tentativa, e a Sequência para nele
 * até uma nova ativação.
 */
export type ChatSendOutcome = 'sent' | 'failed' | 'uncertain' | 'blocked'

export type ChatBlockedOutcome = BlockedOutcome | 'channel_not_enabled'

export interface ReleasedChatSend {
  outcome: 'released'
  send_id: string
  channel: ChatChannel
  unipile_account_id: string
  /** O Destino fixado na ativação: o telefone normalizado (+55...) ou o endereço do perfil do LinkedIn. */
  destination: string
  contact_name: string | null
  /** O texto com as variáveis preenchidas. */
  body: string
  linkedin_subtype: LinkedInSubtype | null
  /** A conversa já aberta com este Contato por esta Conta remetente, se houver. */
  provider_chat_id: string | null
  provider_user_id: string | null
  /** Um convite deste Contato já saiu nesta Sequência. */
  invite_sent: boolean
  invite_note_limit: number
}

export interface BlockedChatSend {
  outcome: ChatBlockedOutcome
  send_id: string
}

export type ChatReleaseResult = ReleasedChatSend | BlockedChatSend

export interface ChatConversation {
  unipile_account_id: string
  provider_chat_id: string
}

/** O que o núcleo do envio de conversa usa do banco. */
export interface ChatSendDb {
  /** RPC chat_conversation_for_send: a Conta remetente e o chat do último Envio ao Contato, ou null. */
  chatConversationForSend(sendId: string, userId: string): Promise<ChatConversation | null>
  /** RPC ingest_unipile_chat_event, para gravar o que a conferência da conversa encontrar. */
  ingestChatEvent(input: IngestChatEventInput): Promise<IngestedChat>
  /** RPC record_chat_step_send_result. */
  recordChatStepSendResult(input: {
    sendId: string
    outcome: ChatSendOutcome
    providerChatId?: string | null
    providerMessageId?: string | null
    providerUserId?: string | null
    linkedinAction?: LinkedInAction | null
    error?: string | null
    /** O prazo que a Unipile pediu antes de tentar de novo (Retry-After), em segundos. */
    retryAfterSeconds?: number | null
  }): Promise<void>
}

/** O que a Unipile devolve ao enviar uma mensagem: os ids da conversa e da mensagem (ao menos um). */
export interface ChatSent {
  chat_id: string | null
  message_id: string | null
}

/** O que a Unipile devolve ao enviar um convite. */
export interface InvitationSent {
  id: string
}

/** O perfil do LinkedIn que importa para o envio: o id nativo e se já é conexão (1º grau), quando a Unipile diz. */
export interface LinkedInProfile {
  providerId: string
  firstDegree: boolean | null
}

export interface UnipileChat {
  /** POST /v2/{account_id}/chats/send: abre a conversa com um usuário e envia a primeira mensagem. */
  startChat(
    accountId: string,
    input: { userId: string; text: string; attachments?: OutgoingAttachment[] },
    options: { signal: AbortSignal },
  ): Promise<ChatSent>
  /** POST /v2/{account_id}/chats/{chat_id}/messages/send: continua uma conversa. Os anexos são do canais-10. */
  sendChatMessage(
    accountId: string,
    chatId: string,
    text: string,
    options: { signal: AbortSignal; attachments?: OutgoingAttachment[] },
  ): Promise<ChatSent>
  /** POST /v2/{account_id}/users/me/relation-requests: convite com nota. */
  sendInvitation(
    accountId: string,
    input: { userId: string; message: string },
    options: { signal: AbortSignal },
  ): Promise<InvitationSent>
  /** GET /v2/{account_id}/users/{identifier}: o id nativo e a distância de rede de um perfil. */
  getLinkedInProfile(accountId: string, identifier: string, options: { signal: AbortSignal }): Promise<LinkedInProfile>
  /** GET /v2/{account_id}/chats/{chat_id}/messages: as mensagens recentes de uma conversa. */
  listChatMessages(accountId: string, chatId: string): Promise<Record<string, unknown>[]>
}

/** A Unipile recusou (HTTP fora de 2xx) e o corpo da recusa disse o motivo, quando disse. */
export class UnipileChatRequestError extends UnipileRequestError {
  constructor(status: number, retryAfterSeconds: number | null, readonly reason: string | null) {
    super(status, retryAfterSeconds)
    this.name = 'UnipileChatRequestError'
  }
}

export const CHAT_BLOCKED_MESSAGES: Record<ChatBlockedOutcome, string> = {
  ...BLOCKED_MESSAGES,
  sender_not_ready: 'Sua Conta remetente deste canal não está pronta para enviar.',
  destination_changed:
    'O telefone ou o perfil do Contato mudou depois da ativação. Ative os envios de novo para fixar o novo Destino.',
  not_confirmed: 'Ative os envios antes de enviar.',
  not_scheduled: 'Este passo não está programado.',
  channel_not_enabled: 'O envio por este canal ainda não foi liberado neste servidor.',
}

export type ChatStepSendResult =
  /** Não saiu: a conversa, o banco ou a hora do passo barraram. */
  | { kind: 'blocked'; outcome: ChatBlockedOutcome }
  /** O Envio não existe. */
  | { kind: 'not_found' }
  /** O banco falhou ao liberar: nada foi enviado. */
  | { kind: 'release_error' }
  /** A Unipile foi chamada (ou o impedimento foi detectado antes). `recorded` diz se o resultado ficou gravado. */
  | { kind: 'attempted'; outcome: ChatSendOutcome; recorded: boolean; reason?: string }

export interface SendChatStepDeps {
  db: ChatSendDb
  unipile: UnipileChat
  /** Cada chamada à Unipile. Depois disso, o resultado é incerto: pode ter saído ou não. Padrão 25 s. */
  sendTimeoutMs?: number
  /** Os anexos do passo (canais-10). Sem isto, o passo sai só com o texto, como antes. */
  attachments?: StepAttachmentSource
}

// ---------- Destino e decisão ----------

/**
 * O id de usuário do WhatsApp para a Unipile: o número internacional só com dígitos e `@s.whatsapp.net`.
 * não confirmado: a Unipile também devolve ids `@lid`; ambos são aceitos, mas o Destino fixado é sempre o número.
 */
export function toWhatsAppUserId(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null
}

/** O identificador público do perfil (`/in/<perfil>`), que a Unipile aceita para achar o id nativo. */
export function linkedInIdentifier(profileUrl: string): string | null {
  const found = /^https:\/\/www\.linkedin\.com\/in\/([^/?#]+)\/?$/i.exec(profileUrl.trim())
  return found ? decodeURIComponent(found[1]) : null
}

export type LinkedInDecision = { action: LinkedInAction } | { blocked: string }

/**
 * Cadência do Nan: LinkedIn é convite com nota e, se a pessoa já é conexão, mensagem. O subtipo do passo é a
 * intenção; a relação decide o que sai. Relação desconhecida (a Unipile não disse) segue a intenção do passo, e o
 * provedor é quem recusa o que não vale. InMail está fora: o passo é impedimento, seja o Contato conexão ou não.
 */
export function decideLinkedInAction(subtype: LinkedInSubtype, firstDegree: boolean | null): LinkedInDecision {
  if (subtype === 'inmail') return { blocked: 'linkedin_inmail_not_supported' }
  if (firstDegree === true) return { action: 'mensagem' }
  if (subtype === 'convite') return { action: 'convite' }
  // Mensagem a quem não é conexão: o LinkedIn não deixa. Só com a relação conhecida o núcleo barra antes.
  return firstDegree === false ? { blocked: 'linkedin_not_connected' } : { action: 'mensagem' }
}

/** Caracteres como o Postgres os conta (code points), para a nota do convite. */
export function characterCount(text: string): number {
  return Array.from(text).length
}

// 408 e 5xx (menos 503) deixam dúvida se a mensagem saiu: incerto. 429 e 503 dizem que não foi processada.
function isDefinitelyNotProcessed(status: number) {
  return status === 429 || status === 503
}

interface Attempt {
  outcome: ChatSendOutcome
  chatId?: string | null
  messageId?: string | null
  providerUserId?: string | null
  action?: LinkedInAction | null
  error?: string
  retryAfterSeconds?: number | null
}

// ---------- Conferência da conversa ----------

/**
 * Confere uma conversa com o Contato na Unipile: cada mensagem recente passa pela ingestão, que grava e pausa a
 * Sequência quando acha uma resposta ainda não gravada. A Unipile reentrega o webhook só duas vezes, e uma resposta
 * perdida não pode deixar a Sequência seguir. Mensagens repetidas são desduplicadas pelo banco.
 */
export async function checkChatConversation(
  deps: Pick<SendChatStepDeps, 'db' | 'unipile'>,
  conversation: ChatConversation,
): Promise<'clear' | 'reply_found' | 'failed'> {
  const account = conversation.unipile_account_id
  const chatId = conversation.provider_chat_id
  let replyFound = false
  try {
    for (const message of await deps.unipile.listChatMessages(account, chatId)) {
      if (typeof message.id !== 'string' || !message.id) continue
      const ingested = await deps.db.ingestChatEvent({
        eventId: `chat-check:${account}:${chatId}:${message.id}`,
        eventType: 'message.new',
        unipileAccountId: account,
        payload: { ...message, chat_id: typeof message.chat_id === 'string' && message.chat_id ? message.chat_id : chatId },
      })
      if (ingested.outcome === 'reply') replyFound = true
    }
  } catch (error) {
    // Uma conversa que não existe mais na Unipile não tem resposta a conferir.
    if (error instanceof UnipileRequestError && error.status === 404) return replyFound ? 'reply_found' : 'clear'
    return 'failed'
  }
  return replyFound ? 'reply_found' : 'clear'
}

// ---------- Envio ----------

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<{ value: T } | { error: unknown; aborted: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return { value: await run(controller.signal) }
  } catch (error) {
    return { error, aborted: controller.signal.aborted }
  } finally {
    clearTimeout(timer)
  }
}

/** Fora de 2xx o provedor recusou; timeout, falha de rede e 2xx ilegível deixam dúvida: pode ter saído. */
function classifySendError(error: unknown, aborted: boolean): Attempt {
  if (error instanceof UnipileRequestError) {
    if (isDefinitelyNotProcessed(error.status)) {
      return { outcome: 'failed', error: `HTTP ${error.status}`, retryAfterSeconds: error.retryAfterSeconds }
    }
    if (error.status >= 500 || error.status === 408) {
      return { outcome: 'uncertain', error: `HTTP ${error.status}` }
    }
    // 4xx: a Unipile recusou por um motivo que o Vendedor responsável precisa resolver. Nada saiu, e repetir não adianta.
    const reason = error instanceof UnipileChatRequestError ? error.reason : null
    return { outcome: 'blocked', error: reason ?? `http_${error.status}` }
  }
  if (error instanceof UnipileUnreadableResponse) return { outcome: 'uncertain', error: 'unreadable_response' }
  return { outcome: 'uncertain', error: aborted ? 'timeout' : 'network' }
}

async function sendMessage(
  deps: SendChatStepDeps,
  released: ReleasedChatSend,
  userId: string,
  attachments: OutgoingAttachment[],
): Promise<Attempt> {
  const extra = attachments.length ? { attachments } : {}
  const sent = await withTimeout(deps.sendTimeoutMs ?? 25_000, (signal) =>
    released.provider_chat_id
      ? deps.unipile.sendChatMessage(released.unipile_account_id, released.provider_chat_id, released.body, {
        signal,
        ...extra,
      })
      : deps.unipile.startChat(released.unipile_account_id, { userId, text: released.body, ...extra }, { signal }))
  if ('error' in sent) return classifySendError(sent.error, sent.aborted)
  return {
    outcome: 'sent',
    chatId: sent.value.chat_id ?? released.provider_chat_id,
    messageId: sent.value.message_id,
  }
}

async function attemptWhatsApp(
  deps: SendChatStepDeps,
  released: ReleasedChatSend,
  attachments: OutgoingAttachment[],
): Promise<Attempt> {
  const userId = toWhatsAppUserId(released.destination)
  if (!userId) return { outcome: 'blocked', error: 'invalid_phone' }
  return { ...(await sendMessage(deps, released, userId, attachments)), providerUserId: userId }
}

async function attemptLinkedIn(
  deps: SendChatStepDeps,
  released: ReleasedChatSend,
  attachments: OutgoingAttachment[],
): Promise<Attempt> {
  // InMail está fora. A recusa vem antes do perfil: nada sai na Unipile, nem a consulta.
  if (released.linkedin_subtype === 'inmail') {
    return { outcome: 'blocked', error: 'linkedin_inmail_not_supported' }
  }

  const identifier = linkedInIdentifier(released.destination)
  if (!identifier) return { outcome: 'blocked', error: 'linkedin_profile_invalid' }
  const timeout = deps.sendTimeoutMs ?? 25_000

  // 1. O perfil público vira o id nativo, e a relação diz se é convite ou mensagem. Nada saiu ainda: qualquer falha
  // aqui é segura de tentar de novo, e uma recusa do provedor vira impedimento.
  const looked = await withTimeout(timeout, (signal) =>
    deps.unipile.getLinkedInProfile(released.unipile_account_id, identifier, { signal }))
  if ('error' in looked) {
    const error = looked.error
    if (error instanceof UnipileRequestError) {
      if (error.status === 404) return { outcome: 'blocked', error: 'linkedin_profile_not_found' }
      if (error.status === 408 || error.status === 429 || error.status >= 500) {
        return { outcome: 'failed', error: `profile_lookup_http_${error.status}`, retryAfterSeconds: error.retryAfterSeconds }
      }
      return { outcome: 'blocked', error: (error instanceof UnipileChatRequestError ? error.reason : null) ?? `http_${error.status}` }
    }
    return { outcome: 'failed', error: looked.aborted ? 'profile_lookup_timeout' : 'profile_lookup_failed' }
  }
  const profile = looked.value

  const decision = decideLinkedInAction(released.linkedin_subtype ?? 'convite', profile.firstDegree)
  if ('blocked' in decision) {
    return { outcome: 'blocked', error: decision.blocked, providerUserId: profile.providerId }
  }

  // 2. Convite com nota. A nota nunca é cortada em silêncio, e um segundo convite ao mesmo perfil não sai.
  if (decision.action === 'convite') {
    // O convite não leva anexo: o passo com arquivo espera o Vendedor responsável tirar o anexo ou mudar o passo.
    if (attachments.length) {
      return { outcome: 'blocked', error: 'attachment_not_supported_on_invite', providerUserId: profile.providerId }
    }
    if (characterCount(released.body) > released.invite_note_limit) {
      return { outcome: 'blocked', error: 'invite_note_too_long', providerUserId: profile.providerId }
    }
    if (released.invite_sent) {
      return { outcome: 'blocked', error: 'invite_already_sent', providerUserId: profile.providerId }
    }
    const invited = await withTimeout(timeout, (signal) =>
      deps.unipile.sendInvitation(released.unipile_account_id, { userId: profile.providerId, message: released.body }, { signal }))
    if ('error' in invited) {
      return { ...classifySendError(invited.error, invited.aborted), providerUserId: profile.providerId, action: 'convite' }
    }
    return { outcome: 'sent', messageId: invited.value.id, providerUserId: profile.providerId, action: 'convite' }
  }

  // 3. Mensagem a uma conexão: continua a conversa que já existe ou abre uma.
  const sent = await sendMessage(deps, released, profile.providerId, attachments)
  return { ...sent, providerUserId: profile.providerId, action: decision.action }
}

export async function sendChatStep(
  deps: SendChatStepDeps,
  args: { sendId: string; userId: string; release: () => Promise<ChatReleaseResult> },
): Promise<ChatStepSendResult> {
  const { sendId, userId } = args

  // Antes do próximo passo de uma conversa já aberta com o Contato, conferir a conversa pela API.
  let conversation: ChatConversation | null
  try {
    conversation = await deps.db.chatConversationForSend(sendId, userId)
  } catch {
    return { kind: 'blocked', outcome: 'thread_check_failed' }
  }
  if (conversation) {
    const checked = await checkChatConversation(deps, conversation)
    if (checked === 'failed') return { kind: 'blocked', outcome: 'thread_check_failed' }
    if (checked === 'reply_found') return { kind: 'blocked', outcome: 'reply_found' }
  }

  let released: ChatReleaseResult
  try {
    released = await args.release()
  } catch (error) {
    return (error as { code?: string })?.code === 'P0002' ? { kind: 'not_found' } : { kind: 'release_error' }
  }
  if (released.outcome !== 'released') return { kind: 'blocked', outcome: released.outcome }

  // Daqui em diante o Envio está em "sending": todo caminho grava um resultado. Um anexo que não serve ao canal não
  // sai e o Envio falha com o motivo; um que não deu para baixar agora falha como recusa passageira (nova tentativa).
  const prepared = await prepareAttachments(deps.attachments, sendId)
  if (prepared.kind === 'invalid') {
    try {
      await deps.attachments!.failSend(sendId, prepared.problem)
    } catch {
      return { kind: 'attempted', outcome: 'failed', recorded: false, reason: prepared.problem }
    }
    return { kind: 'attempted', outcome: 'failed', recorded: true, reason: prepared.problem }
  }
  const attempt: Attempt = prepared.kind === 'unavailable'
    ? { outcome: 'failed', error: 'attachment_download_failed' }
    : released.channel === 'whatsapp'
    ? await attemptWhatsApp(deps, released, prepared.attachments)
    : await attemptLinkedIn(deps, released, prepared.attachments)

  try {
    await deps.db.recordChatStepSendResult({
      sendId,
      outcome: attempt.outcome,
      providerChatId: attempt.chatId ?? null,
      providerMessageId: attempt.messageId ?? null,
      providerUserId: attempt.providerUserId ?? null,
      linkedinAction: attempt.action ?? null,
      error: attempt.error ?? null,
      retryAfterSeconds: attempt.retryAfterSeconds ?? null,
    })
  } catch {
    return { kind: 'attempted', outcome: attempt.outcome, recorded: false, ...(attempt.error ? { reason: attempt.error } : {}) }
  }
  return { kind: 'attempted', outcome: attempt.outcome, recorded: true, ...(attempt.error ? { reason: attempt.error } : {}) }
}
