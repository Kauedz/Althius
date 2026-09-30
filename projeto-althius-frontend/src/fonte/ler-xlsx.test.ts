import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/browser'
import { lerAbasDoXlsx } from './ler-xlsx'
import { previaDaPlanilha } from './playbook-planilha'

const celulas = (...linhas: string[][]) => linhas.map((linha) => linha.map((value) => ({ value })))

describe('Leitura do .xlsx', () => {
  it('lê todas as abas de uma planilha criada no teste, sem dado pessoal', async () => {
    const blob = await writeXlsxFile(
      [
        { data: celulas(['ICP'], ['Porte', '50 a 500 colaboradores']), sheet: 'ICP – Quem Buscamos' },
        { data: celulas(['Empresa', 'Cidade'], ['Empresa Exemplo', 'Cidade Exemplo']), sheet: 'Base de Pesquisa' },
        { data: celulas(['Passo 1']), sheet: 'Aba Extra' },
      ] as never,
    ).toBlob()

    const abas = await lerAbasDoXlsx(new File([blob as Blob], 'playbook.xlsx'))

    expect(abas.map((a) => a.nome)).toEqual(['ICP – Quem Buscamos', 'Base de Pesquisa', 'Aba Extra'])
    expect(abas[0].linhas).toEqual([['ICP', ''], ['Porte', '50 a 500 colaboradores']])

    const previa = previaDaPlanilha(abas)
    expect(previa.secoes.map((s) => s.texto)).toEqual(['ICP\nPorte | 50 a 500 colaboradores'])
    expect(previa.baseDePesquisa?.linhas[1]).toEqual(['Empresa Exemplo', 'Cidade Exemplo'])
    expect(previa.naoImportadas.map((a) => a.aba)).toEqual(['Aba Extra'])
  })
})
