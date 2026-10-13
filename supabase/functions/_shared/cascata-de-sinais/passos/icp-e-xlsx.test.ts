// O leitor de .xlsx do ICP E (a planilha de contratações da Finep): zip com compressão ou sem, textos compartilhados, abas
// achadas pelo nome sem acento, cabeçalho achado pelo texto e datas em número de série do Excel.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { excelParaIso, lerAbasDoXlsx } from './icp-e-xlsx.ts'
import { serialDoExcel, xlsxFalso, zipFalso } from './icp-e-xlsx-falso.ts'

Deno.test('as abas pedidas voltam como linhas por título de coluna, mesmo com título e "Posição" antes do cabeçalho', async () => {
  const bytes = await xlsxFalso([
    { nome: 'Guia_de_Leitura', cabecalho: ['Guia'], linhas: [['nada']] },
    {
      nome: 'Projetos_Crédito_Direto', antes: ['Área de Planejamento - APLA', 'Projetos Crédito Direto', 'Posição: 02/10/2026'],
      cabecalho: ['Contrato', 'Data Assinatura', 'Proponente', 'CNPJ Proponente', 'Valor Finep'],
      linhas: [['14.26.0001.00', serialDoExcel('2026-09-29'), 'Construtora Marquise S.A.', '07.950.702/0001-85', 76419000], ['x', null, 'Sem data', '', 1]],
    },
  ])
  const abas = await lerAbasDoXlsx(bytes, ['projetos credito direto'])
  assertEquals([...abas.keys()], ['projetos credito direto'])
  assertEquals(abas.get('projetos credito direto'), [
    { Contrato: '14.26.0001.00', 'Data Assinatura': String(serialDoExcel('2026-09-29')), Proponente: 'Construtora Marquise S.A.', 'CNPJ Proponente': '07.950.702/0001-85', 'Valor Finep': '76419000' },
    { Contrato: 'x', Proponente: 'Sem data', 'Valor Finep': '1' },
  ])
})

Deno.test('aba que não existe volta vazia; arquivo que não é zip falha com mensagem clara', async () => {
  const bytes = await xlsxFalso([{ nome: 'Outra', cabecalho: ['A'], linhas: [['1']] }])
  assertEquals((await lerAbasDoXlsx(bytes, ['projetos credito direto'])).get('projetos credito direto'), [])
  await assertRejects(() => lerAbasDoXlsx(new TextEncoder().encode('<html>não é planilha</html>'), ['x']), Error, 'não é uma planilha')
})

Deno.test('o zip sem compressão (método 0) também é lido', async () => {
  const bytes = await zipFalso({ 'a.txt': 'ola' }, ['a.txt'])
  const { lerZip } = await import('./icp-e-xlsx.ts')
  const achados = await lerZip(bytes, (n) => n === 'a.txt')
  assertEquals(new TextDecoder().decode(achados.get('a.txt')), 'ola')
})

Deno.test('o número de série do Excel vira data ISO (meio-dia UTC)', () => {
  assertEquals(excelParaIso('46294'), '2026-09-29T12:00:00.000Z')
  assertEquals(excelParaIso('38832'), '2006-04-25T12:00:00.000Z')
  assertEquals(excelParaIso('texto'), null)
  assertEquals(excelParaIso(''), null)
})
