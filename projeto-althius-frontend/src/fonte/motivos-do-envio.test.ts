import { describe, expect, it } from 'vitest'
import { motivoDoEnvio } from './motivos-do-envio'

describe('motivoDoEnvio', () => {
  it('explica em português os impedimentos de WhatsApp e LinkedIn', () => {
    expect(motivoDoEnvio('channel_not_enabled')).toBe(
      'o envio por este canal ainda não foi liberado na Althius',
    )
    expect(motivoDoEnvio('invite_already_sent')).toBe('já existe um convite pendente para este perfil no LinkedIn')
    expect(motivoDoEnvio('linkedin_profile_not_found')).toBe('o LinkedIn não encontrou o perfil do Contato')
    expect(motivoDoEnvio('linkedin_inmail_not_supported')).toBe(
      'o InMail não é enviado pela Althius; troque o passo para Convite ou Mensagem e ative os envios de novo',
    )
    expect(motivoDoEnvio('invalid_phone')).toBe('o telefone do Contato não é um número de WhatsApp válido')
  })

  it('mantém o código que ainda não tem tradução, para não esconder o motivo', () => {
    expect(motivoDoEnvio('HTTP 500')).toBe('HTTP 500')
  })
})

describe('motivoDoEnvio na Cadência', () => {
  it('explica a variável sem valor, o descadastro e a mensagem alterada', () => {
    expect(motivoDoEnvio('missing_variable:cargo,empresa')).toBe(
      'o passo usa variáveis sem valor para este Contato ({{cargo}}, {{empresa}}); preencha o dado ou ajuste o texto e reconfirme',
    )
    expect(motivoDoEnvio('contact_suppressed')).toBe('o Contato se descadastrou e não recebe mais e-mails deste Workspace')
    expect(motivoDoEnvio('message_changed')).toBe(
      'os dados da mensagem mudaram depois da autorização; revise a prévia e reconfirme o passo',
    )
  })
})
