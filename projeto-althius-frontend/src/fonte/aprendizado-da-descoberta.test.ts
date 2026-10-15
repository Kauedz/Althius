import { describe, expect, it } from 'vitest'
import { ajustesDaCandidata, fraseDoAjuste, type AjusteAprendido } from './aprendizado-da-descoberta'
import type { ContaDescoberta } from './descobertas-tipos'

const logistica: AjusteAprendido = { dimensao: 'setor', valor: 'logística', ajuste: -15, decisoes: 6, atualizadoEm: '2026-10-14T12:00:00Z' }
const vagas: AjusteAprendido = { dimensao: 'tipo_de_sinal', valor: 'vagas_de_comex', ajuste: 10, decisoes: 4, atualizadoEm: '2026-10-14T12:00:00Z' }

describe('Aprendizado da Descoberta', () => {
  it('explica cada ajuste numa frase curta, sem número de nota', () => {
    expect(fraseDoAjuste(logistica)).toBe('Menos peso para Logística porque você descartou 6 parecidas')
    expect(fraseDoAjuste(vagas)).toBe('Mais peso para Vagas de comex porque você aceitou 4 com esse Sinal')
  })

  it('aplica à candidata só os ajustes das dimensões dela', () => {
    const c = { setor: 'Logística', uf: 'SP', tamanho: '50 a 199', motivosDeSinal: [{ tipo: 'vagas_de_comex' }] } as unknown as ContaDescoberta
    expect(ajustesDaCandidata(c, [vagas, logistica])).toEqual([logistica, vagas])
    const outra = { setor: 'Energia', motivosDeSinal: [] } as unknown as ContaDescoberta
    expect(ajustesDaCandidata(outra, [vagas, logistica])).toEqual([])
  })
})
