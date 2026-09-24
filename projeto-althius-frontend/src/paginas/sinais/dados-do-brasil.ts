import { useEffect, useState } from 'react'

// Listas oficiais do IBGE, geradas das APIs de CNAE 2.3 e de localidades. Ficam em arquivos próprios e só são
// baixadas quando alguém abre um público personalizado.

export interface Cnae {
  /** [código, descrição] */
  secoes: [string, string][]
  /** [código, descrição, código do nível acima] */
  divisoes: [string, string, string][]
  grupos: [string, string, string][]
  classes: [string, string, string][]
  subclasses: [string, string, string][]
}

export interface Localidades {
  /** [sigla, nome, grande região] */
  ufs: [string, string, string][]
  /** [id, nome, UF] */
  intermediarias: [number, string, string][]
  /** [nome, UF, id da região intermediária] */
  cidades: [string, string, number][]
}

export interface DadosDoBrasil {
  cnae: Cnae
  localidades: Localidades
}

let carregamento: Promise<DadosDoBrasil> | undefined

export function carregarDadosDoBrasil(): Promise<DadosDoBrasil> {
  carregamento ??= Promise.all([import('./dados/cnae.json'), import('./dados/localidades.json')]).then(
    ([cnae, localidades]) => ({ cnae: cnae.default as Cnae, localidades: localidades.default as Localidades }),
  )
  return carregamento
}

export function useDadosDoBrasil(): DadosDoBrasil | undefined {
  const [dados, setDados] = useState<DadosDoBrasil>()
  useEffect(() => {
    let ativo = true
    carregarDadosDoBrasil().then((carregados) => ativo && setDados(carregados))
    return () => {
      ativo = false
    }
  }, [])
  return dados
}
