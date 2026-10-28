// Os filtros da busca de Contas pelo ICP: o que a pessoa vê e confirma antes de rodar, e o que o ICP do Playbook sugere.
// O ICP do Workspace é texto da seção "ICP" do Playbook (ou as linhas da planilha do setup, "Rótulo | valor | valor");
// daí saem, por regra e sem IA, os rótulos que a empresa costuma escrever: setor, porte, região, tecnologias, palavras-chave
// e o que excluir. É só uma sugestão: a pessoa confere e corrige antes de gastar Créditos. Nada aqui fala com a rede.
import { normalizar } from '../signal-runner/adaptadores/comum.ts'
import { ufDe } from './regioes.ts'

export type FonteDeBusca = 'linkedin' | 'receita'

export interface CriteriosDeBusca {
  /** De onde vêm as empresas: o LinkedIn (setor, local e porte) ou o cadastro da Receita Federal (CNAE e estado). */
  fonte: FonteDeBusca
  setores: string[]
  palavrasChave: string[]
  /** Faixas de funcionários do LinkedIn ("51-200") ou portes legais da Receita ("ME", "EPP", "DEMAIS", "MEI"). */
  portes: string[]
  /** Siglas de estado, nomes de estado ou cidades; "Brasil" vale para o país inteiro. */
  regioes: string[]
  tecnologias: string[]
  excluir: string[]
  /** CNAE de 7 dígitos. */
  cnaes: string[]
}

/** As faixas de funcionários que o filtro de porte do LinkedIn entende, da menor à maior. */
export const FAIXAS_DE_PORTE: readonly { rotulo: string; min: number; max: number }[] = [
  { rotulo: '1-10', min: 1, max: 10 },
  { rotulo: '11-50', min: 11, max: 50 },
  { rotulo: '51-200', min: 51, max: 200 },
  { rotulo: '201-500', min: 201, max: 500 },
  { rotulo: '501-1000', min: 501, max: 1000 },
  { rotulo: '1001-5000', min: 1001, max: 5000 },
  { rotulo: '5001-10000', min: 5001, max: 10000 },
  { rotulo: '10001+', min: 10001, max: Number.POSITIVE_INFINITY },
]

/** Os portes legais do cadastro da Receita Federal. */
export const PORTES_LEGAIS = ['MEI', 'ME', 'EPP', 'DEMAIS'] as const

const MAX_ITENS = 20
const MAX_TEXTO = 80

export function criteriosVazios(): CriteriosDeBusca {
  return { fonte: 'linkedin', setores: [], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] }
}

/** Uma lista de textos curtos: aparada, sem vazios nem repetidos (sem diferenciar maiúsculas) e no máximo 20. */
function textos(valor: unknown): string[] {
  const itens = Array.isArray(valor) ? valor : typeof valor === 'string' ? valor.split(/[,;\n]/) : []
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const item of itens) {
    if (typeof item !== 'string') continue
    const limpo = item.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO)
    const chave = limpo.toLowerCase()
    if (!limpo || vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(limpo)
    if (saida.length >= MAX_ITENS) break
  }
  return saida
}

/** O CNAE em 7 dígitos ("6201-5/01" vira "6201501"), ou nulo. */
export function cnaeValido(valor: unknown): string | null {
  const digitos = typeof valor === 'string' || typeof valor === 'number' ? String(valor).replace(/\D/g, '') : ''
  return digitos.length === 7 ? digitos : null
}

/** Os critérios que chegam do navegador, limpos: só os campos conhecidos, listas curtas, porte e CNAE válidos. */
export function normalizarCriterios(bruto: unknown): CriteriosDeBusca {
  const entrada = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
  const faixas = new Set(FAIXAS_DE_PORTE.map((f) => f.rotulo))
  const legais = new Set<string>(PORTES_LEGAIS)
  const portes = textos(entrada.portes).map((p) => p.toUpperCase()).filter((p) => faixas.has(p) || legais.has(p))
  const cnaes = textos(entrada.cnaes).map(cnaeValido).filter((c): c is string => !!c)
  return {
    fonte: entrada.fonte === 'receita' ? 'receita' : 'linkedin',
    setores: textos(entrada.setores),
    palavrasChave: textos(entrada.palavrasChave),
    portes: [...new Set(portes)],
    regioes: textos(entrada.regioes),
    tecnologias: textos(entrada.tecnologias),
    excluir: textos(entrada.excluir),
    cnaes: [...new Set(cnaes)],
  }
}

/** O que falta para a busca ter por onde começar, em palavras do produto; nulo quando os critérios bastam. */
export function faltaParaBuscar(criterios: CriteriosDeBusca): string | null {
  if (criterios.fonte === 'receita') {
    return criterios.cnaes.length ? null : 'Informe ao menos um CNAE de 7 dígitos para buscar na Receita Federal.'
  }
  return criterios.setores.length || criterios.palavrasChave.length ? null : 'Informe ao menos um setor ou uma palavra-chave.'
}

// O ICP do Playbook.

/** O que a seção ICP do Playbook guarda: texto livre e as linhas das tabelas do modelo. */
export interface ConteudoDoIcp {
  texto?: unknown
  linhas?: unknown
}

type Campo = 'setores' | 'portes' | 'regioes' | 'tecnologias' | 'palavrasChave' | 'excluir' | 'cnaes'

// Os rótulos de cada campo, na forma de `normalizar` (sem acento nem pontuação).
const ROTULOS: Record<Campo, string[]> = {
  setores: ['setor', 'setores', 'segmento', 'segmentos', 'industria', 'industrias', 'vertical', 'verticais', 'nicho', 'nichos'],
  portes: [
    'porte', 'portes', 'tamanho', 'tamanho da empresa', 'faixa de funcionarios', 'numero de funcionarios', 'funcionarios',
    'colaboradores', 'headcount',
  ],
  regioes: [
    'regiao', 'regioes', 'localizacao', 'localizacoes', 'local', 'geografia', 'praca', 'pracas', 'estado', 'estados',
    'cidade', 'cidades', 'pais', 'paises', 'onde',
  ],
  tecnologias: ['tecnologia', 'tecnologias', 'stack', 'ferramentas', 'ferramenta', 'sistemas'],
  palavrasChave: ['palavras chave', 'palavra chave', 'keywords', 'keyword', 'termos de busca', 'termos'],
  excluir: [
    'excluir', 'excluir empresas', 'nao atender', 'nao atendemos', 'nao queremos', 'anti icp', 'fora do icp',
    'desqualificar', 'desqualificadores', 'descartar',
  ],
  cnaes: ['cnae', 'cnaes'],
}

const CAMPO_DO_ROTULO = new Map<string, Campo>(
  (Object.entries(ROTULOS) as [Campo, string[]][]).flatMap(([campo, rotulos]) => rotulos.map((r) => [r, campo] as const)),
)

/** Um rótulo e seus valores: "Setor: A, B", "Setor | A | B" ou, nas linhas da tabela, as chaves do objeto. */
function paresDoIcp(conteudo: ConteudoDoIcp): [rotulo: string, valores: string[]][] {
  const pares: [string, string[]][] = []
  const texto = typeof conteudo.texto === 'string' ? conteudo.texto : ''
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.replace(/^[\s\-–•*#>]+/, '').trim()
    if (!limpa) continue
    if (limpa.includes('|')) {
      const [rotulo, ...resto] = limpa.split('|').map((c) => c.trim())
      if (rotulo && resto.some(Boolean)) pares.push([rotulo, resto.filter(Boolean)])
      continue
    }
    const achado = limpa.match(/^([^:]{2,40}):\s*(.+)$/)
    if (achado) pares.push([achado[1].trim(), [achado[2].trim()]])
  }
  const linhas = Array.isArray(conteudo.linhas) ? conteudo.linhas : []
  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object' || Array.isArray(linha)) continue
    for (const [chave, valor] of Object.entries(linha as Record<string, unknown>)) {
      if (typeof valor === 'string' && valor.trim()) pares.push([chave, [valor.trim()]])
    }
  }
  return pares
}

/** Separa "A, B; C / D" em itens. Não separa por "e", que aparece dentro de nomes ("Saúde e bem-estar"). */
function itensDe(valores: string[]): string[] {
  return textos(valores.flatMap((v) => v.split(/\s*[,;•/]\s*|\s{2,}/)))
}

/** As faixas de funcionários que o texto cobre: "51-200", "201 a 500", "mais de 1000", "até 50", "1000+". */
export function faixasDoTexto(valor: string): string[] {
  const texto = normalizar(valor)
  const numeros = [...valor.replace(/(\d)[.\s](\d{3})\b/g, '$1$2').matchAll(/\d+/g)].map((m) => Number(m[0]))
  if (!numeros.length) return []
  const cobre = (min: number, max: number) =>
    FAIXAS_DE_PORTE.filter((f) => f.max >= min && f.min <= max).map((f) => f.rotulo)
  if (/\b(mais de|acima de|a partir de|maior que|superior a)\b/.test(texto) || /\d\s*\+/.test(valor)) {
    return cobre(numeros[0], Number.POSITIVE_INFINITY)
  }
  if (/\b(ate|menos de|no maximo|abaixo de|inferior a)\b/.test(texto) && numeros.length === 1) {
    return cobre(1, numeros[0])
  }
  if (numeros.length >= 2) return cobre(Math.min(numeros[0], numeros[1]), Math.max(numeros[0], numeros[1]))
  return cobre(numeros[0], numeros[0])
}

/**
 * Os critérios que o ICP do Playbook sugere. Cada rótulo conhecido ("Setor", "Porte", "Região", "Tecnologias", "Palavras-chave",
 * "Excluir", "CNAE") alimenta o seu campo; o que não tem rótulo conhecido é ignorado, nunca adivinhado. Com CNAE e sem setor,
 * a busca sugerida é a da Receita Federal.
 */
export function criteriosDoIcp(conteudo: ConteudoDoIcp): CriteriosDeBusca {
  const campos: Record<Campo, string[]> = {
    setores: [], portes: [], regioes: [], tecnologias: [], palavrasChave: [], excluir: [], cnaes: [],
  }
  for (const [rotulo, valores] of paresDoIcp(conteudo)) {
    const campo = CAMPO_DO_ROTULO.get(normalizar(rotulo))
    if (!campo) continue
    if (campo === 'portes') {
      campos.portes.push(
        ...valores.flatMap((v) => [
          ...faixasDoTexto(v),
          ...(v.match(/\b(MEI|ME|EPP|DEMAIS)\b/g) ?? []),
        ]),
      )
    } else if (campo === 'cnaes') {
      campos.cnaes.push(...valores.flatMap((v) => v.match(/\d{4}-?\d\/?\d{2}/g) ?? []).map((c) => cnaeValido(c) ?? ''))
    } else if (campo === 'regioes') {
      // Estados escritos por extenso ou por sigla ficam como estão; "Brasil" vale o país inteiro.
      campos.regioes.push(...itensDe(valores).map((r) => (ufDe(r) && r.length === 2 ? ufDe(r)! : r)))
    } else {
      campos[campo].push(...itensDe(valores))
    }
  }
  const criterios = normalizarCriterios({ ...campos, fonte: 'linkedin' })
  if (criterios.cnaes.length && !criterios.setores.length && !criterios.palavrasChave.length) criterios.fonte = 'receita'
  return criterios
}
