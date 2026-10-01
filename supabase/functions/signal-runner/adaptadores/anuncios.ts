// O que os dois Sinais de anúncio (Meta e LinkedIn, sinais-reais 05) dividem: o nome da Conta para a busca, reconhecer a
// Conta no anunciante, o filtro do formulário "anuncios" (período e palavras) e um Sinal por campanha nova. As bibliotecas
// de anúncios buscam por nome e trazem quem só se parece com a Conta, então o anúncio só conta quando o anunciante é a
// Conta. E uma campanha tem vários anúncios: os que começaram no período viram um Sinal por anunciante e mês de início,
// não um por anúncio (senão o foguinho infla).
import { type ContaParaVarrer, SemDadoParaVarrer, type SinalDoAdaptador } from '../handler.ts'
import {
  contemAlgum,
  dentroDoPeriodo,
  diasDoPeriodo,
  dominio,
  lista,
  mesDaData,
  mesmoDominio,
  nomeDaEmpresa,
  paginaDoLinkedin,
  recortar,
  sinal,
} from './comum.ts'

const DIA_EM_MS = 24 * 60 * 60 * 1000
/** O tamanho de cada trecho do texto do anúncio na evidência. */
export const TAMANHO_DO_TRECHO = 200
const MAX_TRECHOS = 2

/**
 * O nome da Conta para a busca, sem a forma jurídica do fim e com os acentos: "Acme Logística S.A." vira "Acme
 * Logística" (a biblioteca procura cada palavra, e "S.A." não está no anúncio). Sem nome, a Conta é pulada.
 */
export function nomeParaBusca(conta: ContaParaVarrer): string {
  const palavras = (conta.name ?? '').trim().split(/\s+/).filter(Boolean)
  const alvo = nomeDaEmpresa(conta.name)
  while (palavras.length > 1 && nomeDaEmpresa(palavras.slice(0, -1).join(' ')) === alvo) palavras.pop()
  const nome = palavras.join(' ')
  if (!alvo) throw new SemDadoParaVarrer('Contas sem nome ficaram de fora')
  return nome
}

/** A data de `dias` atrás, "AAAA-MM-DD" (UTC), para os filtros de data das bibliotecas. */
export function dataDeDiasAtras(dias: number, agora: number): string {
  return new Date(agora - dias * DIA_EM_MS).toISOString().slice(0, 10)
}

export interface Anunciante {
  nome: string
  /** A página de empresa do anunciante no LinkedIn, quando a fonte traz. */
  linkedinUrl?: string
  /** Os links de destino do anúncio (e o domínio que ele mostra). */
  destinos: string[]
}

const NUMERO = /^\d+$/

/**
 * Se quem anunciou é a Conta: a mesma página do LinkedIn, o link de destino no domínio da Conta ou o mesmo nome sem a
 * forma jurídica. O anúncio do LinkedIn traz o número da página (`/company/3608`) e a Conta costuma ter o nome
 * (`/company/acme`): só páginas diferentes na mesma forma dizem que não é. Na dúvida, não é.
 */
export function anuncianteEhAConta(conta: ContaParaVarrer, anunciante: Anunciante): boolean {
  const paginaDaConta = paginaDoLinkedin(conta.linkedinUrl)
  const pagina = paginaDoLinkedin(anunciante.linkedinUrl)
  if (paginaDaConta && pagina) {
    if (paginaDaConta === pagina) return true
    if (NUMERO.test(paginaDaConta) === NUMERO.test(pagina)) return false
  }
  const dominioDaConta = dominio(conta.domain)
  if (dominioDaConta && anunciante.destinos.some((d) => {
    const destino = dominio(d)
    return destino.includes('.') && mesmoDominio(dominioDaConta, destino)
  })) return true
  const nome = nomeDaEmpresa(anunciante.nome)
  return nome.length > 0 && nome === nomeDaEmpresa(conta.name)
}

/** O texto do anúncio sem os campos de catálogo que a Meta não preenche ("{{product.name}}"). */
export function textoDoAnuncio(...partes: unknown[]): string {
  return partes
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((p, i, todas) => todas.indexOf(p) === i)
    .join(' — ')
}

export interface Anuncio {
  id: string
  /** Quem anunciou, na chave do Sinal: o identificador da página ou o nome normalizado. */
  anunciante: string
  nomeDoAnunciante: string
  texto: string
  /** ISO 8601 do início; nulo quando a fonte não traz (o anúncio não conta: não dá para saber se é novo). */
  inicio: string | null
  /** O anúncio na biblioteca. */
  link: string
}

export interface Biblioteca {
  signalType: string
  /** "na Meta", "no LinkedIn". */
  onde: string
  fonte: string
  /** Se a busca só traz anúncios no ar (a frase diz "ativos"). */
  soAtivos: boolean
  /**
   * Se o anúncio sem data de início ainda conta: a busca já filtrou pelo período, então vale o mês da varredura e a frase
   * diz "anunciando", sem "começou". Só o LinkedIn: a saída real dele não traz a data (execução de 01/10/2026).
   */
  semDataValeAVarredura?: boolean
  /** O maior período que a busca da biblioteca consegue cobrir; o período do Monitoramento acima dele fica nesse limite. */
  periodoMaximoEmDias?: number
}

export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Se o anúncio passa pelos critérios do Monitoramento: começou no período e, com palavras, tem alguma no texto. Sem a data
 * de início, só passa quando a fonte não traz data (`semDataValeAVarredura`): aí a busca já filtrou pelo período.
 */
export function anuncioAtende(anuncio: Anuncio, criterios: Record<string, unknown>, agora: number, semDataVale = false): boolean {
  if (!anuncio.inicio ? !semDataVale : !dentroDoPeriodo(anuncio.inicio, agora, diasDoPeriodo(criterios))) return false
  const palavras = lista(criterios.palavras)
  return !palavras.length || contemAlgum(anuncio.texto, palavras)
}

/**
 * Os anúncios da Conta que atendem aos critérios, um Sinal por anunciante e mês de início: a data é a do anúncio mais
 * antigo do grupo, e a evidência tem a quantidade, até dois trechos do texto e o link da biblioteca.
 */
export function sinaisDosAnuncios(
  anuncios: Anuncio[],
  biblioteca: Biblioteca,
  criterios: Record<string, unknown>,
  agora: number,
): SinalDoAdaptador[] {
  const semDataVale = !!biblioteca.semDataValeAVarredura
  const dataDaVarredura = new Date(agora).toISOString()
  const unicos = new Map<string, Anuncio>()
  for (const a of anuncios) {
    if (a.id && !unicos.has(a.id) && anuncioAtende(a, criterios, agora, semDataVale)) unicos.set(a.id, a)
  }
  const grupos = new Map<string, Anuncio[]>()
  for (const a of unicos.values()) {
    const chave = `${biblioteca.signalType}|${a.anunciante}|${mesDaData(a.inicio ?? dataDaVarredura)}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), a])
  }
  return [...grupos].map(([eventKey, grupo]) => {
    // Sem nenhuma data no grupo, é só "anunciando no período": a data do Sinal é a da varredura.
    if (grupo.every((a) => !a.inicio)) {
      const n = grupo.length
      const dias = Math.min(diasDoPeriodo(criterios), biblioteca.periodoMaximoEmDias ?? Infinity)
      const quantos = `${n} ${n === 1 ? 'anúncio' : 'anúncios'}`
      const trechos = [...new Set(grupo.map((a) => a.texto).filter(Boolean))]
        .slice(0, MAX_TRECHOS)
        .map((t) => `“${recortar(t, TAMANHO_DO_TRECHO)}”`)
      return sinal({
        eventKey,
        phrase: `Anunciando ${biblioteca.onde}: ${quantos} nos últimos ${dias} dias`,
        firedAt: dataDaVarredura,
        source: biblioteca.fonte,
        evidence: [
          `${quantos} de ${grupo[0].nomeDoAnunciante} ${biblioteca.onde} nos últimos ${dias} dias; a biblioteca não informa a data de início (${biblioteca.fonte}).`,
          ...trechos,
          grupo[0].link,
        ].filter(Boolean).join(' '),
      })
    }
    grupo.sort((a, b) => Date.parse(a.inicio ?? dataDaVarredura) - Date.parse(b.inicio ?? dataDaVarredura))
    const [primeiro] = grupo
    const desde = dataCurta(primeiro.inicio!)
    const n = grupo.length
    const quantos = `${n} ${n === 1 ? 'anúncio' : 'anúncios'}${biblioteca.soAtivos ? (n === 1 ? ' ativo' : ' ativos') : ''}`
    const trechos = [...new Set(grupo.map((a) => a.texto).filter(Boolean))]
      .slice(0, MAX_TRECHOS)
      .map((t) => `“${recortar(t, TAMANHO_DO_TRECHO)}”`)
    const evidencia = [
      `${quantos} de ${primeiro.nomeDoAnunciante} ${biblioteca.onde}; o primeiro começou em ${desde} (${biblioteca.fonte}).`,
      ...trechos,
      primeiro.link,
    ]
    return sinal({
      eventKey,
      phrase: `Começou a anunciar ${biblioteca.onde}: ${quantos} desde ${desde}`,
      firedAt: primeiro.inicio!,
      source: biblioteca.fonte,
      evidence: evidencia.filter(Boolean).join(' '),
    })
  }).sort((a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt))
}
