import { describe, expect, it } from 'vitest'
import { mensagemDaFalha } from './supabase-conversas'

describe('Falha por falta de créditos', () => {
  it('a Execução que falhou por saldo diz o motivo em palavras de quem pediu', () => {
    expect(mensagemDaFalha('insufficient_credits')).toBe(
      'O Workspace está sem créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.',
    )
  })

  it('um código desconhecido continua com a mensagem genérica', () => {
    expect(mensagemDaFalha('qualquer_outro')).toBe('Não foi possível responder agora.')
  })
})
