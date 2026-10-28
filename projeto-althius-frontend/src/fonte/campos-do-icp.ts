export const PORTES_DO_ICP = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+',
  'MEI',
  'ME',
  'EPP',
  'DEMAIS',
] as const

export interface CamposDoIcp {
  setor: string
  porte: string
  regiao: string
}

const ROTULOS: Record<keyof CamposDoIcp, string[]> = {
  setor: ['setor', 'setores', 'segmento', 'segmentos', 'industria', 'industrias', 'vertical', 'verticais', 'nicho', 'nichos'],
  porte: ['porte', 'portes', 'tamanho', 'tamanho da empresa', 'faixa de funcionarios', 'numero de funcionarios', 'funcionarios', 'colaboradores', 'headcount'],
  regiao: ['regiao', 'regioes', 'localizacao', 'localizacoes', 'local', 'geografia', 'praca', 'pracas', 'estado', 'estados', 'cidade', 'cidades', 'pais', 'paises', 'onde'],
}

const FAIXAS = PORTES_DO_ICP.slice(0, 8)

function semAcentos(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizarLista(valor: string): string {
  const vistos = new Set<string>()
  const itens: string[] = []
  for (const item of valor.split(',')) {
    const limpo = item.trim()
    const chave = limpo.toLowerCase()
    if (!limpo || vistos.has(chave)) continue
    vistos.add(chave)
    itens.push(limpo)
    if (itens.length === 20) break
  }
  return itens.join(', ')
}

export function portesInvalidos(valor: string): string[] {
  const aceitos = new Set(PORTES_DO_ICP.map((porte) => porte.toUpperCase()))
  return normalizarLista(valor)
    .split(', ')
    .filter((porte) => porte && !aceitos.has(porte.toUpperCase()))
}

function itensDe(valor: string): string[] {
  return valor.split(/\s*[,;•/]\s*|\s{2,}/).filter(Boolean)
}

function faixasDoTexto(valor: string): string[] {
  const texto = semAcentos(valor)
  const numeros = [...valor.replace(/(\d)[.\s](\d{3})\b/g, '$1$2').matchAll(/\d+/g)].map((item) => Number(item[0]))
  if (!numeros.length) return []
  const cobre = (min: number, max: number) =>
    FAIXAS.filter((faixa) => {
      const [inicio, fim] = faixa.split('-').map(Number)
      return (fim ?? Number.POSITIVE_INFINITY) >= min && inicio <= max
    })
  if (/\b(mais de|acima de|a partir de|maior que|superior a)\b/.test(texto) || /\d\s*\+/.test(valor)) {
    return cobre(numeros[0], Number.POSITIVE_INFINITY)
  }
  if (/\b(ate|menos de|no maximo|abaixo de|inferior a)\b/.test(texto) && numeros.length === 1) {
    return cobre(1, numeros[0])
  }
  return numeros.length >= 2 ? cobre(Math.min(numeros[0], numeros[1]), Math.max(numeros[0], numeros[1])) : cobre(numeros[0], numeros[0])
}

function paresDoIcp(conteudo: { texto?: unknown; linhas?: unknown }): [string, string[]][] {
  const pares: [string, string[]][] = []
  const texto = typeof conteudo.texto === 'string' ? conteudo.texto : ''
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.replace(/^[\s\-–•*#>]+/, '').trim()
    if (!limpa) continue
    if (limpa.includes('|')) {
      const [rotulo, ...resto] = limpa.split('|').map((celula) => celula.trim())
      if (rotulo && resto.some(Boolean)) pares.push([rotulo, resto.filter(Boolean)])
    } else {
      const achado = limpa.match(/^([^:]{2,40}):\s*(.+)$/)
      if (achado) pares.push([achado[1].trim(), [achado[2].trim()]])
    }
  }
  const linhas = Array.isArray(conteudo.linhas) ? conteudo.linhas : []
  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object' || Array.isArray(linha)) continue
    for (const [chave, valor] of Object.entries(linha)) {
      if (typeof valor === 'string' && valor.trim()) pares.push([chave, [valor.trim()]])
    }
  }
  return pares
}

export function sugerirCamposDoIcp(conteudo: { texto?: unknown; linhas?: unknown }): CamposDoIcp {
  const campos: Record<keyof CamposDoIcp, string[]> = { setor: [], porte: [], regiao: [] }
  const rotuloParaCampo = new Map<string, keyof CamposDoIcp>(
    (Object.entries(ROTULOS) as [keyof CamposDoIcp, string[]][]).flatMap(([campo, rotulos]) => rotulos.map((rotulo) => [rotulo, campo])),
  )
  for (const [rotulo, valores] of paresDoIcp(conteudo)) {
    const campo = rotuloParaCampo.get(semAcentos(rotulo))
    if (!campo) continue
    if (campo === 'porte') {
      campos.porte.push(...valores.flatMap((valor) => [...faixasDoTexto(valor), ...(valor.match(/\b(MEI|EPP|DEMAIS)\b/gi) ?? [])]))
    } else {
      campos[campo].push(...valores.flatMap(itensDe))
    }
  }
  return {
    setor: normalizarLista(campos.setor.join(', ')),
    porte: normalizarLista(campos.porte.join(', ')),
    regiao: normalizarLista(campos.regiao.join(', ')),
  }
}
