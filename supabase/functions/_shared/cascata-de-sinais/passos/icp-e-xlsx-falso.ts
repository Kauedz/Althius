// Um arquivo .xlsx falso para os testes (nunca a rede): monta o zip com os mesmos arquivos que o Excel grava (workbook,
// relações, textos compartilhados e uma planilha por aba). Só para teste; o leitor de verdade está em `icp-e-xlsx.ts`.
export interface AbaFalsa {
  nome: string
  /** As linhas antes do cabeçalho (o arquivo da Finep traz título e "Posição: dd/mm/aaaa" no alto). */
  antes?: string[]
  cabecalho: string[]
  linhas: (string | number | null)[][]
}

const enc = new TextEncoder()
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function coluna(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function u16(n: number): number[] {
  return [n & 255, (n >> 8) & 255]
}
function u32(n: number): number[] {
  return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flux).arrayBuffer())
}

/** Um zip com os arquivos dados; os de nome em `armazenados` ficam sem compressão (método 0), os outros em deflate. */
export async function zipFalso(arquivos: Record<string, string>, armazenados: string[] = []): Promise<Uint8Array> {
  const partes: number[][] = []
  const central: number[][] = []
  let deslocamento = 0
  for (const [nome, texto] of Object.entries(arquivos)) {
    const bruto = enc.encode(texto)
    const metodo = armazenados.includes(nome) ? 0 : 8
    const dados = metodo === 0 ? bruto : await deflate(bruto)
    const nomeBytes = [...enc.encode(nome)]
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(metodo), ...u16(0), ...u16(0), ...u32(0), ...u32(dados.length), ...u32(bruto.length), ...u16(nomeBytes.length), ...u16(0), ...nomeBytes, ...dados]
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(metodo), ...u16(0), ...u16(0), ...u32(0), ...u32(dados.length), ...u32(bruto.length), ...u16(nomeBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(deslocamento), ...nomeBytes])
    partes.push(local)
    deslocamento += local.length
  }
  const diretorio = central.flat()
  const fim = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(diretorio.length), ...u32(deslocamento), ...u16(0)]
  return new Uint8Array([...partes.flat(), ...diretorio, ...fim])
}

/** O .xlsx com as abas dadas: textos nos "textos compartilhados" e números como número, como o Excel grava. */
export async function xlsxFalso(abas: AbaFalsa[]): Promise<Uint8Array> {
  const textos: string[] = []
  const indice = (t: string) => {
    let i = textos.indexOf(t)
    if (i < 0) i = textos.push(t) - 1
    return i
  }
  const arquivos: Record<string, string> = {}
  const folhas: string[] = []
  const relacoes: string[] = []
  abas.forEach((aba, k) => {
    const linhas: (string | number | null)[][] = [...(aba.antes ?? []).map((t) => [t]), aba.cabecalho, ...aba.linhas]
    const xmlLinhas = linhas.map((cels, r) => {
      const c = cels.map((v, i) => {
        if (v === null || v === '') return ''
        const ref = `${coluna(i)}${r + 1}`
        return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${indice(v)}</v></c>`
      }).join('')
      return `<row r="${r + 1}">${c}</row>`
    }).join('')
    arquivos[`xl/worksheets/sheet${k + 3}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlLinhas}</sheetData></worksheet>`
    folhas.push(`<sheet name="${xml(aba.nome)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`)
    relacoes.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 3}.xml"/>`)
  })
  arquivos['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${folhas.join('')}</sheets></workbook>`
  arquivos['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relacoes.join('')}</Relationships>`
  arquivos['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${textos.map((t) => `<si><t>${xml(t)}</t></si>`).join('')}</sst>`
  return await zipFalso(arquivos, ['xl/workbook.xml'])
}

/** O número de série do Excel (dias desde 30/12/1899) de uma data ISO. */
export function serialDoExcel(iso: string): number {
  return Math.round((Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86_400_000)
}
