import type { Contato } from './contas-tipos'

/** O rótulo de um e-mail do Contato, de uma lista fixa (não há texto livre). */
export type RotuloDeEmail = 'trabalho' | 'pessoal' | 'outro'

/** O tipo de um telefone do Contato, de uma lista fixa. "Usa WhatsApp" é outra marca, independente do tipo. */
export type TipoDeTelefone = 'celular' | 'fixo'

export const ROTULOS_DE_EMAIL: Record<RotuloDeEmail, string> = { trabalho: 'Trabalho', pessoal: 'Pessoal', outro: 'Outro' }
export const TIPOS_DE_TELEFONE: Record<TipoDeTelefone, string> = { celular: 'Celular', fixo: 'Fixo' }

/** Quantos e-mails e quantos telefones um Contato tem, no máximo. */
export const LIMITE_DE_CANAIS = 3

export interface EmailDoContato {
  valor: string
  rotulo: RotuloDeEmail
}

export interface TelefoneDoContato {
  valor: string
  tipo: TipoDeTelefone
  whatsapp: boolean
}

/** As listas de e-mails e de telefones do Contato: o primeiro item de cada uma é o principal. */
export interface CanaisDoContato {
  emails: EmailDoContato[]
  telefones: TelefoneDoContato[]
}

/** A posição do e-mail ou do telefone que o passo usa: de 1 (o principal) a 3; ausente ou fora disso vale 1. */
export function posicaoDoDestino(destino?: number): number {
  return Number.isInteger(destino) && destino! >= 1 && destino! <= LIMITE_DE_CANAIS ? destino! : 1
}

/**
 * O e-mail que o passo usa: o da posição `destino` na lista do Contato. Um Contato sem as listas (a fonte não as
 * informa) tem só o principal.
 */
export function emailDoPasso(contato: Contato | undefined, destino?: number): string | undefined {
  if (!contato) return undefined
  const posicao = posicaoDoDestino(destino)
  if (contato.emails) return contato.emails[posicao - 1]?.valor
  return posicao === 1 ? contato.email : undefined
}

/**
 * O telefone que o passo usa e se ele usa WhatsApp. Sem as listas, o único telefone do Contato é o principal, que
 * sempre foi o WhatsApp dele.
 */
export function telefoneDoPasso(
  contato: Contato | undefined,
  destino?: number,
): { valor: string; whatsapp: boolean } | undefined {
  if (!contato) return undefined
  const posicao = posicaoDoDestino(destino)
  if (contato.telefones) return contato.telefones[posicao - 1]
  return posicao === 1 && contato.whatsapp ? { valor: contato.whatsapp, whatsapp: true } : undefined
}

/** Quantos e-mails e telefones o Contato tem além do principal, para o "+N" das listas. */
export function canaisAdicionais(contato: Contato): { emails: number; telefones: number } {
  return {
    emails: Math.max(0, (contato.emails?.length ?? 0) - 1),
    telefones: Math.max(0, (contato.telefones?.length ?? 0) - 1),
  }
}
