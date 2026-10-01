// O envio de uma Proposta de resposta já aprovada, por canal (canais-09). O banco libera o envio (release_approved_reply) e
// devolve a revisão aprovada, o destinatário e a Conta remetente; cada canal tem um EnviadorDeResposta que sabe falar com o
// provedor dele e devolve só o desfecho (saiu, o provedor recusou ou ficou a dúvida). O E-mail usa o núcleo de
// _shared/send-step.ts. O WhatsApp e o LinkedIn entram quando o núcleo de chat existir: basta um enviador novo com o
// `canal` deles na lista da função reply-proposal-send, e o banco passa a liberar esse canal (p_channels).
import {
  enviarEmailComPrazo,
  type OutgoingEmail,
  type SendOutcome,
  type UnipileMail,
} from './send-step.ts'

export type CanalDaResposta = 'email' | 'whatsapp' | 'linkedin'

/** O que release_approved_reply devolve quando libera: a revisão aprovada, pronta para sair. */
export interface RespostaLiberada {
  outcome: 'released'
  proposal_id: string
  channel: CanalDaResposta
  unipile_account_id: string
  destination: string
  contact_name: string | null
  subject: string | null
  body: string
  /** A mensagem a que a resposta responde, na conversa do provedor (e-mail: o message_id). */
  reply_to_message_id: string | null
  tracking_header_name: string
  tracking_header_value: string
  revision: number
}

export type MotivoDoBloqueioDaResposta =
  | 'owner_not_responsible'
  | 'in_flight'
  | 'already_sent'
  | 'reconcile_required'
  | 'outdated'
  | 'not_approved'
  | 'channel_not_supported'
  | 'sequence_ended'
  | 'account_unavailable'
  | 'sender_not_ready'
  | 'contact_unlinked'
  | 'destination_changed'
  /** Só da função: a conversa não pôde ser conferida na Unipile antes de enviar. */
  | 'thread_check_failed'

export interface RespostaBloqueada {
  outcome: MotivoDoBloqueioDaResposta
  proposal_id: string
  channel: CanalDaResposta
  revision: number
}

export type LiberacaoDaResposta = RespostaLiberada | RespostaBloqueada

/** O que o provedor respondeu. `uncertain` é a dúvida: pode ter saído, então nunca se reenvia às cegas. */
export interface ResultadoDoEnvioDaResposta {
  outcome: SendOutcome
  providerEmailId?: string | null
  providerMessageId?: string | null
  providerThreadId?: string | null
  error?: string | null
}

export interface EnviadorDeResposta {
  /** O canal que este enviador atende; o banco só libera os canais que a função diz ter. */
  readonly canal: CanalDaResposta
  /** Envia a revisão aprovada, uma vez. Nunca lança por falha do provedor: devolve o desfecho. */
  enviar(resposta: RespostaLiberada, opcoes?: { timeoutMs?: number }): Promise<ResultadoDoEnvioDaResposta>
}

/** O e-mail da resposta: na conversa da mensagem de origem (`reply_to_message_id`), com o cabeçalho que a identifica. */
export function emailDaResposta(resposta: RespostaLiberada): OutgoingEmail {
  return {
    to: [{
      email: resposta.destination,
      ...(resposta.contact_name ? { display_name: resposta.contact_name } : {}),
    }],
    subject: resposta.subject?.trim() || '(sem assunto)',
    plain_text: resposta.body,
    custom_headers: [{ name: resposta.tracking_header_name, value: resposta.tracking_header_value }],
    ...(resposta.reply_to_message_id ? { reply_to_message_id: resposta.reply_to_message_id } : {}),
  }
}

/** O E-mail pela Unipile v2, pelo mesmo núcleo do envio de um passo (mesmo prazo e mesma regra de falha e de dúvida). */
export function enviadorDeEmail(unipile: UnipileMail): EnviadorDeResposta {
  return {
    canal: 'email',
    async enviar(resposta, opcoes) {
      const tentativa = await enviarEmailComPrazo(
        unipile,
        resposta.unipile_account_id,
        emailDaResposta(resposta),
        opcoes?.timeoutMs,
      )
      return {
        outcome: tentativa.outcome,
        providerEmailId: tentativa.sent?.id ?? null,
        providerMessageId: tentativa.sent?.message_id ?? null,
        providerThreadId: null,
        error: tentativa.error ?? null,
      }
    },
  }
}

export const MENSAGENS_DO_BLOQUEIO_DA_RESPOSTA: Record<MotivoDoBloqueioDaResposta, string> = {
  owner_not_responsible: 'Só o Vendedor responsável por esta Conta-alvo, com Participação ativa, envia esta resposta.',
  in_flight: 'Esta resposta já está sendo enviada.',
  already_sent: 'Esta resposta já foi enviada.',
  reconcile_required:
    'O último envio desta resposta ficou incerto. Confira a caixa de saída e diga se ela saiu antes de enviar de novo.',
  outdated: 'Chegou outra mensagem nesta conversa. Revise a resposta, edite ou gere de novo e aprove outra vez.',
  not_approved: 'Aprove esta revisão da resposta antes de enviar.',
  channel_not_supported: 'O envio de respostas por este canal ainda não está disponível.',
  sequence_ended: 'A Sequência desta Conta-alvo foi encerrada.',
  account_unavailable: 'A Conta-alvo está arquivada ou foi apagada.',
  sender_not_ready: 'Sua Conta remetente não está pronta para enviar. Reconecte-a em Conexões.',
  contact_unlinked: 'O Contato não está mais vinculado à Conta-alvo.',
  destination_changed: 'O endereço do Contato mudou depois da Aprovação. Edite o destinatário e aprove de novo.',
  thread_check_failed: 'Não foi possível conferir a conversa na Unipile antes de enviar. Tente de novo em instantes.',
}
