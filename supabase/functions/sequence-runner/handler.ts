// O Executor da Sequência (canais-05): a cada minuto o banco (pg_cron + pg_net) chama esta função quando há passo
// automático vencido. Ela reserva os passos (claim_due_step_sends) e envia cada um pelo núcleo compartilhado, liberando
// pelo banco com release_due_step_send, que revalida tudo em nome do titular. A chamada prova que veio do banco pelo
// token guardado nele (x-runner-token); a resposta sai logo e o trabalho segue em segundo plano.
import {
  checkConversation,
  type Conversation,
  type ReleaseResult,
  sendStep,
  type SendStepDb,
  type StepSendResult,
  type UnipileMail,
} from '../_shared/send-step.ts'
import { sendWhatsappStep, type WhatsappPort } from '../_shared/send-whatsapp.ts'

export interface DueSend {
  send_id: string
  owner_user_id: string
  /** O canal do passo ('email' ou 'whatsapp'). Ausente (banco anterior ao canais-06) vale 'email'. */
  channel?: string
}

/** Uma Conta remetente que voltou depois de uma queda e espera a reconciliação, reservada pelo Executor. */
export interface SenderToReconcile {
  sender_account_id: string
  unipile_account_id: string
  /** Quando a reserva foi feita: volta no progresso e no fechamento, para uma nova queda no meio pedir outra rodada. */
  claimed_at: string
}

/** Uma conversa a conferir: a do último e-mail que saiu pela conta para um Contato de uma Sequência. */
export interface ConversationToReconcile {
  send_id: string
  provider_thread_id: string | null
  provider_email_id: string | null
  sent_at: string
}

export interface RunnerDb extends SendStepDb {
  /** RPC sequence_runner_token_matches: o token que o banco guarda e manda no cabeçalho. */
  tokenMatches(token: string): Promise<boolean>
  /** RPC claim_due_step_sends: os passos automáticos vencidos, reservados por 2 minutos. */
  claimDueSends(limit: number): Promise<DueSend[]>
  /** RPC release_due_step_send. Lança um erro com code quando o banco recusa (ex.: P0002). */
  releaseDueSend(sendId: string): Promise<ReleaseResult>
  /** RPC claim_sender_reconciliations: as contas que voltaram e esperam a reconciliação, reservadas por 5 minutos. */
  claimSenderReconciliations(limit: number): Promise<SenderToReconcile[]>
  /** RPC conversations_to_reconcile: a próxima página de conversas, a partir de onde a reconciliação parou. */
  conversationsToReconcile(senderAccountId: string, limit: number): Promise<ConversationToReconcile[]>
  /** RPC record_reconciliation_progress: guarda até onde foi e renova a reserva; false se a conta caiu de novo. */
  recordReconciliationProgress(
    senderAccountId: string,
    claimedAt: string,
    checked: Pick<ConversationToReconcile, 'send_id' | 'sent_at'>,
  ): Promise<boolean>
  /** RPC finish_sender_reconciliation: libera a conta, se ela não caiu de novo depois da reserva. */
  finishSenderReconciliation(senderAccountId: string, claimedAt: string): Promise<boolean>
}

export interface Deps {
  db: RunnerDb
  unipile: UnipileMail
  /** O caminho do WhatsApp (canais-06). Sem ele, um passo vencido de WhatsApp fica sem envio e é só registrado. */
  whatsapp?: WhatsappPort
  /** Passos por chamada: cada um pode levar até o prazo do envio, e a função tem tempo limitado. Padrão 5. */
  maxPerRun?: number
  /** Contas reconciliadas por chamada. Padrão 3. */
  maxReconciliationsPerRun?: number
  /** Tempo da rodada para reconciliar, antes dos envios; o que faltar continua na próxima. Padrão 60 s. */
  reconcileBudgetMs?: number
  /** Relógio do orçamento de tempo. Padrão Date.now. */
  now?: () => number
  sendTimeoutMs?: number
  /** Continua o trabalho depois da resposta (EdgeRuntime.waitUntil). Padrão: fire-and-forget. */
  waitUntil?: (work: Promise<unknown>) => void
  log?: (fields: Record<string, unknown>) => void
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const now = deps.now ?? Date.now
  const waitUntil = deps.waitUntil ?? ((work) => {
    work.catch(() => {})
  })

  function respond(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  // Uma conta que voltou de uma queda só envia de novo depois de conferir, na Unipile, as conversas que tinham saído
  // por ela: uma resposta que chegou com a conta fora do ar é gravada e pausa a Sequência antes do próximo passo.
  // A conferência vai em páginas e guarda até onde foi; sem tempo ou com uma falha, a próxima rodada continua dali.
  async function reconcile(account: SenderToReconcile, deadline: number) {
    const senderAccountId = account.sender_account_id
    let checked = 0
    let replies = 0
    let senders: string[] | undefined
    const report = (outcome: string) => log({ type: 'reconcile', senderAccountId, checked, replies, outcome })
    while (true) {
      if (now() >= deadline) return report('continues_next_round')
      let page: ConversationToReconcile[]
      try {
        page = await deps.db.conversationsToReconcile(senderAccountId, 25)
      } catch {
        return report('list_failed')
      }
      if (page.length === 0) break
      try {
        senders ??= await deps.unipile.listEmailSenders(account.unipile_account_id)
      } catch {
        return report('check_failed')
      }
      for (const row of page) {
        const conversation: Conversation = {
          unipile_account_id: account.unipile_account_id,
          provider_thread_id: row.provider_thread_id,
          provider_email_id: row.provider_email_id,
        }
        const result = await checkConversation(deps, conversation, senders)
        if (result === 'failed') return report('check_failed')
        if (result === 'reply_found') replies++
        checked++
      }
      const last = page[page.length - 1]
      if (!(await deps.db.recordReconciliationProgress(senderAccountId, account.claimed_at, last))) {
        return report('dropped_again')
      }
    }
    const released = await deps.db.finishSenderReconciliation(senderAccountId, account.claimed_at)
    report(released ? 'ready' : 'dropped_again')
  }

  async function run() {
    // A reconciliação vem antes dos envios: uma conta liberada nesta rodada já pode enviar os passos vencidos.
    const deadline = now() + (deps.reconcileBudgetMs ?? 60_000)
    let accounts: SenderToReconcile[] = []
    try {
      accounts = await deps.db.claimSenderReconciliations(deps.maxReconciliationsPerRun ?? 3)
    } catch (error) {
      log({ type: 'reconcile', outcome: 'claim_failed', message: messageOf(error) })
    }
    for (const account of accounts) {
      try {
        await reconcile(account, deadline)
      } catch (error) {
        log({
          type: 'reconcile',
          senderAccountId: account.sender_account_id,
          outcome: 'error',
          message: messageOf(error),
        })
      }
    }

    let due: DueSend[]
    try {
      due = await deps.db.claimDueSends(deps.maxPerRun ?? 5)
    } catch (error) {
      log({ type: 'runner', outcome: 'claim_failed', message: messageOf(error) })
      return
    }
    // Um passo por vez. O banco já entrega no máximo um passo de WhatsApp por Conta remetente e nenhum dentro do
    // espaçamento mínimo, então a mesma Conta não recebe envios em rajada.
    for (const { send_id: sendId, owner_user_id: userId, channel } of due) {
      try {
        let result: StepSendResult
        if (channel === 'whatsapp') {
          const whatsapp = deps.whatsapp
          if (!whatsapp) {
            log({ type: 'runner', sendId, channel, outcome: 'whatsapp_not_configured' })
            continue
          }
          result = await sendWhatsappStep(whatsapp, { sendId, release: () => whatsapp.db.releaseDueSend(sendId) })
        } else {
          result = await sendStep(deps, { sendId, userId, release: () => deps.db.releaseDueSend(sendId) })
        }
        log({
          type: 'runner',
          sendId,
          ...(channel === 'whatsapp' ? { channel } : {}),
          outcome: result.kind === 'blocked' || result.kind === 'attempted' ? result.outcome : result.kind,
          ...(result.kind === 'attempted' && !result.recorded ? { recorded: false } : {}),
        })
      } catch (error) {
        log({
          type: 'runner',
          sendId,
          outcome: 'error',
          message: messageOf(error),
        })
      }
    }
  }

  return async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)
    const token = req.headers.get('x-runner-token') ?? ''
    let allowed = false
    try {
      allowed = token.length >= 32 && await deps.db.tokenMatches(token)
    } catch {
      return respond({ error: 'Não foi possível conferir a chamada.' }, 500)
    }
    if (!allowed) return respond({ error: 'Chamada não autorizada.' }, 401)
    waitUntil(run())
    return respond({ accepted: true }, 202)
  }
}
