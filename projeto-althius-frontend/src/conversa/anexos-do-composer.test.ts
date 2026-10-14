import { describe, expect, it } from 'vitest'
import { formatarTamanho, motivoParaRecusar, nomeCurto } from './anexos-do-composer'

const arquivo = (nome: string, tamanho: number, tipo = '') => new File([new Uint8Array(tamanho)], nome, { type: tipo })

describe('anexos do composer', () => {
  it('aceita os tipos da lista, até 10 MB e até 5 por pedido', () => {
    expect(motivoParaRecusar(arquivo('foto.png', 10, 'image/png'), 0)).toBeNull()
    expect(motivoParaRecusar(arquivo('dados.CSV', 10), 4)).toBeNull()
    expect(motivoParaRecusar(arquivo('dados.csv', 10), 5)).toBe('Anexe até 5 arquivos por pedido.')
    expect(motivoParaRecusar(arquivo('video.mp4', 10, 'video/mp4'), 0)).toMatch(/só imagens/)
    expect(motivoParaRecusar(arquivo('grande.pdf', 10 * 1024 * 1024 + 1), 0)).toBe('grande.pdf: cada arquivo pode ter até 10 MB.')
    expect(motivoParaRecusar(arquivo('vazio.txt', 0), 0)).toBe('vazio.txt: o arquivo está vazio.')
  })

  it('mostra o tamanho e um nome curto com a extensão', () => {
    expect(formatarTamanho(820 * 1024)).toBe('820 KB')
    expect(formatarTamanho(3.4 * 1024 * 1024)).toBe('3,4 MB')
    expect(nomeCurto('proposta-comercial-da-alfa-2026.pdf')).toBe('proposta-comercial-….pdf')
    expect(nomeCurto('curto.pdf')).toBe('curto.pdf')
  })
})
