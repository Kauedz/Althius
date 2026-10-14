import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { anexosDoBanco, reservaComAnexos, textoDosAnexos } from './orquestracao.ts'
import type { Reserva } from './orquestracao.ts'

const RESERVA = { run_id: 'r1', request_text: 'Pedido', history: [] } as unknown as Reserva

Deno.test('sem anexos, o pedido não muda', () => {
  assertEquals(reservaComAnexos(RESERVA, []), RESERVA)
  assertEquals(textoDosAnexos([]), '')
})

Deno.test('o documento sem texto e a imagem vão pelo nome; o total respeita o limite', () => {
  const texto = textoDosAnexos([
    { id: '1', nome: 'scan.pdf', mime: 'application/pdf', texto: '' },
    { id: '2', nome: 'grande.txt', mime: 'text/plain', texto: 'a'.repeat(70000) },
    { id: '3', nome: 'foto.webp', mime: 'image/webp', texto: null },
  ])
  assertStringIncludes(texto, '[Arquivo anexado: scan.pdf, sem texto legível.]')
  assertStringIncludes(texto, '[Imagem anexada: foto.webp. Este motor não lê imagens')
  assertEquals(texto.length < 61000, true)
})

Deno.test('anexosDoBanco lê as linhas e baixa só as imagens', async () => {
  const baixadas: string[] = []
  const ler = anexosDoBanco(
    <T,>(_nome: string, _args: Record<string, unknown>) =>
      Promise.resolve([
        { id: '1', file_name: 'a.csv', mime: 'text/csv', path: 'p1', extracted_text: 'a;b' },
        { id: '2', file_name: 'b.png', mime: 'image/png', path: 'p2', extracted_text: null },
      ] as unknown as T),
    (path) => {
      baixadas.push(path)
      return Promise.resolve('YmFzZTY0')
    },
  )
  assertEquals(await ler('r1'), [
    { id: '1', nome: 'a.csv', mime: 'text/csv', texto: 'a;b' },
    { id: '2', nome: 'b.png', mime: 'image/png', texto: null, imagemBase64: 'YmFzZTY0' },
  ])
  assertEquals(baixadas, ['p2'])
})
