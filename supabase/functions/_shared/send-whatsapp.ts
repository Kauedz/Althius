// O núcleo do envio de um passo de WhatsApp (canais-06, parte 1), irmão do de E-mail (send-step.ts) e compartilhado do
// mesmo jeito pelo envio pedido pelo titular (sequence-step-sends) e pelo Executor (sequence-runner). O banco decide
// tudo o que é regra (titular, responsável, versão, janela, Conta de WhatsApp do próprio titular, número fixado,
// espaçamento) ao liberar; aqui só se fala com a Unipile e se grava o resultado:
//
//   1. primeira mensagem ao Contato (o banco não achou uma conversa gravada): confere que o número tem WhatsApp
//      (GET /v2/{account_id}/users/{user_id}); 404 bloqueia sem enviar, e uma falha da conferência (5xx, tempo esgotado,
//      429...) não envia e tenta de novo depois; depois abre a conversa (POST /chats/send);
//   2. conversa já gravada por um envio anterior desta Sequência ao mesmo número: envia nela
//      (POST /chats/{chat_id}/messages/send), sem conferir o número de novo.
//
// A Unipile não documenta o corpo da resposta desses envios: qualquer 2xx vale como "aceito pelo provedor", o id da
// mensagem só é lido com tolerância (fica vazio quando não vem) e nada aqui depende de nomes de campos desconhecidos.
// Um pedido que pode ter sido aceito (tempo esgotado, falha de rede, 5xx) fica incerto e nunca é reenviado sozinho.
import {
  type BlockedSend,
  type SendOutcome,
  type SendStepDb,
  type StepSendResult,
  UnipileRequestError,
} from './send-step.ts'

export interface ReleasedWhatsappSend {
  outcome: 'released'
  send_id: string
  unipile_account_id: string
  /** O número fixado na confirmação, normalizado: `+` e os dígitos. */
  destination: string
  contact_name: string | null
  body: string
  /** A conversa de um envio anterior da Sequência ao mesmo número, pela mesma Conta; null na primeira mensagem. */
  provider_chat_id: string | null
}

export type WhatsappReleaseResult = ReleasedWhatsappSend | BlockedSend

/** O que a Unipile devolve ao aceitar uma mensagem: só o que veio de forma legível, senão null. */
export interface ChatSent {
  chatId: string | null
  messageId: string | null
}

/** A Unipile v2 para WhatsApp. Todas as chamadas recebem o sinal de tempo esgotado. */
export interface UnipileChat {
  /** GET /v2/{account_id}/users/{user_id}: true se existe (200), false se o número não tem WhatsApp (404). */
  userExists(accountId: string, userId: string, options: { signal: AbortSignal }): Promise<boolean>
  /** POST /v2/{account_id}/chats/send: abre (ou continua) a conversa individual com o destinatário. */
  startChat(accountId: string, userId: string, text: string, options: { signal: AbortSignal }): Promise<ChatSent>
  /** POST /v2/{account_id}/chats/{chat_id}/messages/send: envia numa conversa existente. */
  sendInChat(accountId: string, chatId: string, text: string, options: { signal: AbortSignal }): Promise<ChatSent>
}

/** O que o núcleo usa do banco para o WhatsApp, além de gravar o resultado. */
export interface WhatsappStepDb {
  recordStepSendResult: SendStepDb['recordStepSendResult']
  /** RPC block_whatsapp_step_send: a Unipile disse que o número não tem WhatsApp; nada foi enviado. */
  blockStep(sendId: string, reason: 'destination_no_whatsapp'): Promise<void>
  /** RPC release_whatsapp_step_send: o titular pede o envio. Lança um erro com code quando o banco recusa (P0002). */
  releaseSend(sendId: string, userId: string): Promise<WhatsappReleaseResult>
  /** RPC release_due_whatsapp_step_send: o Executor libera um passo vencido em nome do titular. */
  releaseDueSend(sendId: string): Promise<WhatsappReleaseResult>
  /** RPC step_send_channel: o canal de um Envio do titular ('email' ou 'whatsapp'), ou null. */
  stepSendChannel(sendId: string, userId: string): Promise<string | null>
}

export interface WhatsappPort {
  db: WhatsappStepDb
  chat: UnipileChat
  /** Depois disso, o resultado do envio é incerto. Padrão 25 s. */
  sendTimeoutMs?: number
  /** Depois disso, a conferência do número falhou (e nada foi enviado). Padrão 10 s. */
  checkTimeoutMs?: number
}

/**
 * O id do destinatário na Unipile: número internacional completo, sem espaços, sem "+" e sem formatação, e
 * `@s.whatsapp.net`. Null quando o número não é `+` e 8 a 15 dígitos (o banco só guarda esse formato).
 */
export function whatsappRecipientId(phone: string): string | null {
  const digits = phone.replace(/^\+/, '')
  return /^[0-9]{8,15}$/.test(digits) ? `${digits}@s.whatsapp.net` : null
}

/** Um envio de WhatsApp que pode ter saído mesmo sem resposta legível: tempo esgotado do servidor ou erro dele. */
function mayHaveBeenAccepted(status: number) {
  return status === 408 || status >= 500
}

/** O código gravado quando a Unipile recusou (4xx): curto e específico o bastante para o titular entender. */
function refusalCode(status: number) {
  return status === 429 ? 'rate_limited' : `http_${status}`
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return { value: await run(controller.signal), aborted: false as const }
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      aborted: controller.signal.aborted,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function sendWhatsappStep(
  port: WhatsappPort,
  args: { sendId: string; release: () => Promise<WhatsappReleaseResult> },
): Promise<StepSendResult> {
  const { sendId } = args

  let released: WhatsappReleaseResult
  try {
    released = await args.release()
  } catch (error) {
    return (error as { code?: string })?.code === 'P0002' ? { kind: 'not_found' } : { kind: 'release_error' }
  }
  if (released.outcome !== 'released') return { kind: 'blocked', outcome: released.outcome }

  const record = async (
    outcome: SendOutcome,
    extra: { error?: string; retryAfterSeconds?: number | null; messageId?: string | null; chatId?: string | null } =
      {},
  ): Promise<StepSendResult> => {
    try {
      await port.db.recordStepSendResult({
        sendId,
        outcome,
        providerMessageId: extra.messageId ?? null,
        providerChatId: extra.chatId ?? null,
        error: extra.error ?? null,
        retryAfterSeconds: extra.retryAfterSeconds ?? null,
      })
    } catch {
      return { kind: 'attempted', outcome, recorded: false }
    }
    return { kind: 'attempted', outcome, recorded: true }
  }

  const recipientId = whatsappRecipientId(released.destination)
  if (!recipientId) {
    // O banco só guarda números no formato certo; sem o id do destinatário, nada é enviado.
    return await record('failed', { error: 'invalid_destination' })
  }
  const account = released.unipile_account_id
  let chatId = released.provider_chat_id

  // Primeira mensagem ao Contato: o número precisa ter WhatsApp. Nada é enviado antes disso.
  if (!chatId) {
    let exists: boolean
    try {
      exists = (await withTimeout(port.checkTimeoutMs ?? 10_000, (signal) =>
        port.chat.userExists(account, recipientId, { signal }))).value
    } catch (error) {
      // A conferência falhou (5xx, tempo esgotado, limite, rede): nada saiu, e o passo tenta de novo depois.
      const retryAfterSeconds = error instanceof UnipileRequestError ? error.retryAfterSeconds : null
      await record('failed', { error: 'destination_check_failed', retryAfterSeconds })
      return { kind: 'blocked', outcome: 'destination_check_failed' }
    }
    if (!exists) {
      try {
        await port.db.blockStep(sendId, 'destination_no_whatsapp')
      } catch {
        return { kind: 'release_error' }
      }
      return { kind: 'blocked', outcome: 'destination_no_whatsapp' }
    }
  }

  let sent: ChatSent
  try {
    const existingChat = chatId
    sent = (await withTimeout(port.sendTimeoutMs ?? 25_000, (signal) =>
      existingChat
        ? port.chat.sendInChat(account, existingChat, released.body, { signal })
        : port.chat.startChat(account, recipientId, released.body, { signal }))).value
  } catch (error) {
    // 4xx é recusa: nada saiu. Tempo esgotado, falha de rede e 5xx deixam dúvida: pode ter saído, e o envio nunca é
    // repetido sozinho (o titular confere no WhatsApp e resolve).
    if (error instanceof UnipileRequestError) {
      if (mayHaveBeenAccepted(error.status)) return await record('uncertain', { error: `http_${error.status}` })
      return await record('failed', { error: refusalCode(error.status), retryAfterSeconds: error.retryAfterSeconds })
    }
    return await record('uncertain', { error: (error as { aborted?: boolean })?.aborted ? 'timeout' : 'network' })
  }

  // Numa conversa individual, o chat_id devolvido é o próprio id do destinatário.
  chatId = sent.chatId ?? chatId ?? recipientId
  return await record('sent', { messageId: sent.messageId, chatId })
}
