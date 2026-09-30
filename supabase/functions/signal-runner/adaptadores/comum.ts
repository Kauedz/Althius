// O que os adaptadores de Sinal (sinais-reais 03 a 06) têm em comum: ler os critérios do formulário do Monitoramento,
// reconhecer a Conta no resultado do actor (página do LinkedIn, domínio ou nome), ler datas e caber nos limites da
// tabela de Sinais. Nada aqui fala com a rede.
import { type ContaParaVarrer, SemDadoParaVarrer, type SinalDoAdaptador } from '../handler.ts'

/** Os limites de `private.signals`: um Sinal maior faria o banco recusar a varredura inteira da Conta. */
export const LIMITES = { chave: 300, frase: 300, fonte: 200, evidencia: 2000 } as const

const DIA_EM_MS = 24 * 60 * 60 * 1000

export function recortar(texto: string, max: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length <= max ? limpo : `${limpo.slice(0, max - 1).trimEnd()}…`
}

/** Minúsculas, sem acento, só letras e números separados por um espaço: a forma de comparar textos. */
export function normalizar(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Se algum dos termos aparece no texto, palavra inteira (termos e texto normalizados). */
export function contemAlgum(texto: unknown, termos: string[]): boolean {
  const alvo = ` ${normalizar(texto)} `
  return termos.some((t) => {
    const termo = normalizar(t)
    return termo.length > 0 && alvo.includes(` ${termo} `)
  })
}

export function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : typeof valor === 'number' ? String(valor) : ''
}

export function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {}
}

/** O primeiro valor de texto não vazio entre os caminhos dados (`'a.b'` desce em objetos). */
export function primeiroTexto(item: unknown, ...caminhos: string[]): string {
  for (const caminho of caminhos) {
    let atual: unknown = item
    for (const parte of caminho.split('.')) atual = objeto(atual)[parte]
    const valor = texto(atual)
    if (valor) return valor
  }
  return ''
}

// Só as formas jurídicas saem do nome: "Banco do Brasil" continua diferente de "Banco".
const FORMAS_JURIDICAS = new Set(['ltda', 'sa', 'me', 'epp', 'eireli', 'inc', 'llc', 'ltd', 'corp', 'plc', 'gmbh', 'cia'])

/** O nome da empresa para comparação: normalizado e sem a forma jurídica do fim ("Acme S.A." vira "acme"). */
export function nomeDaEmpresa(nome: unknown): string {
  const partes = normalizar(nome).split(' ').filter(Boolean)
  // "S.A." normalizado vira "s a".
  while (partes.length > 1) {
    const ultima = partes[partes.length - 1]
    if (FORMAS_JURIDICAS.has(ultima)) partes.pop()
    else if (ultima === 'a' && partes[partes.length - 2] === 's' && partes.length > 2) partes.splice(-2)
    else break
  }
  return partes.join(' ')
}

/** O identificador da página de empresa no LinkedIn (`/company/<id>`), em minúsculas, ou vazio. */
export function paginaDoLinkedin(url: unknown): string {
  const achado = texto(url).match(/linkedin\.com\/(?:company|school|showcase)\/([^/?#\s]+)/i)
  if (!achado) return ''
  try {
    return decodeURIComponent(achado[1]).toLowerCase()
  } catch {
    return achado[1].toLowerCase()
  }
}

/** O identificador do perfil de uma pessoa no LinkedIn (`/in/<id>`), em minúsculas, ou vazio. */
export function perfilDoLinkedin(url: unknown): string {
  const achado = texto(url).match(/linkedin\.com\/in\/([^/?#\s]+)/i)
  if (!achado) return ''
  try {
    return decodeURIComponent(achado[1]).toLowerCase()
  } catch {
    return achado[1].toLowerCase()
  }
}

/** O domínio de um site ou endereço, sem `www.`, ou vazio. Aceita o domínio puro ("acme.com.br"). */
export function dominio(valor: unknown): string {
  const bruto = texto(valor)
  if (!bruto) return ''
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(bruto) ? bruto : `https://${bruto}`)
    return url.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export interface EmpresaDoResultado {
  nome?: unknown
  linkedinUrl?: unknown
  site?: unknown
}

/**
 * Se a empresa do resultado é a Conta. A página do LinkedIn decide quando as duas pontas a têm; depois o domínio do
 * site; por fim o nome sem a forma jurídica. Na dúvida, não é: um Sinal de outra empresa é pior que um Sinal perdido.
 */
export function mesmaEmpresa(conta: ContaParaVarrer, empresa: EmpresaDoResultado): boolean {
  const paginaDaConta = paginaDoLinkedin(conta.linkedinUrl)
  const paginaDoResultado = paginaDoLinkedin(empresa.linkedinUrl)
  if (paginaDaConta && paginaDoResultado) return paginaDaConta === paginaDoResultado
  const dominioDaConta = dominio(conta.domain)
  const dominioDoResultado = dominio(empresa.site)
  if (dominioDaConta && dominioDoResultado && mesmoDominio(dominioDaConta, dominioDoResultado)) return true
  const nome = nomeDaEmpresa(empresa.nome)
  return nome.length > 0 && nome === nomeDaEmpresa(conta.name)
}

/** O mesmo site, com ou sem subdomínio ("carreiras.acme.com.br" é da "acme.com.br"). */
export function mesmoDominio(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

/** A página de empresa da Conta no LinkedIn, ou a Conta é pulada com o motivo. */
export function exigirPaginaDoLinkedin(conta: ContaParaVarrer): string {
  if (!paginaDoLinkedin(conta.linkedinUrl)) {
    throw new SemDadoParaVarrer('Contas sem a página da empresa no LinkedIn ficaram de fora')
  }
  return texto(conta.linkedinUrl)
}

// Critérios do formulário do Monitoramento (paginas/sinais/catalogo.ts, `CAMPOS`).

/** Uma lista de textos: aceita a lista das opções ou o texto livre separado por vírgulas. */
export function lista(valor: unknown): string[] {
  const itens = Array.isArray(valor) ? valor : typeof valor === 'string' ? valor.split(',') : []
  return itens.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
}

/** Os dias do "Período observado" ("Últimos 14 dias" vira 14); sem período, 30. */
export function diasDoPeriodo(criterios: Record<string, unknown>, padrao = 30): number {
  const achado = texto(criterios.periodo).match(/(\d+)/)
  const dias = achado ? Number(achado[1]) : padrao
  return Math.min(Math.max(dias, 1), 365)
}

export interface Pais {
  codigo: string
  /** Como o LinkedIn escreve o país. */
  nomeEmIngles: string
}

const PAISES: Record<string, Pais> = {
  brasil: { codigo: 'BR', nomeEmIngles: 'Brazil' },
  mexico: { codigo: 'MX', nomeEmIngles: 'Mexico' },
  colombia: { codigo: 'CO', nomeEmIngles: 'Colombia' },
  argentina: { codigo: 'AR', nomeEmIngles: 'Argentina' },
  chile: { codigo: 'CL', nomeEmIngles: 'Chile' },
  'estados unidos': { codigo: 'US', nomeEmIngles: 'United States' },
}

/** Os países da "Localização"; sem nenhum reconhecido, o Brasil. */
export function paisesDaLocalizacao(criterios: Record<string, unknown>): Pais[] {
  const paises = lista(criterios.localizacao).map((l) => PAISES[normalizar(l)]).filter((p): p is Pais => !!p)
  return paises.length ? [...new Map(paises.map((p) => [p.codigo, p])).values()] : [PAISES.brasil]
}

// Datas.

/** Uma data do actor em ISO 8601, ou nulo: aceita ISO, "AAAA-MM-DD" e milissegundos desde 1970. */
export function dataIso(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const d = new Date(valor < 1e11 ? valor * 1000 : valor)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const bruto = texto(valor)
  if (!bruto) return null
  if (/^\d{10,13}$/.test(bruto)) return dataIso(Number(bruto))
  const ms = Date.parse(bruto)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** Se a data está dentro dos últimos `dias` antes de `agora` (o futuro próximo o handler já trata). */
export function dentroDoPeriodo(iso: string, agora: number, dias: number): boolean {
  return Date.parse(iso) >= agora - dias * DIA_EM_MS
}

/** O mês da data ("2026-09"), para chaves de acontecimento que se repetem com o tempo. */
export function mesDaData(iso: string): string {
  return iso.slice(0, 7)
}

// Sinais.

/** O Sinal dentro dos limites do banco. */
export function sinal(s: SinalDoAdaptador): SinalDoAdaptador {
  return {
    eventKey: recortar(s.eventKey, LIMITES.chave),
    phrase: recortar(s.phrase, LIMITES.frase),
    firedAt: s.firedAt,
    ...(s.source ? { source: recortar(s.source, LIMITES.fonte) } : {}),
    ...(s.evidence ? { evidence: recortar(s.evidence, LIMITES.evidencia) } : {}),
  }
}

/** Um Sinal por acontecimento: dos repetidos no mesmo resultado, fica o mais antigo. */
export function semRepetidos(sinais: SinalDoAdaptador[]): SinalDoAdaptador[] {
  const porChave = new Map<string, SinalDoAdaptador>()
  for (const s of sinais) {
    const anterior = porChave.get(s.eventKey)
    if (!anterior || Date.parse(s.firedAt) < Date.parse(anterior.firedAt)) porChave.set(s.eventKey, s)
  }
  return [...porChave.values()]
}

/** A lista de itens do actor só com os objetos (o Apify pode devolver erros como itens). */
export function objetos(itens: unknown[]): Record<string, unknown>[] {
  return itens.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
}
