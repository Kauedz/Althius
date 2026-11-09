// Os filtros da busca de Contas: o que a pessoa vê e confirma antes de rodar. Os filtros sugeridos saem do Contexto da
// empresa, pela preparação (preparacao.ts); aqui só a forma deles e a limpeza do que chega. Nada aqui fala com a rede.

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
