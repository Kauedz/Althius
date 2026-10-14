/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARCHIVED_SIGNALS } from './arquivados'
import { CATALOGO_VISIVEL } from './catalogo-visivel'
import { PAINEIS_DE_MERCADO } from './nichos'

const sql = readFileSync(
  path.resolve(import.meta.dirname, '../../../../supabase/migrations/20261015130000_catalogo_visivel_de_sinais.sql'),
  'utf8',
)

const MARCA = /apify|\bactors?\b|openai|anthropic|\bclaude\b|\bgpt[-\s]?\d|\bcodex\b/i

describe('Catálogo visível e a migração combinam', () => {
  it('cada card da tela está na migração, com o mesmo nome, e nada de fornecedor', () => {
    expect(CATALOGO_VISIVEL).toHaveLength(26)
    for (const card of CATALOGO_VISIVEL) {
      expect(sql).toContain(`'${card.id}'`)
      expect(sql).toContain(`'${card.nome.replace(/'/g, "''")}'`)
      expect(`${card.nome} ${card.frase} ${card.fonte}`).not.toMatch(MARCA)
    }
    expect(sql).toContain('default 20')
    expect(sql).toContain("array['vaga_linkedin', 'vaga_indeed', 'vaga_comex', 'vaga_logistica', 'vaga_engenharia_manutencao']")
  })

  it('arquivados e painéis de mercado não entram no catálogo', () => {
    const ids = new Set(CATALOGO_VISIVEL.map((card) => card.id))
    for (const sinal of ARCHIVED_SIGNALS) expect(ids.has(sinal.id)).toBe(false)
    for (const painel of PAINEIS_DE_MERCADO) expect(ids.has(painel.id)).toBe(false)
    expect(sql).not.toContain("'volume_por_porto'")
    expect(sql).not.toContain("'habilitacao_radar'")
  })
})
