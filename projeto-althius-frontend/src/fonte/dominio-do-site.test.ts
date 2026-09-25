import { describe, expect, it } from 'vitest'
import { enderecosDoLogo, normalizarDominio, resolverLogoDoSite, type MedirImagem } from './dominio-do-site'

const SVG = 'https://nortedados.com.br/favicon.svg'
const PELO_GOOGLE = 'https://www.google.com/s2/favicons?domain=nortedados.com.br&sz=128'
const NA_RAIZ = 'https://nortedados.com.br/favicon.ico'

/** Um navegador de mentira: cada endereço listado carrega com a largura dada; os outros não carregam. */
function navegador(larguras: Record<string, number>): MedirImagem {
  return async (endereco) => {
    if (!(endereco in larguras)) throw new Error('não carregou')
    return larguras[endereco]
  }
}

describe('Domínio do site do Cliente', () => {
  it('normaliza o domínio digitado para um host, e recusa o que ainda não é um host', () => {
    expect(normalizarDominio('  https://www.NorteDados.com.br/contato?x=1 ')).toBe('nortedados.com.br')
    expect(normalizarDominio('nortedados')).toBeNull()
    expect(normalizarDominio('norte..com')).toBeNull()
  })

  it('os candidatos ao logo são o SVG, o favicon achado pelo Google e o da raiz, nessa ordem', () => {
    expect(enderecosDoLogo('nortedados.com.br')).toEqual([SVG, PELO_GOOGLE, NA_RAIZ])
  })

  it('o primeiro candidato que carrega vira o logo, e um SVG sem tamanho próprio vale', async () => {
    expect(await resolverLogoDoSite('nortedados.com.br', navegador({ [SVG]: 0, [PELO_GOOGLE]: 128 }))).toBe(SVG)
    expect(await resolverLogoDoSite('nortedados.com.br', navegador({ [PELO_GOOGLE]: 128, [NA_RAIZ]: 32 }))).toBe(
      PELO_GOOGLE,
    )
  })

  it('um bitmap de 16 px não serve de logo, como o globo genérico com que o Google responde', async () => {
    expect(await resolverLogoDoSite('nortedados.com.br', navegador({ [PELO_GOOGLE]: 16, [NA_RAIZ]: 32 }))).toBe(NA_RAIZ)
  })

  it('sem nenhum candidato que sirva, o site não tem logo', async () => {
    expect(await resolverLogoDoSite('nortedados.com.br', navegador({ [PELO_GOOGLE]: 16 }))).toBeNull()
  })
})
