// O envio de uma Proposta de resposta aprovada (canais-09). A função confirma quem pede e a Participação dele; o banco
// (release_approved_reply) revalida tudo em nome do titular e marca o envio como "enviando", uma vez só; o enviador do
// canal fala com o provedor; e o banco grava o resultado (enviada, recusada ou incerta). Não decide nada sozinha: sem a
// Aprovação da revisão atual, o banco não libera e nada sai. A resposta aprovada é uma mensagem avulsa na conversa da
// mensagem de origem, não um passo da Sequência: enviar não retoma a Sequência. A Unipile e o banco entram por
// injeção de dependência, para o teste ir da requisição à resposta sem rede.
import { comCors } from '../_shared/cors.ts'
import {
  type CanalDaResposta,
  type EnviadorDeResposta,
  type LiberacaoDaResposta,
  MENSAGENS_DO_BLOQUEIO_DA_RESPOSTA,
  type MotivoDoBloqueioDaResposta,
  type RespostaLiberada,
  type ResultadoDoEnvioDaResposta,
} from '../_shared/enviador-de-resposta.ts'
import { checkConversation, type Conversation, type SendStepDb, type UnipileMail } from '../_shared/send-step.ts'

export interface Db extends Pick<SendStepDb, 'ingestEmailEvent'> {
  /** Quem assinou o JWT do navegador, ou null quando o token não vale. */
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  hasActiveMembership(workspaceId: string, userId: string): Promise<boolean>
  /** RPC conversation_for_reply: a Conta remetente e a conversa da mensagem de origem, ou null. */
  conversationForReply(proposalId: string, userId: string): Promise<Conversation | null>
  /** RPC release_approved_reply. Lança um erro com code quando o banco recusa (ex.: P0002). */
  releaseApprovedReply(proposalId: string, userId: string, canais: CanalDaResposta[]): Promise<LiberacaoDaResposta>
  /** RPC record_reply_send_result. */
  recordReplySendResult(
    proposalId: string,
    resultado: ResultadoDoEnvioDaResposta & { error: string | null },
  ): Promise<void>
}

export interface Deps {
  db: Db
  /** A leitura da Unipile para conferir a conversa antes de enviar (só leitura: quem envia são os enviadores). */
  unipile: UnipileMail
  /** Os canais que sabem enviar uma resposta. O banco só libera estes. */
  enviadores: EnviadorDeResposta[]
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

  function bloqueada(outcome: MotivoDoBloqueioDaResposta, proposalId: string) {
    return respond({ outcome, proposalId, message: MENSAGENS_DO_BLOQUEIO_DA_RESPOSTA[outcome] }, 409)
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
    const proposalId = typeof body.proposalId === 'string' ? body.proposalId : ''
    if (!UUID.test(workspaceId)) return respond({ error: 'Workspace obrigatório.' }, 400)
    if (!UUID.test(proposalId)) return respond({ error: 'Proposta de resposta obrigatória.' }, 400)

    if (!(await deps.db.hasActiveMembership(workspaceId, user.userId))) {
      return respond({ error: 'Participação ativa no Workspace não encontrada.' }, 403)
    }

    // Antes de enviar, a conversa é conferida na Unipile: o webhook reentrega só duas vezes, e uma mensagem perdida
    // deixaria a resposta de pé sobre uma conversa que andou. Uma mensagem nova achada ali é gravada e desatualiza a
    // proposta; se a conferência falha, a resposta não sai.
    let conversa: Conversation | null
    try {
      conversa = await deps.db.conversationForReply(proposalId, user.userId)
    } catch {
      return bloqueada('thread_check_failed', proposalId)
    }
    if (conversa) {
      const conferida = await checkConversation(deps, conversa)
      if (conferida === 'failed') return bloqueada('thread_check_failed', proposalId)
      if (conferida === 'reply_found') return bloqueada('outdated', proposalId)
    }

    let liberada: LiberacaoDaResposta
    try {
      liberada = await deps.db.releaseApprovedReply(proposalId, user.userId, deps.enviadores.map((e) => e.canal))
    } catch (error) {
      if ((error as { code?: string })?.code === 'P0002') return respond({ error: 'Proposta de resposta não encontrada.' }, 404)
      return respond({ error: 'Não foi possível liberar o envio.' }, 500)
    }
    if (liberada.outcome !== 'released') return bloqueada(liberada.outcome, proposalId)

    const resposta: RespostaLiberada = liberada
    const enviador = deps.enviadores.find((e) => e.canal === resposta.channel)
    let resultado: ResultadoDoEnvioDaResposta
    if (!enviador) {
      // Não deveria acontecer (o banco só libera os canais que a função diz ter). Nada foi enviado: a proposta volta a aprovada.
      resultado = { outcome: 'failed', error: 'channel_not_supported' }
    } else {
      try {
        resultado = await enviador.enviar(resposta, { timeoutMs: deps.sendTimeoutMs })
      } catch {
        // O enviador não lança por falha do provedor; se lançar, há dúvida: pode ter saído.
        resultado = { outcome: 'uncertain', error: 'sender_error' }
      }
    }

    try {
      await deps.db.recordReplySendResult(proposalId, { ...resultado, error: resultado.error ?? null })
    } catch {
      return respond({
        outcome: 'uncertain',
        proposalId,
        message: 'O envio foi tentado, mas o resultado ainda não foi gravado. Confira antes de reenviar.',
      }, 500)
    }

    if (resultado.outcome === 'sent') return respond({ outcome: 'sent', proposalId })
    if (resultado.outcome === 'failed') {
      return respond({
        outcome: 'failed',
        proposalId,
        message: 'O provedor não aceitou o envio. A resposta continua aprovada: tente de novo.',
      }, 502)
    }
    return respond({
      outcome: 'uncertain',
      proposalId,
      message: 'O provedor não respondeu a tempo. Confira a caixa de saída e diga se a resposta saiu antes de enviar de novo.',
    }, 504)
  })
}
