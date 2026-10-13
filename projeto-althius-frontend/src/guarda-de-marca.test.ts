// Guarda de marca (sinais em cascata, fatia 1): nenhum texto que a tela mostra, nenhuma mensagem das Fontes e nenhum dado
// da Demonstração cita o fornecedor de coleta ("Apify") nem o termo interno "actor". O teste lê o código-fonte: tira os
// comentários e procura a marca nos literais de texto e no texto solto do JSX. Só identificadores internos entram na
// lista abaixo, um por um, com o motivo.
import { describe, expect, it } from 'vitest'

const MARCA = /apify|\bactors?\b/i

// Todo código de produção de src/ (os testes e as ferramentas de teste ficam de fora), lido como texto.
const CODIGO = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx', '!./test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Literais que citam a marca por serem identificadores internos, nunca texto de tela: nomes de função RPC e de coluna
 * do banco (o navegador os envia, o usuário não os lê).
 */
const IDENTIFICADORES_INTERNOS = new Set([
  'list_signal_actors', // RPC do banco que devolve só (tipo de Sinal, estado); o nome não aparece na tela.
  'actor_state', // coluna da RPC das Descobertas; lida em código, nunca renderizada.
])

/** O código sem comentários de linha e de bloco (sem tocar em "//" dentro de URLs entre aspas: só começo de linha ou espaço antes). */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

function literais(codigo: string): string[] {
  const achados: string[] = []
  for (const m of codigo.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  // O texto solto entre as marcas do JSX.
  for (const m of codigo.matchAll(/>([^<>{}\n][^<>{}]*)</g)) achados.push(m[1])
  return achados
}

describe('marca: o usuário não lê "Apify" nem "actor"', () => {
  const fontes = Object.entries(CODIGO)

  it('há arquivos para varrer', () => {
    expect(fontes.length).toBeGreaterThan(50)
    expect(fontes.some(([arquivo]) => arquivo.startsWith('./fonte/simulada-contas'))).toBe(true)
  })

  it('nenhum texto da tela, das Fontes ou da Demonstração cita o fornecedor ou o actor', () => {
    const vazamentos: string[] = []
    for (const [arquivo, codigo] of fontes) {
      for (const texto of literais(semComentarios(codigo))) {
        if (MARCA.test(texto) && !IDENTIFICADORES_INTERNOS.has(texto)) vazamentos.push(`${arquivo}: ${texto.slice(0, 120)}`)
      }
    }
    expect(vazamentos).toEqual([])
  })
})
