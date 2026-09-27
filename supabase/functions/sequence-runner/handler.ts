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
  type UnipileMail,
} from '../_shared/send-step.ts'

export interface DueSend {
  send_id: string
  owner_user_id: string
}

/** Uma Conta remetente que voltou depois de uma queda e espera a reconciliação, reservada pelo Executor. */
export interface SenderToReconcile {
  sender_account_id: string
  unipile_account_id: string
  owner_user_id: string
  /** Quando a reserva foi feita: volta no fechamento, para uma nova queda no meio pedir outra rodada. */
  claimed_at: string
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
  /** RPC conversations_to_reconcile: as conversas das Sequências ativas que saíram pela conta. */
  conversationsToReconcile(senderAccountId: string): Promise<Conversation[]>
  /** RPC finish_sender_reconciliation: libera a conta, se ela não caiu de novo depois da reserva. */
  finishSenderReconciliation(senderAccountId: string, claimedAt: string): Promise<boolean>
}

export interface Deps {
  db: RunnerDb
  unipile: UnipileMail
  /** Passos por chamada: cada um pode levar até o prazo do envio, e a função tem tempo limitado. Padrão 5. */
  maxPerRun?: number
  sendTimeoutMs?: number
  /** Continua o trabalho depois da resposta (EdgeRuntime.waitUntil). Padrão: fire-and-forget. */
  waitUntil?: (work: Promise<unknown>) => void
  log?: (fields: Record<string, unknown>) => void
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const waitUntil = deps.waitUntil ?? ((work) => {
    work.catch(() => {})
  })

  function respond(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  // Uma conta que voltou de uma queda só envia de novo depois de conferir, na Unipile, as conversas que tinham saído
  // por ela: uma resposta que chegou com a conta fora do ar é gravada e pausa a Sequência antes do próximo passo.
  async function reconcile(account: SenderToReconcile) {
    const senderAccountId = account.sender_account_id
    let conversations: Conversation[]
    try {
      conversations = await deps.db.conversationsToReconcile(senderAccountId)
    } catch {
      log({ type: 'reconcile', senderAccountId, outcome: 'list_failed' })
      return
    }
    let replies = 0
    if (conversations.length > 0) {
      let senders: string[]
      try {
        senders = await deps.unipile.listEmailSenders(account.unipile_account_id)
      } catch {
        log({
          type: 'reconcile',
          senderAccountId,
          conversations: conversations.length,
          replies,
          outcome: 'check_failed',
        })
        return
      }
      for (const conversation of conversations) {
        const checked = await checkConversation(deps, conversation, senders)
        if (checked === 'failed') {
          // A conta continua bloqueada; a reserva expira e a próxima rodada tenta de novo.
          log({
            type: 'reconcile',
            senderAccountId,
            conversations: conversations.length,
            replies,
            outcome: 'check_failed',
          })
          return
        }
        if (checked === 'reply_found') replies++
      }
    }
    const released = await deps.db.finishSenderReconciliation(senderAccountId, account.claimed_at)
    log({
      type: 'reconcile',
      senderAccountId,
      conversations: conversations.length,
      replies,
      outcome: released ? 'ready' : 'dropped_again',
    })
  }

  async function run() {
    // A reconciliação vem antes dos envios: uma conta liberada nesta rodada já pode enviar os passos vencidos.
    let accounts: SenderToReconcile[] = []
    try {
      accounts = await deps.db.claimSenderReconciliations(3)
    } catch (error) {
      log({
        type: 'reconcile',
        outcome: 'claim_failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    for (const account of accounts) {
      try {
        await reconcile(account)
      } catch (error) {
        log({
          type: 'reconcile',
          senderAccountId: account.sender_account_id,
          outcome: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    let due: DueSend[]
    try {
      due = await deps.db.claimDueSends(deps.maxPerRun ?? 5)
    } catch (error) {
      log({ type: 'runner', outcome: 'claim_failed', message: error instanceof Error ? error.message : String(error) })
      return
    }
    // Um passo por vez: a mesma Conta remetente não recebe envios em rajada.
    for (const { send_id: sendId, owner_user_id: userId } of due) {
      try {
        const result = await sendStep(deps, { sendId, userId, release: () => deps.db.releaseDueSend(sendId) })
        log({
          type: 'runner',
          sendId,
          outcome: result.kind === 'blocked' || result.kind === 'attempted' ? result.outcome : result.kind,
          ...(result.kind === 'attempted' && !result.recorded ? { recorded: false } : {}),
        })
      } catch (error) {
        log({
          type: 'runner',
          sendId,
          outcome: 'error',
          message: error instanceof Error ? error.message : String(error),
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
