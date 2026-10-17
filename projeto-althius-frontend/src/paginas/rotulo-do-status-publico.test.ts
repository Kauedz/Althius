import { describe, expect, it } from 'vitest'
import type { Sequencia, StatusSequencia } from '@/fonte/sequencias-tipos'
import { rotuloDoStatusPublico } from './detalhe-sequencia'

function sequencia(status: StatusSequencia, extra: Partial<Sequencia> = {}): Sequencia {
  return {
    id: 'sequencia-publica',
    contaId: 'conta-alvo',
    status,
    participantesIds: [],
    janelaPadrao: { de: '09:00', ate: '17:00' },
    regraDePause: '',
    steps: [],
    passoAtual: 0,
    totalParticipantes: 0,
    criadaEm: '2026-09-23T12:00:00Z',
    ...extra,
  }
}

describe('rótulo do status público da Sequência', () => {
  it('mostra o status em português legível, não o valor cru', () => {
    expect(rotuloDoStatusPublico(sequencia('ativa'))).toBe('Ativa')
    expect(rotuloDoStatusPublico(sequencia('reuniao'))).toBe('Reunião')
    expect(rotuloDoStatusPublico(sequencia('esgotada'))).toBe('Esgotada')
    expect(rotuloDoStatusPublico(sequencia('pausada'))).toBe('Pausada')
    expect(rotuloDoStatusPublico(sequencia('encerrada'))).toBe('Encerrada')
  })

  it('pausada sem motivoPause mostra só Pausada', () => {
    expect(rotuloDoStatusPublico(sequencia('pausada'))).toBe('Pausada')
  })

  it('pausada por resposta do Contato mostra o motivo', () => {
    expect(rotuloDoStatusPublico(sequencia('pausada', { motivoPause: 'Contato respondeu' }))).toBe(
      'Pausada: Contato respondeu',
    )
  })

  it('pausada pela Conta-alvo arquivada mantém o texto próprio', () => {
    expect(
      rotuloDoStatusPublico(sequencia('pausada', { pausadaPelaConta: true, motivoPause: 'Conta arquivada' })),
    ).toBe('Pausada: Conta-alvo arquivada')
  })

  it('pausada pela Conta remetente desconectada mantém o texto próprio', () => {
    expect(
      rotuloDoStatusPublico(sequencia('pausada', { pausadaPelaContaRemetente: 'email' })),
    ).toBe('Pausada: conta remetente do responsável desconectada')
  })
})
