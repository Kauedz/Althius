import { describe, expect, it } from 'vitest'
import { motivoDoEnvio } from './motivos-do-envio'

describe('motivo do passo de WhatsApp para o número da própria Conta remetente', () => {
  it('diz com clareza por que o passo não saiu e o que fazer', () => {
    const motivo = motivoDoEnvio('destination_is_sender_account')
    expect(motivo).not.toBe('destination_is_sender_account')
    expect(motivo).toBe(
      'o número do Contato é o da própria Conta remetente de WhatsApp; troque o telefone do Contato ou a Conta remetente e ative os envios de novo',
    )
  })
})
