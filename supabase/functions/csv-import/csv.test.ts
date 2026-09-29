import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { CsvInvalido, decodificar, detectarDelimitador, lerCsv, pareceCabecalho, sugerirMapeamento } from './csv.ts'

const codificar = (texto: string) => new TextEncoder().encode(texto)

Deno.test('lê o CSV com vírgula, cabeçalho e o mapeamento que os nomes das colunas sugerem', () => {
  const lido = lerCsv(codificar(
    'Empresa,Site,Segmento,CNPJ,Contato,Cargo,E-mail,Telefone,LinkedIn\nAlfa,alfa.com.br,Varejo,,Maria,CFO,m@alfa.com.br,,\n',
  ))
  assertEquals(lido.delimiter, ',')
  assertEquals(lido.hasHeader, true)
  assertEquals(lido.headers[1], 'Site')
  assertEquals(lido.records.map((r) => r.line), [1, 2])
  assertEquals(lido.mapping, {
    contact_email: 6,
    contact_phone: 7,
    contact_linkedin: 8,
    company_legal_identifier: 3,
    company_url: 1,
    company_segment: 2,
    contact_role: 5,
    contact_name: 4,
    company_name: 0,
  })
})

Deno.test('detecta ponto e vírgula, tabulação e barra vertical', () => {
  assertEquals(detectarDelimitador('a;b;c\n1;2;3\n'), ';')
  assertEquals(detectarDelimitador('a\tb\tc\n1\t2\t3\n'), '\t')
  assertEquals(detectarDelimitador('a|b|c\n1|2|3\n'), '|')
  // Uma vírgula dentro de aspas não é delimitador.
  assertEquals(detectarDelimitador('nome;obs\n"Silva, Ana";"a, b, c"\n'), ';')
  // Sem duas colunas em lugar nenhum, o padrão é a vírgula.
  assertEquals(detectarDelimitador('unica\nlinha\n'), ',')
})

Deno.test('o campo entre aspas guarda delimitador, quebra de linha e aspas duplas', () => {
  const lido = lerCsv(codificar('Empresa;Nota\r\n"Alfa; Beta";"linha 1\nlinha 2 ""citada"""\r\nGama;x\r\n'))
  assertEquals(lido.records[1].cells, ['Alfa; Beta', 'linha 1\nlinha 2 "citada"'])
  assertEquals(lido.records.map((r) => r.line), [1, 2, 3])
})

Deno.test('registros vazios não entram, mas contam no número da linha', () => {
  const lido = lerCsv(codificar('Empresa,Site\n\nAlfa,alfa.com.br\n,\nBeta,beta.com.br'))
  assertEquals(lido.records.map((r) => [r.line, r.cells[0]]), [[1, 'Empresa'], [3, 'Alfa'], [5, 'Beta']])
})

Deno.test('completa as linhas curtas e numera as colunas sem nome', () => {
  const lido = lerCsv(codificar('Empresa,,Site\nAlfa\n'))
  assertEquals(lido.headers, ['Empresa', 'Coluna 2', 'Site'])
  assertEquals(lido.records[1].cells, ['Alfa', '', ''])
})

Deno.test('sem cabeçalho: a primeira linha é dado, as colunas são numeradas e nada é sugerido', () => {
  const lido = lerCsv(codificar('Alfa,alfa.com.br,maria@alfa.com.br\nBeta,beta.com.br,rui@beta.com.br\n'))
  assertEquals(lido.hasHeader, false)
  assertEquals(lido.headers, ['Coluna 1', 'Coluna 2', 'Coluna 3'])
  assertEquals(lido.mapping, {})
  assertEquals(pareceCabecalho(['Empresa', 'Site']), true)
  assertEquals(pareceCabecalho(['Alfa', '(11) 98888-7777']), false)
})

Deno.test('lê UTF-8 com BOM e cai para Windows-1252 quando o arquivo não é UTF-8', () => {
  assertEquals(decodificar(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), 'A')
  // "Indústria" gravado pelo Excel em Windows-1252: o "ú" é o byte 0xFA.
  assertEquals(decodificar(new Uint8Array([0x49, 0x6e, 0x64, 0xfa, 0x73, 0x74, 0x72, 0x69, 0x61])), 'Indústria')
})

Deno.test('recusa o arquivo vazio, o de aspas abertas e o grande demais', () => {
  assertThrows(() => lerCsv(codificar('  \n\n')), CsvInvalido, 'empty_file')
  assertThrows(() => lerCsv(codificar('a,b\n"aberta,1\n')), CsvInvalido, 'malformed_csv')
  const linhas = ['Empresa,Site', ...Array.from({ length: 5001 }, (_, i) => `E${i},e${i}.com.br`)].join('\n')
  assertThrows(() => lerCsv(codificar(linhas)), CsvInvalido, 'too_many_rows')
  const colunas = Array.from({ length: 101 }, (_, i) => `c${i}`).join(',')
  assertThrows(() => lerCsv(codificar(`${colunas}\n${colunas}`)), CsvInvalido, 'too_many_columns')
})

Deno.test('aceita exatamente 5.000 linhas de dados', () => {
  const linhas = ['Empresa,Site', ...Array.from({ length: 5000 }, (_, i) => `E${i},e${i}.com.br`)].join('\n')
  assertEquals(lerCsv(codificar(linhas)).records.length, 5001)
})

Deno.test('o mapeamento sugerido usa cada coluna e cada campo uma vez, e o "Nome" sozinho depende da empresa', () => {
  assertEquals(sugerirMapeamento(['Nome da empresa', 'Site da empresa', 'Nome do contato', 'Email do contato']), {
    contact_email: 3,
    company_url: 1,
    contact_name: 2,
    company_name: 0,
  })
  assertEquals(sugerirMapeamento(['Empresa', 'Nome', 'Cargo']), { contact_role: 2, company_name: 0, contact_name: 1 })
  assertEquals(sugerirMapeamento(['Nome', 'Website']), { company_url: 1, company_name: 0 })
  assertEquals(sugerirMapeamento(['LinkedIn da empresa', 'LinkedIn']), { company_linkedin: 0, contact_linkedin: 1 })
  assertEquals(sugerirMapeamento(['Coluna 1', 'Coluna 2']), {})
})
