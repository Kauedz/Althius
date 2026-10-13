// ICP F: funções puras sobre dados da EMPRESA (nunca de pessoa): o CNPJ da matriz de uma raiz e o endereço da sede. O
// endereço não fica gravado em texto: a fotografia guarda município, UF e uma marca (hash) da rua e do CEP, só para
// comparar de uma rodada para outra (o endereço de um empresário individual pode ser a casa dele).
import { normalizar } from '../../../signal-runner/adaptadores/comum.ts'
import { cnpjLimpo, objeto, texto } from './comum.ts'

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_2 = [6, ...PESOS_1]

function digito(base: string, pesos: number[]): number {
  const resto = [...base].reduce((soma, c, i) => soma + (c.charCodeAt(0) - 48) * pesos[i], 0) % 11
  return resto < 2 ? 0 : 11 - resto
}

/** O CNPJ (14 posições, numérico ou alfanumérico) da matriz da raiz do CNPJ dado: raiz + 0001 + dígitos verificadores. Vazio se não é CNPJ. */
export function cnpjDaMatriz(cnpj: unknown): string {
  const limpo = cnpjLimpo(cnpj)
  if (!limpo) return ''
  const base = `${limpo.slice(0, 8)}0001`
  const d1 = digito(base, PESOS_1)
  const d2 = digito(`${base}${d1}`, PESOS_2)
  return `${base}${d1}${d2}`
}

export const raizDoCnpj = (cnpj: string) => cnpj.slice(0, 8)

export function formatarCnpj(cnpj: string): string {
  return cnpj.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj
}

/** Marca curta e estável de um texto (cyrb53, em hexadecimal): serve para comparar, não para proteger segredo. */
export function hashCurto(valor: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < valor.length; i++) {
    const c = valor.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

const TIPOS_DE_LOGRADOURO = new Set([
  'rua', 'r', 'avenida', 'av', 'alameda', 'al', 'rodovia', 'rod', 'estrada', 'est', 'travessa', 'tv', 'praca', 'pca', 'largo', 'lg',
])

/** O logradouro e o número comparáveis: sem acento, caixa nem o tipo do logradouro ("Av.", "AVENIDA" ou nada). */
function viaNormalizada(logradouro: string, numero: string): string {
  const partes = normalizar(logradouro).split(' ').filter(Boolean)
  if (partes.length > 1 && TIPOS_DE_LOGRADOURO.has(partes[0])) partes.shift()
  const rua = partes.join(' ')
  const n = normalizar(numero).replace(/^s n$/, 'sn')
  return rua || n ? `${rua}|${n}` : ''
}

/** A sede como a fotografia a guarda. */
export interface EnderecoDaSede {
  municipio: string
  uf: string
  /** Marca do logradouro e do número; vazia quando a fonte não os trouxe. */
  via: string
  /** Marca do CEP; vazia quando a fonte não o trouxe. */
  cep: string
}

/** O endereço de um registro de CNPJ (`endereco.{logradouro,numero,municipio,uf,cep}`); nulo sem município e UF. */
export function enderecoDoItem(item: Record<string, unknown>): EnderecoDaSede | null {
  const e = objeto(item.endereco)
  const municipio = texto(e.municipio).toUpperCase()
  const uf = texto(e.uf).toUpperCase()
  if (!municipio || !uf) return null
  const via = viaNormalizada(texto(e.logradouro), texto(e.numero))
  const cep = texto(e.cep).replace(/\D/g, '')
  return { municipio, uf, via: via ? hashCurto(via) : '', cep: cep.length === 8 ? hashCurto(cep) : '' }
}

/** O que mudou na sede entre duas fotografias: a UF, o município ou o endereço; nulo se é o mesmo (só compara o que as duas trazem). */
export function mudancaDeSede(antes: EnderecoDaSede, depois: EnderecoDaSede): 'uf' | 'municipio' | 'endereco' | null {
  if (antes.uf !== depois.uf) return 'uf'
  if (normalizar(antes.municipio) !== normalizar(depois.municipio)) return 'municipio'
  if (antes.via && depois.via) return antes.via !== depois.via ? 'endereco' : null
  if (antes.cep && depois.cep && antes.cep !== depois.cep) return 'endereco'
  return null
}

const MINUSCULAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e'])

/** "SANTANA DE PARNAIBA" em "Santana de Parnaiba". */
export function tituloDoMunicipio(municipio: string): string {
  return municipio.toLowerCase().split(' ').filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')
}
