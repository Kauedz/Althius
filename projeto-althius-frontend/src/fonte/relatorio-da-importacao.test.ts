import { describe, expect, it } from 'vitest'
import type { LinhaDaImportacao } from './importacao-tipos'
import { montarCsvDoRelatorio } from './relatorio-da-importacao'

const LOTE = { colunas: ['Empresa', 'Site', 'Contato'], delimitador: ';' }

function linha(numero: number, extra: Partial<LinhaDaImportacao>): LinhaDaImportacao {
  return { numero, situacao: 'falhou', celulas: [], motivos: [], observacoes: [], ...extra }
}

describe('montarCsvDoRelatorio', () => {
  it('traz o número da linha, a situação, os motivos e as células originais, com o delimitador do arquivo', () => {
    const csv = montarCsvDoRelatorio(LOTE, [
      linha(7, { celulas: ['Sem site', '', ''], motivos: ['Falta a URL da empresa.'] }),
      linha(9, { situacao: 'ignorada', celulas: ['Beta; SA', 'beta.com.br'], motivos: ['Nada mudou.'], observacoes: ['Valores preservados: nome.'] }),
    ])

    expect(csv).toBe(
      '﻿Linha;Situação;Motivo;Empresa;Site;Contato\r\n' +
        '7;Falhou;Falta a URL da empresa.;Sem site;;\r\n' +
        '9;Ignorada;Nada mudou. Valores preservados: nome.;"Beta; SA";beta.com.br;\r\n',
    )
  })

  it('escapa aspas e quebras de linha dentro das células', () => {
    const csv = montarCsvDoRelatorio({ colunas: ['Nota'], delimitador: undefined }, [
      linha(2, { celulas: ['disse "oi"\nde novo'] }),
    ])
    expect(csv).toContain('"disse ""oi""\nde novo"')
  })
})
