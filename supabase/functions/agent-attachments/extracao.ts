// O tipo e o texto dos anexos das Conversas (PR-10). O tipo vem dos primeiros bytes, não do que o navegador diz; o texto
// dos documentos vai para o contexto do modelo, cortado num limite. Nome e conteúdo nunca vão para o log.
import { strFromU8, unzipSync } from 'npm:fflate@0.8.2'

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const LIMITE_DE_TEXTO = 20000
export const TAMANHO_MAXIMO = 10 * 1024 * 1024

export type Mime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'application/pdf'
  | 'text/csv'
  | 'text/plain'
  | typeof MIME_DOCX
  | typeof MIME_XLSX

/** Os arquivos de um ZIP (docx e xlsx), ou null quando não é um ZIP legível. */
function abrirZip(bytes: Uint8Array): Record<string, Uint8Array> | null {
  try {
    return unzipSync(bytes)
  } catch {
    return null
  }
}

/** UTF-8 válido e sem bytes de controle binários: é texto. */
function ehTexto(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

/** O tipo do arquivo pelos bytes (e, no texto, pela extensão, para separar CSV de TXT). Fora da lista, null. */
export function detectarMime(bytes: Uint8Array, nome: string): Mime | null {
  const at = (offset: number, ...values: number[]) => values.every((v, i) => bytes[offset + i] === v)
  const ascii = (offset: number, texto: string) => at(offset, ...Array.from(texto, (c) => c.charCodeAt(0)))
  if (bytes.length === 0) return null
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (bytes.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  if (ascii(0, '%PDF-')) return 'application/pdf'
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) {
    const arquivos = abrirZip(bytes)
    if (!arquivos) return null
    if ('word/document.xml' in arquivos) return MIME_DOCX
    if ('xl/workbook.xml' in arquivos) return MIME_XLSX
    return null
  }
  if (ehTexto(bytes)) return /\.csv$/i.test(nome.trim()) ? 'text/csv' : 'text/plain'
  return null
}

export const ehImagem = (mime: string) => mime.startsWith('image/')

const ENTIDADES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' }
const desescapar = (texto: string) =>
  texto.replace(/&(lt|gt|quot|apos|amp);/g, (e) => ENTIDADES[e]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

/** O texto do documento do Word: um parágrafo por linha. */
export function textoDoDocx(bytes: Uint8Array): string {
  const xml = abrirZip(bytes)?.['word/document.xml']
  if (!xml) return ''
  return desescapar(
    strFromU8(xml)
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/\n{3,}/g, '\n\n').trim()
}

/** As planilhas do Excel como texto: uma linha por linha, células separadas por tabulação. */
export function textoDoXlsx(bytes: Uint8Array): string {
  const arquivos = abrirZip(bytes)
  if (!arquivos) return ''
  const compartilhadas = arquivos['xl/sharedStrings.xml']
    ? Array.from(strFromU8(arquivos['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g), (m) =>
      desescapar(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '')))
    : []
  const planilhas = Object.keys(arquivos).filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nome)).sort((a, b) =>
    Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0])
  )
  const partes: string[] = []
  for (const nome of planilhas) {
    const xml = strFromU8(arquivos[nome])
    const linhas = Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g), (linha) =>
      Array.from(linha[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g), (celula) => {
        const atributos = celula[1]
        const corpo = celula[2] ?? ''
        if (/t="s"/.test(atributos)) return compartilhadas[Number(corpo.match(/<v>(\d+)<\/v>/)?.[1] ?? -1)] ?? ''
        if (/t="inlineStr"/.test(atributos)) return desescapar(corpo.replace(/<[^>]+>/g, ''))
        return desescapar(corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
      }).join('\t'))
    if (linhas.length) partes.push(linhas.join('\n'))
  }
  return partes.join('\n\n').trim()
}

/** O texto que vai para o modelo, no limite. Imagem não tem texto; PDF usa o leitor injetado. */
export async function extrairTexto(
  bytes: Uint8Array,
  mime: Mime,
  lerPdf: (bytes: Uint8Array) => Promise<string>,
): Promise<string | null> {
  let texto: string
  if (ehImagem(mime)) return null
  if (mime === 'text/plain' || mime === 'text/csv') texto = new TextDecoder().decode(bytes)
  else if (mime === MIME_DOCX) texto = textoDoDocx(bytes)
  else if (mime === MIME_XLSX) texto = textoDoXlsx(bytes)
  else {
    try {
      texto = await lerPdf(bytes)
    } catch {
      texto = ''
    }
  }
  texto = texto.replace(/\r\n?/g, '\n').trim()
  return texto.length > LIMITE_DE_TEXTO ? texto.slice(0, LIMITE_DE_TEXTO) : texto
}
