import { describe, expect, it } from 'vitest'
import { filtrarFila, prazoDaAprovacao, tipoDaAprovacao } from './fila-de-aprovacoes'
import type { Aprovacao } from './tipos'

const agora = new Date('2026-10-14T12:00:00Z')
const base = {
  agenteId: 'ag-1',
  acao: 'Enviar e-mail',
  impacto: '',
  justificativa: '',
  origem: 'althius' as const,
  gatilho: 'conversa' as const,
  integracaoId: 'hubspot',
}
const ap = (extra: Partial<Aprovacao> & { id: string }): Aprovacao =>
  ({ ...base, estado: 'pendente', ...extra }) as Aprovacao

describe('prazoDaAprovacao', () => {
  it('mostra horas, dias e o fim do prazo', () => {
    expect(prazoDaAprovacao(ap({ id: '1', venceEm: '2026-10-14T18:30:00Z' }), agora)).toBe('vence em 6 h')
    expect(prazoDaAprovacao(ap({ id: '2', venceEm: '2026-10-17T12:00:00Z' }), agora)).toBe('vence em 3 dias')
    expect(prazoDaAprovacao(ap({ id: '3', venceEm: '2026-10-14T12:20:00Z' }), agora)).toBe('vence em menos de 1 h')
    expect(prazoDaAprovacao(ap({ id: '4', venceEm: '2026-10-14T11:00:00Z' }), agora)).toBe('vence agora')
  })
  it('nada para a decidida ou sem prazo', () => {
    expect(prazoDaAprovacao(ap({ id: '5', estado: 'expirada', venceEm: '2026-10-14T18:00:00Z' }), agora)).toBeNull()
    expect(prazoDaAprovacao(ap({ id: '6' }), agora)).toBeNull()
  })
})

describe('filtrarFila', () => {
  const fila = [
    ap({ id: 'e', tipo: 'envio' }),
    ap({ id: 'i', tipo: 'integracao', agenteId: 'ag-2' }),
    ap({ id: 'r', tipo: 'revisao' }),
  ]
  it('filtra por tipo e por Agente', () => {
    expect(filtrarFila(fila, { tipo: 'todos', agenteId: 'todos' }).map((a) => a.id)).toEqual(['e', 'i', 'r'])
    expect(filtrarFila(fila, { tipo: 'revisao', agenteId: 'todos' }).map((a) => a.id)).toEqual(['r'])
    expect(filtrarFila(fila, { tipo: 'todos', agenteId: 'ag-2' }).map((a) => a.id)).toEqual(['i'])
    expect(filtrarFila(fila, { tipo: 'envio', agenteId: 'ag-2' })).toEqual([])
  })
  it('sem o tipo, a forma decide', () => {
    expect(tipoDaAprovacao(ap({ id: 'x' }))).toBe('envio')
  })
})
