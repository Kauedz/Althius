/**
 * A documentação da Ajuda: páginas em Markdown versionadas em `src/ajuda/*.md`, carregadas na build. Cada arquivo
 * começa com um cabeçalho (id, titulo, grupo, atualizado) e usa um Markdown pequeno: títulos `##`, parágrafos, listas
 * com `-`, tabelas, **negrito** e blocos de nota (`> [!nota]`) e atenção (`> [!atencao]`).
 */

export type Bloco =
  | { tipo: 'titulo'; id: string; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] }
  | { tipo: 'aviso'; nivel: 'nota' | 'atencao'; texto: string }

export interface PaginaDaDocumentacao {
  id: string
  titulo: string
  grupo: string
  atualizado: string
  blocos: Bloco[]
  /** O texto corrido da página, para a busca. */
  textoCorrido: string
}

export function ancora(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const celulas = (linha: string) =>
  linha
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function lerPagina(fonte: string): PaginaDaDocumentacao {
  const texto = fonte.replace(/\r\n/g, '\n')
  const cabecalho = /^---\n([\s\S]*?)\n---\n/.exec(texto)
  if (!cabecalho) throw new Error('Página da Ajuda sem cabeçalho')
  const meta = Object.fromEntries(
    cabecalho[1].split('\n').map((l) => {
      const i = l.indexOf(':')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
  )
  const linhas = texto.slice(cabecalho[0].length).split('\n')
  const blocos: Bloco[] = []
  let i = 0
  while (i < linhas.length) {
    const linha = linhas[i]
    if (!linha.trim()) {
      i++
    } else if (linha.startsWith('## ')) {
      const t = linha.slice(3).trim()
      blocos.push({ tipo: 'titulo', id: ancora(t), texto: t })
      i++
    } else if (linha.startsWith('|')) {
      const tabela: string[] = []
      while (i < linhas.length && linhas[i].startsWith('|')) tabela.push(linhas[i++])
      blocos.push({ tipo: 'tabela', cabecalho: celulas(tabela[0]), linhas: tabela.slice(2).map(celulas) })
    } else if (linha.startsWith('- ')) {
      const itens: string[] = []
      while (i < linhas.length && linhas[i].startsWith('- ')) itens.push(linhas[i++].slice(2).trim())
      blocos.push({ tipo: 'lista', itens })
    } else if (linha.startsWith('>')) {
      const partes: string[] = []
      while (i < linhas.length && linhas[i].startsWith('>')) partes.push(linhas[i++].replace(/^>\s?/, ''))
      const marca = /^\[!(nota|atencao)\]\s*/.exec(partes[0])
      const nivel = marca?.[1] === 'atencao' ? 'atencao' : 'nota'
      if (marca) partes[0] = partes[0].slice(marca[0].length)
      blocos.push({ tipo: 'aviso', nivel, texto: partes.filter(Boolean).join(' ') })
    } else {
      const partes: string[] = []
      while (i < linhas.length && linhas[i].trim() && !/^(## |\||- |>)/.test(linhas[i])) partes.push(linhas[i++].trim())
      blocos.push({ tipo: 'paragrafo', texto: partes.join(' ') })
    }
  }
  const textoCorrido = blocos
    .map((b) =>
      b.tipo === 'lista' ? b.itens.join(' ') : b.tipo === 'tabela' ? [...b.cabecalho, ...b.linhas.flat()].join(' ') : b.texto,
    )
    .join(' ')
    .replace(/\*\*/g, '')
  return { id: meta.id, titulo: meta.titulo, grupo: meta.grupo, atualizado: meta.atualizado, blocos, textoCorrido }
}

const ARQUIVOS = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** As páginas na ordem dos arquivos (01-, 02-...). */
export const PAGINAS_DA_DOCUMENTACAO: PaginaDaDocumentacao[] = Object.keys(ARQUIVOS)
  .sort()
  .map((caminho) => lerPagina(ARQUIVOS[caminho]))

export interface ResultadoDaBusca {
  pagina: PaginaDaDocumentacao
  /** A âncora do título mais próximo, quando o termo está numa seção. */
  ancora?: string
  rotulo: string
  trecho: string
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Busca local nos títulos e no texto das páginas. Sem custo e sem rede. */
export function buscar(termo: string, paginas = PAGINAS_DA_DOCUMENTACAO): ResultadoDaBusca[] {
  const t = semAcento(termo.trim())
  if (t.length < 2) return []
  const resultados: ResultadoDaBusca[] = []
  for (const pagina of paginas) {
    let secao: { id: string; texto: string } | undefined
    if (semAcento(pagina.titulo).includes(t)) resultados.push({ pagina, rotulo: pagina.titulo, trecho: pagina.titulo })
    for (const bloco of pagina.blocos) {
      if (bloco.tipo === 'titulo') {
        secao = bloco
        if (semAcento(bloco.texto).includes(t))
          resultados.push({ pagina, ancora: bloco.id, rotulo: `${pagina.titulo} › ${bloco.texto}`, trecho: bloco.texto })
        continue
      }
      const corrido = (
        bloco.tipo === 'lista'
          ? bloco.itens.join(' ')
          : bloco.tipo === 'tabela'
            ? [...bloco.cabecalho, ...bloco.linhas.flat()].join(' ')
            : bloco.texto
      ).replace(/\*\*/g, '')
      const pos = semAcento(corrido).indexOf(t)
      if (pos >= 0) {
        const inicio = Math.max(0, pos - 40)
        resultados.push({
          pagina,
          ancora: secao?.id,
          rotulo: secao ? `${pagina.titulo} › ${secao.texto}` : pagina.titulo,
          trecho: `${inicio > 0 ? '…' : ''}${corrido.slice(inicio, pos + t.length + 60)}`,
        })
      }
    }
  }
  return resultados.slice(0, 12)
}
