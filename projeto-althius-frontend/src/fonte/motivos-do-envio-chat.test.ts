import { describe, expect, it } from 'vitest'
import { motivoDoEnvio } from './motivos-do-envio'

describe('motivos do LinkedIn que o envio de chat grava', () => {
  it('traduz os códigos que o provedor devolve', () => {
    expect(motivoDoEnvio('insufficient_credits')).toBe('os créditos do LinkedIn desta conta acabaram')
    expect(motivoDoEnvio('subscription_required')).toBe('esta ação do LinkedIn pede uma assinatura que a conta não tem')
    expect(motivoDoEnvio('linkedin_not_connected')).toBe('o Contato ainda não é conexão de primeiro grau no LinkedIn')
    expect(motivoDoEnvio('not_connected')).toBe('o Contato não é uma conexão no LinkedIn')
    expect(motivoDoEnvio('recipient_not_found')).toBe('o LinkedIn não encontrou o destinatário')
    expect(motivoDoEnvio('provider_limit_reached')).toBe('o LinkedIn atingiu o limite de envios desta conta')
    expect(motivoDoEnvio('invite_already_pending')).toBe('já existe um convite pendente para este perfil no LinkedIn')
  })
})
