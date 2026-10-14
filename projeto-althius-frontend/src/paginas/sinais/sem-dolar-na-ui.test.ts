/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGO_VISIVEL } from './catalogo-visivel'

/**
 * O crédito é a única moeda que o cliente vê (creditos-moeda-unica). Este teste varre os textos do cliente: o catálogo, as
 * telas de Sinais, Créditos, Plano e Automação, os rótulos que o banco devolve e as mensagens que as Edge Functions mostram.
 * O dólar de custo mora só nos dados internos (a guarda da faixa, o custo da fonte). Ficam de fora o valor de rodada de
 * investimento (não é custo) e os valores em dólar de comércio exterior que a evidência de um Sinal cita (dado do mercado).
 */
const RAIZ = path.resolve(import.meta.dirname, '../../../..')

function arquivos(dir: string, termina: RegExp, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === 'node_modules' || nome === 'dist') continue
      arquivos(caminho, termina, saida)
    } else if (termina.test(nome)) saida.push(caminho)
  }
  return saida
}

const DOLAR_DE_CUSTO = /US\$\s*\d|teto de US\$|\bdólares?\b|custo da fonte/i

describe('nenhum dólar de custo na UI do cliente', () => {
  it('o catálogo de Sinais só fala em créditos', () => {
    for (const card of CATALOGO_VISIVEL) {
      expect(`${card.nome} ${card.frase} ${card.fonte} ${card.custoRotulo}`, card.id).not.toMatch(DOLAR_DE_CUSTO)
      expect(card.custoRotulo, card.id).toMatch(/crédito|Sem custo/)
    }
  })

  it('as telas de Sinais, Créditos, Plano e Automação não escrevem dólar de custo', () => {
    const src = path.join(RAIZ, 'projeto-althius-frontend/src')
    const alvos = [
      ...arquivos(path.join(src, 'paginas/sinais'), /\.(ts|tsx)$/),
      ...arquivos(path.join(src, 'paginas/configuracoes'), /\.(ts|tsx)$/),
      path.join(src, 'fonte/creditos.ts'),
      path.join(src, 'fonte/automacao-tipos.ts'),
      path.join(src, 'fonte/supabase-automacao.ts'),
      path.join(src, 'fonte/supabase-contrato.ts'),
      path.join(src, 'fonte/supabase-contas.ts'),
      path.join(src, 'paginas/descobertas.tsx'),
      path.join(src, 'paginas/buscar-sinais-de-novo.tsx'),
    ].filter((arquivo) => !/\.test\.|dados-mock|catalogo\.ts$/.test(arquivo))
    const achados: string[] = []
    for (const arquivo of alvos) {
      readFileSync(arquivo, 'utf8').split('\n').forEach((linha, i) => {
        // Comentários de código explicam o banco e não aparecem para o cliente.
        const texto = linha.replace(/^\s*(\/\/|\*|\/\*\*).*$/, '')
        if (DOLAR_DE_CUSTO.test(texto)) achados.push(`${path.relative(src, arquivo)}:${i + 1}: ${linha.trim()}`)
      })
    }
    expect(achados).toEqual([])
  })

  it('as mensagens das Edge Functions que chegam ao cliente não citam dólar de custo', () => {
    const funcoes = path.join(RAIZ, 'supabase/functions')
    const alvos = [
      ...arquivos(path.join(funcoes, '_shared/cascata-de-sinais'), /^motor\.ts$/),
      path.join(funcoes, 'signal-runner/handler.ts'),
      path.join(funcoes, 'account-discovery/handler.ts'),
      path.join(funcoes, 'account-enrichment/handler.ts'),
    ]
    const achados: string[] = []
    for (const arquivo of alvos) {
      readFileSync(arquivo, 'utf8').split('\n').forEach((linha, i) => {
        // `erroReal` é o erro técnico: grava no rastro interno e nunca vai ao cliente.
        if (/erroReal|^\s*(\/\/|\*|\/\*\*)/.test(linha)) return
        if (DOLAR_DE_CUSTO.test(linha)) achados.push(`${path.relative(RAIZ, arquivo)}:${i + 1}: ${linha.trim()}`)
      })
    }
    expect(achados).toEqual([])
  })

  it('as migrações de créditos não deixam rótulo com dólar no catálogo visível', () => {
    const sql = readFileSync(path.join(RAIZ, 'supabase/migrations/20261017100000_preco_por_sinal.sql'), 'utf8')
    expect(sql).toContain('estimated_cost_label')
    expect(sql).not.toMatch(/estimated_cost_label\s*=\s*'[^']*US\$/)
  })
})
