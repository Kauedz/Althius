import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAMPOS } from './catalogo'
import { TIPOS_DO_PLANO, criteriosParaSalvar, criteriosPadraoDoTipo } from './campos-do-plano'

// A tabela de campos por tipo é a mesma do servidor (`_shared/plano-do-sinal/campos.ts`, a fonte única do esquema).

const SERVIDOR = readFileSync(path.resolve(import.meta.dirname, '../../../../supabase/functions/_shared/plano-do-sinal/campos.ts'), 'utf8')

function bloco(inicio: string): string {
  const comeco = SERVIDOR.indexOf(inicio)
  expect(comeco).toBeGreaterThan(-1)
  return SERVIDOR.slice(comeco, SERVIDOR.indexOf('\n}\n', comeco))
}

describe('a tabela de campos do Plano', () => {
  it('tem os mesmos tipos e campos do servidor', () => {
    const doServidor = Object.fromEntries(
      [...bloco('export const CAMPOS_POR_TIPO').matchAll(/^\s+(\w+): \[([^\]]*)\],$/gm)].map((m) => [
        m[1],
        [...m[2].matchAll(/'(\w+)'/g)].map((c) => c[1]).toSorted(),
      ]),
    )
    const daTela = Object.fromEntries(Object.entries(TIPOS_DO_PLANO).map(([tipo, t]) => [tipo, [...t.campos].toSorted()]))
    expect(Object.keys(doServidor).length).toBeGreaterThan(5)
    expect(daTela).toEqual(doServidor)
  })

  it('usa os mesmos nomes do servidor', () => {
    const doServidor = Object.fromEntries([...bloco('export const ROTULO_DO_TIPO').matchAll(/^\s+(\w+): '([^']+)',$/gm)].map((m) => [m[1], m[2]]))
    expect(Object.fromEntries(Object.entries(TIPOS_DO_PLANO).map(([tipo, t]) => [tipo, t.rotulo]))).toEqual(doServidor)
  })

  it('cada campo de cada tipo existe no formulário que a tela usa para ele (salvo os de nicho, que a tela cuida à parte)', () => {
    for (const [tipo, t] of Object.entries(TIPOS_DO_PLANO)) {
      const ids = CAMPOS[t.formulario].map((c) => c.id)
      for (const campo of t.campos) {
        if (campo === 'nicho' || campo === 'nichoCustom' || campo === 'nichos' || campo === 'nichosCustom') continue
        expect(ids, `${tipo}: ${campo}`).toContain(campo)
      }
    }
  })

  it('os critérios salvos levam só o que o tipo lê e o que foi preenchido', () => {
    expect(criteriosParaSalvar('anuncio_meta', {
      localizacao: ['Brasil'], periodo: 'Últimos 7 dias', palavras: '  black friday ', funcoes: ['SDR'], nota: '', vazio: [],
    })).toEqual({ localizacao: ['Brasil'], periodo: 'Últimos 7 dias', palavras: 'black friday' })
    expect(criteriosParaSalvar('vaga_linkedin', { funcoes: [], senioridade: '', palavras: ' ' })).toEqual({})
    expect(criteriosPadraoDoTipo('nova_lideranca')).toEqual({ periodo: 'Últimos 30 dias', localizacao: ['Brasil'] })
    expect(criteriosPadraoDoTipo('mudanca_de_emprego')).toEqual({ periodo: 'Últimos 30 dias' })
    expect(criteriosPadraoDoTipo('crescimento_de_equipes')).toEqual({})
  })
})
