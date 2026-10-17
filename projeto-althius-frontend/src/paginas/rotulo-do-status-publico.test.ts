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
    expect(rotuloDoStatusPublico(sequencia('pausada'))).toBe('Contato respondeu; sequência pausada')
    expect(rotuloDoStatusPublico(sequencia('encerrada'))).toBe('Encerrada')
  })
})
