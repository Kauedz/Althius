import { afterEach, describe, expect, it, vi } from 'vitest'
import { carregarAnexo, formaDoAnexo, tipoExibivel } from './anexo-recebido'

describe('formaDoAnexo', () => {
  it('imagens comuns aparecem na página, pelo tipo ou pela extensão quando o tipo é genérico', () => {
    expect(formaDoAnexo({ nome: 'image.png', mime: 'image/png' })).toBe('imagem')
    expect(formaDoAnexo({ nome: 'foto.JPG' })).toBe('imagem')
    expect(formaDoAnexo({ nome: 'image.png', mime: 'application/octet-stream' })).toBe('imagem')
    expect(formaDoAnexo({ nome: 'sem-extensao', mime: 'image/webp; charset=binary' })).toBe('imagem')
  })

  it('PDF abre no leitor do navegador', () => {
    expect(formaDoAnexo({ nome: 'proposta.pdf', mime: 'application/pdf' })).toBe('pdf')
    expect(formaDoAnexo({ nome: 'proposta.pdf' })).toBe('pdf')
  })

  it('o resto só baixa, inclusive HTML e SVG disfarçados de imagem', () => {
    expect(formaDoAnexo({ nome: 'planilha.xlsx' })).toBe('baixar')
    expect(formaDoAnexo({ nome: 'logo.svg', mime: 'image/svg+xml' })).toBe('baixar')
    expect(formaDoAnexo({ nome: 'foto.png', mime: 'text/html' })).toBe('baixar')
    expect(tipoExibivel({ nome: 'foto.png', mime: 'text/html' })).toBeNull()
  })
})

describe('carregarAnexo', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devolve o arquivo com o tipo decidido pela tela, não com o declarado pelo servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'text/html' },
    })))
    const arquivo = await carregarAnexo('https://storage.test/a', { nome: 'image.png', mime: 'application/octet-stream' })
    expect(arquivo.type).toBe('image/png')
    expect(arquivo.size).toBe(3)
  })

  it('falha com mensagem clara quando o armazenamento recusa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('expirou', { status: 400 })))
    await expect(carregarAnexo('https://storage.test/a', { nome: 'image.png' })).rejects.toThrow('Não foi possível carregar o anexo.')
  })
})
