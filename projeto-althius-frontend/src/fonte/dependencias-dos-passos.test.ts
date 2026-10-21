import { describe, expect, it } from 'vitest'
import {
  documentoComLiberacaoExplicita,
  validarDependenciasDosPassos,
} from './dependencias-dos-passos'

describe('validarDependenciasDosPassos', () => {
  it('aceita documento legado serial sem liberação explícita', () => {
    expect(() =>
      validarDependenciasDosPassos([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]),
    ).not.toThrow()
    expect(documentoComLiberacaoExplicita([{ id: 'a' }, { id: 'b' }])).toBe(false)
  })

  it('aceita ativação, predecessor único e liberação manual', () => {
    expect(() =>
      validarDependenciasDosPassos([
        { id: 'a', liberacao: 'ativacao' },
        { id: 'b', liberacao: 'predecessor', predecessorId: 'a' },
        { id: 'c', liberacao: 'manual' },
        { id: 'd', liberacao: 'predecessor', predecessorId: 'a' },
      ]),
    ).not.toThrow()
    expect(
      documentoComLiberacaoExplicita([
        { id: 'a', liberacao: 'ativacao' },
        { id: 'b', liberacao: 'predecessor', predecessorId: 'a' },
      ]),
    ).toBe(true)
  })

  it('rejeita autorreferência', () => {
    expect(() =>
      validarDependenciasDosPassos([{ id: 'a', liberacao: 'predecessor', predecessorId: 'a' }]),
    ).toThrow(/si mesmo/i)
  })

  it('rejeita predecessor ausente', () => {
    expect(() =>
      validarDependenciasDosPassos([
        { id: 'a', liberacao: 'ativacao' },
        { id: 'b', liberacao: 'predecessor', predecessorId: 'fantasma' },
      ]),
    ).toThrow(/existir na mesma Sequência/i)
  })

  it('rejeita ciclo A→B→A', () => {
    expect(() =>
      validarDependenciasDosPassos([
        { id: 'a', liberacao: 'predecessor', predecessorId: 'b' },
        { id: 'b', liberacao: 'predecessor', predecessorId: 'a' },
      ]),
    ).toThrow(/ciclo/i)
  })

  it('rejeita liberação predecessor sem id', () => {
    expect(() =>
      validarDependenciasDosPassos([{ id: 'a', liberacao: 'predecessor' }]),
    ).toThrow(/predecessorId/i)
  })

  it('rejeita predecessorId com liberação ativacao', () => {
    expect(() =>
      validarDependenciasDosPassos([
        { id: 'a', liberacao: 'ativacao' },
        { id: 'b', liberacao: 'ativacao', predecessorId: 'a' },
      ]),
    ).toThrow(/só é permitido com liberação predecessor/i)
  })

  it('rejeita ids duplicados', () => {
    expect(() =>
      validarDependenciasDosPassos([
        { id: 'a', liberacao: 'ativacao' },
        { id: 'a', liberacao: 'manual' },
      ]),
    ).toThrow(/dois passos com o id/i)
  })
})
