// O texto de cada ICP do Mapa (nome, restrição regulatória, ordem dos Sinais) vive em dois lugares: no servidor, onde o
// Hermes o lê (`supabase/functions/_shared/mapa-de-sinais.ts`), e aqui, onde a tela o mostra. Este teste lê o arquivo do
// servidor como texto e falha se os dois divergirem em ICP, nome, restrição ou lista de tipos.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ICPS_DO_MAPA } from './mapa-de-cascatas'

// O arquivo do servidor fica fora de `src`: lê-se do disco (o Vite não serve arquivo de fora da raiz do projeto).
const SERVIDOR = readFileSync(path.resolve(import.meta.dirname, '../../../supabase/functions/_shared/mapa-de-sinais.ts'), 'utf8')

interface IcpLido {
  nome: string
  restricao: string
  sinais: string[]
}

function lerMapaDoServidor(codigo: string): Record<string, IcpLido> {
  const lidos: Record<string, IcpLido> = {}
  for (const m of codigo.matchAll(/^ {2}([A-H]): \{([\s\S]*?)^ {2}\},/gm)) {
    const corpo = m[2]
    const texto = (campo: string) => new RegExp(`${campo}: '((?:[^'\\\\]|\\\\.)*)'`).exec(corpo)?.[1] ?? ''
    const sinais = /sinais: \[([\s\S]*?)\]/.exec(corpo)?.[1] ?? ''
    lidos[m[1]] = {
      nome: texto('nome'),
      restricao: texto('restricao'),
      sinais: [...sinais.matchAll(/'([a-z0-9_]+)'/g)].map((s) => s[1]),
    }
  }
  return lidos
}

describe('o Mapa que a tela mostra é o mesmo que o Hermes lê', () => {
  it('acha o arquivo do servidor e os oito ICPs', () => {
    expect(SERVIDOR).toBeTruthy()
    expect(Object.keys(lerMapaDoServidor(SERVIDOR))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  })

  it('ICP, nome, restrição e tipos (na mesma ordem) batem com o do servidor', () => {
    const servidor = lerMapaDoServidor(SERVIDOR)
    const tela = Object.fromEntries(ICPS_DO_MAPA.map((i) => [i.id, { nome: i.nome, restricao: i.restricao, sinais: [...i.sinais] }]))
    expect(tela).toEqual(servidor)
  })

  it('são 39 tipos, sem repetição', () => {
    const todos = ICPS_DO_MAPA.flatMap((i) => i.sinais)
    expect(todos).toHaveLength(39)
    expect(new Set(todos).size).toBe(39)
  })
})
