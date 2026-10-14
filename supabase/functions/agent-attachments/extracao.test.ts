import { assertEquals } from 'jsr:@std/assert@1'
import { strToU8, zipSync } from 'npm:fflate@0.8.2'
import { detectarMime, extrairTexto, LIMITE_DE_TEXTO, MIME_DOCX, MIME_XLSX, textoDoDocx, textoDoXlsx } from './extracao.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
const PDF = new TextEncoder().encode('%PDF-1.7 qualquer coisa')
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])

const docx = () =>
  zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:body><w:p><w:r><w:t>Proposta &amp; prazo</w:t></w:r></w:p><w:p><w:r><w:t>Segunda linha</w:t></w:r></w:p></w:body></w:document>',
    ),
  })
const xlsx = () =>
  zipSync({
    'xl/workbook.xml': strToU8('<workbook/>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Conta</t></si><si><t>Alfa</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Valor</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>1200</v></c></row></sheetData></worksheet>',
    ),
  })

Deno.test('o tipo vem dos bytes, não do nome', () => {
  assertEquals(detectarMime(PNG, 'foto.pdf'), 'image/png')
  assertEquals(detectarMime(JPG, 'x'), 'image/jpeg')
  assertEquals(detectarMime(WEBP, 'x'), 'image/webp')
  assertEquals(detectarMime(PDF, 'x.png'), 'application/pdf')
  assertEquals(detectarMime(docx(), 'x.xlsx'), MIME_DOCX)
  assertEquals(detectarMime(xlsx(), 'x.docx'), MIME_XLSX)
  assertEquals(detectarMime(new TextEncoder().encode('a;b\n1;2'), 'dados.CSV'), 'text/csv')
  assertEquals(detectarMime(new TextEncoder().encode('olá, mundo'), 'nota.md'), 'text/plain')
})

Deno.test('fora da lista não passa: vídeo, binário, ZIP qualquer e arquivo vazio', () => {
  assertEquals(detectarMime(MP4, 'v.mp4'), null)
  assertEquals(detectarMime(new Uint8Array([1, 0, 2, 0xff]), 'x.txt'), null)
  assertEquals(detectarMime(zipSync({ 'a.txt': strToU8('a') }), 'x.zip'), null)
  assertEquals(detectarMime(new Uint8Array(), 'x.txt'), null)
})

Deno.test('o texto do Word sai um parágrafo por linha, sem as marcas', () => {
  assertEquals(textoDoDocx(docx()), 'Proposta & prazo\nSegunda linha')
})

Deno.test('a planilha sai uma linha por linha, células por tabulação', () => {
  assertEquals(textoDoXlsx(xlsx()), 'Conta\tValor\nAlfa\t1200')
})

Deno.test('o texto extraído respeita o limite; imagem não tem texto; PDF ilegível vira vazio', async () => {
  const longo = new TextEncoder().encode('a'.repeat(LIMITE_DE_TEXTO + 50))
  assertEquals((await extrairTexto(longo, 'text/plain', async () => ''))?.length, LIMITE_DE_TEXTO)
  assertEquals(await extrairTexto(PNG, 'image/png', async () => 'x'), null)
  assertEquals(await extrairTexto(PDF, 'application/pdf', async () => 'Página 1\r\nfim'), 'Página 1\nfim')
  assertEquals(await extrairTexto(PDF, 'application/pdf', () => Promise.reject(new Error('quebrado'))), '')
})
