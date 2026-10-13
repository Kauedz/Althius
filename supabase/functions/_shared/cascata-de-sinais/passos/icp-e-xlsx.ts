// O leitor de .xlsx do ICP E (a planilha de contratações da Finep, https://download.finep.gov.br/Contratacao.xlsx, conferida
// em 13/10/2026: 7,5 MB, 11 abas, "Posição: dd/mm/aaaa" no alto de cada uma, datas em número de série do Excel). Sem
// dependência: o .xlsx é um zip; o `DecompressionStream` do runtime descomprime cada arquivo (método 8, deflate) e o
// leitor entende também o método 0 (sem compressão). Só lê o que os Sinais usam: nome das abas, textos compartilhados e as
// células das abas pedidas. Fórmulas, estilos e imagens são ignorados.
import { normalizar } from '../../../signal-runner/adaptadores/comum.ts'

const dec = new TextDecoder()

function u16(v: DataView, o: number): number {
  return v.getUint16(o, true)
}
function u32(v: DataView, o: number): number {
  return v.getUint32(o, true)
}

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flux).arrayBuffer())
}

/** Os arquivos do zip cujo nome o filtro aceita, já descomprimidos. Falha com mensagem clara se não for um zip. */
export async function lerZip(bytes: Uint8Array, aceita: (nome: string) => boolean): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fim = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (u32(v, i) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new Error('O arquivo recebido não é uma planilha (.xlsx).')
  const total = u16(v, fim + 10)
  let o = u32(v, fim + 16)
  const achados = new Map<string, Uint8Array>()
  for (let k = 0; k < total; k++) {
    if (u32(v, o) !== 0x02014b50) throw new Error('O arquivo recebido não é uma planilha (.xlsx): diretório do zip inválido.')
    const metodo = u16(v, o + 10)
    const comprimido = u32(v, o + 20)
    const nomeLen = u16(v, o + 28)
    const extraLen = u16(v, o + 30)
    const comentarioLen = u16(v, o + 32)
    const local = u32(v, o + 42)
    const nome = dec.decode(bytes.subarray(o + 46, o + 46 + nomeLen))
    o += 46 + nomeLen + extraLen + comentarioLen
    if (!aceita(nome)) continue
    if (u32(v, local) !== 0x04034b50) throw new Error('O arquivo recebido não é uma planilha (.xlsx): entrada do zip inválida.')
    const inicio = local + 30 + u16(v, local + 26) + u16(v, local + 28)
    const dados = bytes.subarray(inicio, inicio + comprimido)
    if (metodo === 0) achados.set(nome, dados)
    else if (metodo === 8) achados.set(nome, await inflar(dados))
    else throw new Error(`O zip usa um método de compressão que não lemos (${metodo}).`)
  }
  return achados
}

function desescapar(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/** A letra da coluna ("AB") de uma referência de célula ("AB12"). */
const colunaDe = (ref: string) => ref.replace(/[0-9]/g, '')

function textosCompartilhados(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
}

type Linha = Record<string, string>

/** As linhas de uma folha como { coluna: texto }, só com as células preenchidas. */
function linhasDaFolha(xml: string, textos: string[]): Linha[] {
  const linhas: Linha[] = []
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cels: Linha = {}
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const inner = c[3] ?? ''
      const tipo = /\bt="([^"]+)"/.exec(c[2])?.[1]
      let valor = ''
      if (tipo === 'inlineStr') valor = desescapar([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
        valor = tipo === 's' && v !== '' ? (textos[Number(v)] ?? '') : desescapar(v)
      }
      valor = valor.trim()
      if (valor !== '') cels[colunaDe(c[1])] = valor
    }
    linhas.push(cels)
  }
  return linhas
}

/**
 * As abas pedidas (pelo nome sem acento nem pontuação: "Projetos_Crédito_Direto" é "projetos credito direto") como linhas por
 * título de coluna. O cabeçalho é a primeira linha com 3 ou mais células seguida de uma com dados (o arquivo da Finep traz
 * título e "Posição: dd/mm/aaaa" antes). Aba que não existe volta vazia; linhas sem célula preenchida são ignoradas.
 */
export async function lerAbasDoXlsx(bytes: Uint8Array, nomesNormalizados: string[]): Promise<Map<string, Linha[]>> {
  // Primeiro o índice (pequeno); só depois as folhas pedidas: o arquivo da Finep tem 11 abas e só duas servem.
  const indice = await lerZip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml')
  const livro = indice.get('xl/workbook.xml')
  const relacoes = indice.get('xl/_rels/workbook.xml.rels')
  if (!livro || !relacoes) throw new Error('O arquivo recebido não é uma planilha (.xlsx): falta o índice das abas.')
  const alvoPorRid = new Map<string, string>()
  for (const r of dec.decode(relacoes).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[0])?.[1]
    const alvo = /\bTarget="([^"]+)"/.exec(r[0])?.[1]
    if (id && alvo) alvoPorRid.set(id, alvo.replace(/^\/?(xl\/)?/, 'xl/'))
  }
  const arquivoPorAba = new Map<string, string>()
  for (const s of dec.decode(livro).matchAll(/<sheet\b[^>]*>/g)) {
    const nome = normalizar(desescapar(/\bname="([^"]*)"/.exec(s[0])?.[1] ?? ''))
    const rid = /\br:id="([^"]+)"/.exec(s[0])?.[1]
    const arquivo = rid ? alvoPorRid.get(rid) : undefined
    if (arquivo && nomesNormalizados.includes(nome)) arquivoPorAba.set(nome, arquivo)
  }
  const saida = new Map<string, Linha[]>(nomesNormalizados.map((n) => [n, []]))
  if (!arquivoPorAba.size) return saida
  const folhas = await lerZip(bytes, (n) => [...arquivoPorAba.values()].includes(n))
  const textosXml = indice.get('xl/sharedStrings.xml')
  const textos = textosXml ? textosCompartilhados(dec.decode(textosXml)) : []
  for (const [nome, arquivo] of arquivoPorAba) {
    const folha = folhas.get(arquivo)
    if (!folha) continue
    const linhas = linhasDaFolha(dec.decode(folha), textos)
    const iCab = linhas.findIndex((l, i) => Object.keys(l).length >= 3 && Object.keys(linhas[i + 1] ?? {}).length >= 2)
    if (iCab < 0) continue
    const cab = linhas[iCab]
    saida.set(nome, linhas.slice(iCab + 1).filter((l) => Object.keys(l).length > 0).map((l) => {
      const o: Linha = {}
      for (const [col, valor] of Object.entries(l)) if (cab[col]) o[cab[col]] = valor
      return o
    }))
  }
  return saida
}

/** O número de série do Excel (dias desde 30/12/1899) em ISO 8601 ao meio-dia UTC; nulo se não for número. */
export function excelParaIso(serial: string): string | null {
  const n = Number(serial)
  if (!serial.trim() || !Number.isFinite(n) || n < 1 || n > 80_000) return null
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000 + 12 * 3_600_000).toISOString()
}
