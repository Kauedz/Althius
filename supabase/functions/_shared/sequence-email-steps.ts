// Passos de E-mail da Sequência: o responsável confirma, a Althius envia pela Conta remetente dele e reconcilia
// um resultado incerto antes de qualquer reenvio. Toda regra de autorização e de estado mora nas RPCs do banco.
import { type Rpc, RpcError } from './rpc.ts'
import type { UnipileEmail } from './unipile-email.ts'

export interface StepsHandlerDeps {
  /** Identifica o usuário pelo JWT do Supabase Auth e devolve RPCs que rodam com a sessão dele. */
  authenticate(request: Request): Promise<{ userId: string; rpc: Rpc } | null>
  serviceRpc: Rpc
  unipile: UnipileEmail | null
  corsHeaders: Record<string, string>
}

interface Claim {
  outcome: string
  unipile_account_id?: string
  destination?: string
  display_name?: string
  subject?: string
  body?: string
  idempotency_key?: string
}

interface ReconciliationTarget {
  status: string
  unipile_account_id: string | null
  destination: string
  subject: string
  claimed_at: string | null
}

// As mensagens que o banco devolve em inglês, na linguagem da interface.
const userMessages: Record<string, string> = {
  'only an active sequence can confirm steps': 'A Sequência precisa estar ativa para confirmar passos.',
  'step not found in the sequence document': 'Passo não encontrado no documento da Sequência.',
  'only email steps can be sent for now': 'Por enquanto só passos de E-mail são enviados.',
  'email step needs a body': 'O passo de E-mail precisa de corpo.',
  'step contact is not a confirmed participant': 'O Contato do passo não é participante confirmado da Sequência.',
  'step contact has no active link with this target account': 'O Contato do passo não tem Vínculo ativo com a Conta-alvo.',
  'contact has no email destination': 'O Contato do passo não tem e-mail cadastrado.',
  'no ready email sender account owned by the responsible seller': 'Conecte sua Conta remetente de E-mail antes de enviar.',
  'choose which email sender account sends this step': 'Escolha qual Conta remetente de E-mail envia este passo.',
  'step was already sent or its send is unresolved': 'Este passo já foi enviado ou tem um envio sem resultado.',
  'reconcile with the provider before deciding': 'A Althius ainda está conferindo com o provedor se o e-mail saiu.',
  'step send is not uncertain': 'Este envio não está incerto.',
}

export function createSequenceEmailStepsHandler(deps: StepsHandlerDeps) {
  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...deps.corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  function failure(error: unknown) {
    if (error instanceof RpcError) {
      if (error.code === '42501') {
        return respond({ error: 'Apenas o Vendedor responsável ativo pode operar este passo.' }, 403)
      }
      const message = userMessages[error.message]
      if (message) return respond({ error: message }, 422)
    }
    return respond({ error: 'Não foi possível concluir a solicitação.' }, 500)
  }

  async function reconcile(unipile: UnipileEmail, sendId: string, userId: string) {
    const target = await deps.serviceRpc('get_step_send_for_reconciliation', {
      p_send_id: sendId, p_requested_by: userId,
    }) as ReconciliationTarget
    if (target.status !== 'uncertain') return { status: target.status }
    if (!target.unipile_account_id || !target.claimed_at) return { status: 'uncertain' }

    const found = await unipile.findSent({
      accountId: target.unipile_account_id,
      to: target.destination,
      subject: target.subject,
      since: new Date(target.claimed_at),
    })
    // Sem resposta do provedor não há reconciliação: o envio segue incerto e nada é reenviado.
    if (found.found === 'unknown') return { status: 'uncertain' }

    const result = await deps.serviceRpc('reconcile_step_send', {
      p_send_id: sendId,
      p_found: found.found,
      p_tracking_id: found.found ? found.trackingId ?? null : null,
      p_provider_email_id: found.found ? found.emailId ?? null : null,
      p_provider_message_id: found.found ? found.messageId ?? null : null,
    }) as { status: string }
    return result.status === 'uncertain' ? { status: 'uncertain', decision: 'owner' } : { status: result.status }
  }

  async function send(unipile: UnipileEmail, sendId: string, userId: string) {
    const claim = await deps.serviceRpc('claim_step_send', { p_send_id: sendId, p_requested_by: userId }) as Claim
    if (claim.outcome === 'needs_reconciliation') return await reconcile(unipile, sendId, userId)
    if (claim.outcome === 'already_accepted') return { status: 'accepted' }
    if (claim.outcome !== 'claimed') return { status: claim.outcome }

    const result = await unipile.send({
      accountId: claim.unipile_account_id!,
      to: { email: claim.destination!, name: claim.display_name },
      subject: claim.subject ?? '',
      body: claim.body ?? '',
      idempotencyKey: claim.idempotency_key!,
    })
    const recorded = await deps.serviceRpc('record_step_send_result', {
      p_send_id: sendId,
      p_outcome: result.kind === 'rejected' ? 'failed' : result.kind,
      p_tracking_id: result.kind === 'accepted' ? result.trackingId : null,
      p_reason: result.kind === 'accepted' ? null : result.reason,
    }) as { status: string }
    return { status: recorded.status }
  }

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: deps.corsHeaders })
    if (request.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    const caller = await deps.authenticate(request)
    if (!caller) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return respond({ error: 'Pedido inválido.' }, 400)
    }
    const text = (key: string) => typeof body?.[key] === 'string' ? body[key] as string : ''

    try {
      if (body?.action === 'confirm') {
        if (!text('sequenceId') || !text('stepId')) return respond({ error: 'Sequência e passo obrigatórios.' }, 400)
        const confirmed = await caller.rpc('confirm_email_step', {
          p_sequence_id: text('sequenceId'),
          p_step_id: text('stepId'),
          p_sender_account_id: text('senderAccountId') || null,
        }) as { send_id: string; status: string; destination: string }
        return respond({ sendId: confirmed.send_id, status: confirmed.status, destination: confirmed.destination })
      }

      if (body?.action === 'send' || body?.action === 'resend') {
        const sendId = text('sendId')
        if (!sendId) return respond({ error: 'Envio obrigatório.' }, 400)
        if (!deps.unipile) return respond({ error: 'A integração com a Unipile ainda não está configurada.' }, 503)
        // Reenviar um envio incerto é decisão do titular, registrada com a sessão dele.
        if (body.action === 'resend') await caller.rpc('resolve_uncertain_step_send', { p_send_id: sendId })
        return respond(await send(deps.unipile, sendId, caller.userId))
      }

      return respond({ error: 'Ação não reconhecida.' }, 400)
    } catch (error) {
      return failure(error)
    }
  }
}
