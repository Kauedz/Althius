import { describe, expect, it } from 'vitest'
import { mensagemDaFalha } from './supabase-conversas'

describe('Falhas da chave de IA do cliente', () => {
  it('a chave que o provedor recusou diz o motivo e manda avisar o Administrador', () => {
    expect(mensagemDaFalha('workspace_ai_key_invalid')).toBe(
      'O provedor de IA recusou a chave do Workspace. Avise o Administrador.',
    )
  })

  it('a chave ligada sem valor no cofre diz o motivo, sem inventar resposta', () => {
    expect(mensagemDaFalha('workspace_ai_key_unavailable')).toBe(
      'A chave de IA do Workspace não está disponível. Avise o Administrador.',
    )
  })

  it('um motor que não sabe usar a chave do cliente diz o motivo', () => {
    expect(mensagemDaFalha('workspace_ai_key_unsupported')).toBe(
      'Este Workspace usa a própria chave de IA, e o motor dos Agentes ainda não a aceita. Avise o Administrador.',
    )
  })
})
