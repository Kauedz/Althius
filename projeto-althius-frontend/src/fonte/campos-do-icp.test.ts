import { describe, expect, it } from 'vitest'
import { normalizarLista, portesInvalidos, sugerirCamposDoIcp } from './campos-do-icp'

describe('campos estruturados do ICP', () => {
  it('normaliza uma lista curta, mantendo o primeiro item de cada valor', () => {
    expect(normalizarLista(' Logística, seguros, logística, , SEGUROS, varejo ')).toBe('Logística, seguros, varejo')
  })

  it('limita a lista a vinte itens e identifica portes desconhecidos', () => {
    const lista = Array.from({ length: 21 }, (_, i) => `item-${i}`).join(', ')
    expect(normalizarLista(lista).split(', ')).toHaveLength(20)
    expect(portesInvalidos('51-200, ME, desconhecido, desconhecido')).toEqual(['desconhecido'])
  })

  it('sugere campos a partir de rótulos no texto', () => {
    expect(
      sugerirCamposDoIcp({ texto: 'Setor: Logística, Seguros\nPorte: 51 a 500 funcionários\nRegião: SP, RJ' }),
    ).toEqual({ setor: 'Logística, Seguros', porte: '51-200, 201-500', regiao: 'SP, RJ' })
  })

  it('lê rótulos das linhas e ignora texto sem rótulo', () => {
    expect(sugerirCamposDoIcp({ linhas: [{ Setor: 'Varejo' }] })).toEqual({ setor: 'Varejo', porte: '', regiao: '' })
    expect(sugerirCamposDoIcp({ texto: 'Vende para empresas de médio porte no Brasil.' })).toEqual({ setor: '', porte: '', regiao: '' })
  })
})
