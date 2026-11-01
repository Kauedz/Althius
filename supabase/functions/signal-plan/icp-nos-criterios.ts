// Ticket sinais-first 16 (achado do smoke 06): o ICP não pode ficar só na explicação do Plano. Quando o Briefing não
// fala de lugar, a geografia do ICP vira o critério `localizacao` do Plano, de forma determinística, sem depender do
// modelo ("Pará" fica de fora para não confundir com a preposição; a sigla PA conta). O critério só aceita países (`OPCOES.localizacao`); UF e região do Brasil viram "Brasil". Setor e porte não
// têm critério no Plano (o escopo são as Contas escolhidas): eles entram na Aderência (ticket 05) e no prompt.
import { CAMPOS_POR_TIPO, OPCOES, type PlanoDoSinal, validarPlano } from '../_shared/plano-do-sinal/index.ts'

type Pais = (typeof OPCOES.localizacao)[number]

const UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to']
const ESTADOS = [
  'acre', 'alagoas', 'amapa', 'amazonas', 'bahia', 'ceara', 'distrito federal', 'espirito santo', 'goias', 'maranhao',
  'mato grosso', 'minas gerais', 'paraiba', 'parana', 'pernambuco', 'piaui', 'rio de janeiro', 'rio grande do norte',
  'rio grande do sul', 'rondonia', 'roraima', 'santa catarina', 'sao paulo', 'sergipe', 'tocantins',
  'sudeste', 'nordeste', 'centro oeste', 'sul do brasil', 'norte do brasil', 'regiao sul', 'regiao norte',
]

const TERMOS_DOS_PAISES: Readonly<Record<Pais, readonly string[]>> = {
  Brasil: ['brasil', 'brazil', 'brasileira', 'brasileiras', 'brasileiros', ...ESTADOS],
  México: ['mexico'],
  Colômbia: ['colombia'],
  Argentina: ['argentina'],
  Chile: ['chile'],
  'Estados Unidos': ['estados unidos', 'eua', 'usa', 'united states'],
}

function normalizar(texto: string): string {
  return ` ${texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

/** Os países que um texto de geografia cita, na ordem das opções do Plano. Siglas de UF só contam em `comSiglas`. */
export function paisesDoTexto(texto: string, comSiglas = true): Pais[] {
  const t = normalizar(texto)
  return OPCOES.localizacao.filter((pais) =>
    TERMOS_DOS_PAISES[pais].some((termo) => t.includes(` ${termo} `)) ||
    (comSiglas && pais === 'Brasil' && UFS.some((uf) => t.includes(` ${uf} `)))
  )
}

/** O Briefing fala de lugar quando cita país, estado, região ou palavras de lugar. Siglas soltas não contam. */
export function briefingFalaDeLugar(briefing: string): boolean {
  const t = normalizar(briefing)
  return paisesDoTexto(briefing, false).length > 0 ||
    [' regiao ', ' regioes ', ' estado ', ' estados ', ' cidade ', ' cidades ', ' pais ', ' paises ', ' latam ', ' america ']
      .some((p) => t.includes(p))
}

/**
 * O Plano com a `localizacao` vinda da geografia do ICP, quando o tipo lê esse critério, o Briefing não fala de lugar
 * e a geografia cita algum país aceito. Em qualquer outro caso (ou se o Plano novo não validar), devolve o mesmo Plano.
 */
export function completarComIcp(
  plano: PlanoDoSinal,
  briefing: string,
  icp: { geography: string } | null | undefined,
  tiposAceitos: readonly string[],
): PlanoDoSinal {
  const sinal = plano.sinais[0]
  if (!icp?.geography.trim() || !sinal || !(CAMPOS_POR_TIPO[sinal.tipo] ?? []).includes('localizacao')) return plano
  if (briefingFalaDeLugar(briefing)) return plano
  const paises = paisesDoTexto(icp.geography)
  if (!paises.length) return plano
  const novo = { ...plano, sinais: [{ ...sinal, criterios: { ...sinal.criterios, localizacao: paises } }, ...plano.sinais.slice(1)] }
  const validado = validarPlano(novo, tiposAceitos)
  return validado.ok ? validado.plano : plano
}
