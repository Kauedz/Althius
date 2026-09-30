// O que os quatro Sinais de movimentação de pessoas (sinais-reais 04) dividem: a classificação dos cargos brasileiros
// (liderança e as opções de "Cargos acompanhados", em português e em inglês, com marca de gênero), a leitura da
// experiência de um perfil do LinkedIn no formato dos actors da HarvestAPI (`experience[]` e `currentPosition[]`), o
// reconhecimento da Conta na experiência, a data de início do cargo (o LinkedIn só dá mês e ano) e os filtros de
// "Movimento" e "Pessoas de referência". Nada aqui fala com a rede.
import type { ContaParaVarrer } from '../handler.ts'
import {
  contemAlgum, lista, mesmaEmpresa, nomeDaEmpresa, normalizar, objeto, paginaDoLinkedin, perfilDoLinkedin, primeiroTexto, texto,
} from './comum.ts'

// Cargos.

// A forma masculina de cada palavra de cargo, para comparar "Diretora Financeira" com "diretor financeiro".
const MASCULINO: Readonly<Record<string, string>> = {
  diretora: 'diretor',
  socia: 'socio',
  presidenta: 'presidente',
  coordenadora: 'coordenador',
  financeira: 'financeiro',
  executiva: 'executivo',
  administrativa: 'administrativo',
  juridica: 'juridico',
  tecnica: 'tecnico',
}

/** O cargo para comparação: normalizado, sem marca de gênero ("Diretor(a)", "Sócio/a") e no masculino. */
export function cargoNormalizado(titulo: unknown): string {
  const saida: string[] = []
  for (const p of normalizar(titulo).split(' ').filter(Boolean)) {
    // "Diretor(a)" normalizado vira "diretor a": o "a" solto depois de uma palavra de cargo é a marca de gênero.
    if ((p === 'a' || p === 'as') && /(or|o|os|es|e)$/.test(saida[saida.length - 1] ?? '')) continue
    saida.push(MASCULINO[p] ?? p)
  }
  return saida.join(' ')
}

// As palavras que fazem um cargo ser de liderança (na forma de `cargoNormalizado`). "Manager", "lead" e "coordenador"
// ficam de fora de propósito: "Product Manager" e "Tech Lead" não decidem compra.
const LIDERANCA = [
  'diretor', 'director', 'diretoria executiva', 'managing director', 'gerente', 'general manager', 'country manager',
  'head', 'vp', 'svp', 'evp', 'avp', 'vice presidente', 'vice president', 'presidente', 'president', 'superintendente',
  'socio', 'managing partner', 'founding partner', 'chief', 'ceo', 'cto', 'cfo', 'cdo', 'coo', 'cio', 'cmo', 'cro',
  'chro', 'ciso', 'cco', 'cpo', 'cso', 'cao',
]

// O que desmente a liderança mesmo com a palavra no cargo ("Assistente da Diretoria", "Assistant to the CEO").
const NAO_LIDERANCA = [
  'assistente', 'assistant', 'secretario', 'secretaria', 'estagiario', 'estagiaria', 'estagio', 'intern', 'internship',
  'trainee', 'aprendiz', 'jovem aprendiz', 'business partner', 'hrbp', 'headhunter', 'head hunter', 'ex',
]

/** Se o cargo é de liderança: Diretor(a), Gerente, Head, Sócio(a), Superintendente, VP ou C-level, em pt e em en. */
export function ehLideranca(titulo: unknown): boolean {
  const cargo = cargoNormalizado(titulo)
  return !!cargo && !contemAlgum(cargo, NAO_LIDERANCA) && contemAlgum(cargo, LIDERANCA)
}

/** Os termos (forma de `cargoNormalizado`) que reconhecem cada opção de "Cargos acompanhados". */
export const TERMOS_DOS_CARGOS: Readonly<Record<string, string[]>> = {
  'CDO': [
    'cdo', 'chief data officer', 'chief data and analytics officer', 'chief data analytics officer', 'chief analytics officer',
    'diretor de dados', 'diretor de data', 'diretor de analytics', 'diretor de inteligencia de dados', 'director of data',
    'data director', 'vp de dados', 'vp of data', 'vice presidente de dados',
  ],
  // O CIO e o "Diretor de TI" entram no CTO: no Brasil costumam ser a mesma cadeira na decisão de tecnologia.
  'CTO': [
    'cto', 'chief technology officer', 'chief technical officer', 'cio', 'chief information officer', 'diretor de tecnologia',
    'diretor de ti', 'diretor de tecnologia da informacao', 'director of technology', 'technology director', 'vp de tecnologia',
    'vp of technology', 'vice presidente de tecnologia',
  ],
  'VP de Engenharia': [
    'vp de engenharia', 'vp engenharia', 'vp of engineering', 'vp engineering', 'svp of engineering', 'evp of engineering',
    'vice presidente de engenharia', 'vice president of engineering', 'diretor de engenharia', 'director of engineering',
    'engineering director', 'head de engenharia', 'head of engineering',
  ],
  'Head de Dados': [
    'head de dados', 'head of data', 'head data', 'head de data', 'head de analytics', 'head of analytics',
    'head de engenharia de dados', 'head of data engineering', 'head de ciencia de dados', 'head of data science',
    'head de bi', 'head de inteligencia de dados', 'gerente de dados', 'gerente de engenharia de dados',
  ],
  'CFO': [
    'cfo', 'chief financial officer', 'diretor financeiro', 'diretor de financas', 'diretor administrativo financeiro',
    'diretor administrativo e financeiro', 'finance director', 'director of finance', 'vp financeiro', 'vp de financas',
    'vp of finance', 'vice presidente financeiro', 'vice presidente de financas', 'head de financas', 'head of finance',
  ],
  // "CPO" fica de fora: também é Chief Product Officer.
  'Procurement': ['procurement', 'compras', 'suprimentos', 'sourcing', 'purchasing', 'chief procurement officer'],
}

/** Como cada opção vai para o filtro de cargo do LinkedIn (poucas formas, as mais comuns). */
const BUSCAS_DOS_CARGOS: Readonly<Record<string, string[]>> = {
  'CDO': ['CDO', 'Chief Data Officer', 'Diretor de Dados'],
  'CTO': ['CTO', 'Chief Technology Officer', 'Diretor de Tecnologia'],
  'VP de Engenharia': ['VP de Engenharia', 'VP of Engineering', 'Diretor de Engenharia'],
  'Head de Dados': ['Head de Dados', 'Head of Data'],
  'CFO': ['CFO', 'Chief Financial Officer', 'Diretor Financeiro'],
  'Procurement': ['Diretor de Compras', 'Gerente de Compras', 'Head of Procurement', 'Gerente de Suprimentos'],
}

/** Sem cargo escolhido, a busca vai atrás de qualquer liderança. */
const BUSCAS_DE_LIDERANCA = ['Diretor', 'Diretora', 'Head', 'VP', 'Vice-presidente', 'Superintendente', 'Gerente', 'Chief', 'Director']

/** Os títulos que vão para o filtro de cargo do actor: os dos cargos escolhidos, ou os de liderança. */
export function buscasDosCargos(criterios: Record<string, unknown>): string[] {
  const cargos = lista(criterios.cargos)
  if (!cargos.length) return [...BUSCAS_DE_LIDERANCA]
  return [...new Set(cargos.flatMap((c) => BUSCAS_DOS_CARGOS[c] ?? [c]))]
}

/** Se o cargo é de liderança e, com cargos escolhidos, é um deles. Sem cargo escolhido, qualquer liderança serve. */
export function cargoAtende(titulo: unknown, criterios: Record<string, unknown>): boolean {
  if (!ehLideranca(titulo)) return false
  const cargos = lista(criterios.cargos)
  const cargo = cargoNormalizado(titulo)
  return !cargos.length || cargos.some((c) => contemAlgum(cargo, TERMOS_DOS_CARGOS[c] ?? [cargoNormalizado(c)]))
}

// Movimento e pessoas.

export type Movimento = 'Chegada' | 'Promoção' | 'Mudança de empresa'

/** Se o movimento está entre os escolhidos em "Movimento"; sem nenhum escolhido, todos valem. */
export function movimentoAceito(movimento: Movimento, criterios: Record<string, unknown>): boolean {
  const escolhidos = lista(criterios.movimento).map(normalizar)
  return !escolhidos.length || escolhidos.includes(normalizar(movimento))
}

/**
 * Se "Pessoas de referência" pede gente que já é Contato da Conta. Só "Qualquer pessoa no cargo" (ou nada) abre para
 * qualquer um; "Contatos das Contas-alvo" e as listas de compradores e campeões se restringem aos Contatos vinculados
 * que chegam à varredura (o runner não separa compradores de campeões, então ficam todos os Contatos).
 */
export function exigeContato(criterios: Record<string, unknown>): boolean {
  const pessoas = normalizar(criterios.pessoas)
  return !!pessoas && pessoas !== normalizar('Qualquer pessoa no cargo')
}

/** Os perfis do LinkedIn (`/in/<id>`) dos Contatos vinculados à Conta, sem repetir. */
export function perfisDosContatos(conta: ContaParaVarrer): string[] {
  return [...new Set((conta.contatos ?? []).map((c) => perfilDoLinkedin(c.linkedinUrl)).filter(Boolean))]
}

/** Se a pessoa passa por "Pessoas de referência". */
export function pessoaAtende(perfil: string, conta: ContaParaVarrer, criterios: Record<string, unknown>): boolean {
  return !exigeContato(criterios) || perfisDosContatos(conta).includes(perfil)
}

// Perfis e experiência (formato dos actors da HarvestAPI).

export interface Pessoa {
  /** O identificador do perfil (`/in/<id>`), em minúsculas. */
  perfil: string
  /** A URL pública do perfil, sem parâmetros. */
  url: string
  nome: string
}

/** Quem é o perfil: só o identificador, a URL e o nome (nada de foto, localização ou contato). */
export function pessoaDoItem(item: unknown): Pessoa | null {
  const perfil = perfilDoLinkedin(primeiroTexto(item, 'linkedinUrl')) || texto(objeto(item).publicIdentifier).toLowerCase()
  if (!perfil) return null
  const nome = [primeiroTexto(item, 'firstName'), primeiroTexto(item, 'lastName')].filter(Boolean).join(' ') ||
    primeiroTexto(item, 'name', 'fullName')
  return { perfil, url: `https://www.linkedin.com/in/${perfil}`, nome: nome || perfil }
}

export interface EmpresaDoCargo {
  nome: string
  linkedinUrl: string
  /** O nome da página (`cvshealth`), quando o actor dá a página pelo número. */
  universalName: string
  /** O número da empresa no LinkedIn. */
  id: string
}

export interface CargoDoPerfil {
  titulo: string
  empresa: EmpresaDoCargo
  /** ISO do primeiro dia do mês de início; nulo quando o perfil não diz o mês. */
  inicio: string | null
  atual: boolean
}

const MESES: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9,
  oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
}

/**
 * O início de um cargo em ISO (primeiro dia do mês, UTC), ou nulo. Aceita `{ month: 'Jan', year: 2024 }` (experiência),
 * `{ month: 1, year: 2024 }` (`dateRange.start`) e o texto "Jan 2024". Só com o ano não dá para saber se é recente: nulo.
 */
export function inicioDoCargo(valor: unknown): string | null {
  const data = objeto(valor)
  const ano = Number(data.year)
  let mes = typeof data.month === 'number' ? data.month : MESES[normalizar(data.month).slice(0, 3)]
  let anoFinal = ano
  if (!Number.isInteger(anoFinal) || !mes) {
    const achado = normalizar(data.text ?? valor).match(/^([a-z]{3})[a-z]* (\d{4})$/)
    if (!achado) return null
    mes = MESES[achado[1]]
    anoFinal = Number(achado[2])
  }
  if (!mes || mes < 1 || mes > 12 || anoFinal < 1950) return null
  return new Date(Date.UTC(anoFinal, mes - 1, 1)).toISOString()
}

/**
 * Se o cargo começou dentro dos últimos `dias`. O LinkedIn só dá o mês, então vale o mês que cruza o período (o último
 * dia do mês de início cai nele); o mês que ainda não chegou não vale.
 */
export function comecouNoPeriodo(inicio: string, agora: number, dias: number): boolean {
  const comeco = Date.parse(inicio)
  const d = new Date(comeco)
  const fimDoMes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1
  return comeco <= agora && fimDoMes >= agora - dias * 24 * 60 * 60 * 1000
}

function empresaDe(registro: Record<string, unknown>): EmpresaDoCargo {
  return {
    nome: primeiroTexto(registro, 'companyName', 'company.name', 'companyTitle'),
    linkedinUrl: primeiroTexto(registro, 'companyLinkedinUrl', 'company.linkedinUrl', 'companyUrl'),
    universalName: primeiroTexto(registro, 'companyUniversalName', 'company.universalName'),
    id: primeiroTexto(registro, 'companyId', 'company.id'),
  }
}

// "Present" no actor em inglês; "o momento" e "atual" quando o perfil vem em português.
function cargoAtual(fim: unknown): boolean {
  if (fim === null || fim === undefined) return true
  const data = objeto(fim)
  if (/present|presente|atual|momento/i.test(texto(data.text) || texto(fim))) return true
  return !data.year && !data.month && !texto(data.text)
}

/**
 * Os cargos do perfil. Da experiência completa (`experience[]`, modo Full) quando ela vem; senão das posições atuais
 * (`currentPosition[]` com o início em `dateRange.start`, ou `currentPositions[]` com o início em `startedOn`). Numa posição atual sem título, e só
 * quando ela é a única, vale o `position` do perfil curto (suposição: é o título que a busca mostra).
 */
export function cargosDoPerfil(item: Record<string, unknown>): CargoDoPerfil[] {
  const experiencia = Array.isArray(item.experience) ? item.experience.map(objeto) : []
  if (experiencia.length) {
    return experiencia.map((e) => ({
      titulo: primeiroTexto(e, 'position', 'title', 'jobTitle'),
      empresa: empresaDe(e),
      inicio: inicioDoCargo(e.startDate) ?? inicioDoCargo(objeto(e.dateRange).start),
      atual: cargoAtual(e.endDate !== undefined ? e.endDate : objeto(e.dateRange).end),
    })).filter((c) => c.titulo)
  }
  // O perfil curto do linkedin-company-employees traz `currentPositions[]` com o início em `startedOn` (execução real de
  // 30/09/2026); a busca de perfis, `currentPosition[]` com `dateRange.start`.
  const atuais = [item.currentPosition, item.currentPositions].flatMap((lista) => Array.isArray(lista) ? lista.map(objeto) : [])
  return atuais.map((p) => ({
    titulo: primeiroTexto(p, 'position', 'title', 'jobTitle') || (atuais.length === 1 ? primeiroTexto(item, 'position') : ''),
    empresa: empresaDe(p),
    inicio: inicioDoCargo(objeto(p.dateRange).start) ?? inicioDoCargo(p.startDate) ?? inicioDoCargo(p.startedOn),
    atual: p.current !== false,
  })).filter((c) => c.titulo && c.atual)
}

const numerica = (pagina: string) => /^\d+$/.test(pagina)

/**
 * A página da empresa do cargo na mesma forma da página da Conta. O LinkedIn às vezes dá a página pelo número
 * (`/company/4680/`) e a Conta tem o nome da página (ou o contrário): aí vale o nome da página ou o número que o actor
 * também traz. Vazio quando não há como comparar.
 */
function paginaComparavel(conta: ContaParaVarrer, empresa: EmpresaDoCargo): string {
  const daConta = paginaDoLinkedin(conta.linkedinUrl)
  const pagina = paginaDoLinkedin(empresa.linkedinUrl) || empresa.universalName.toLowerCase()
  if (daConta && pagina && numerica(daConta) !== numerica(pagina)) {
    return numerica(daConta) ? empresa.id : empresa.universalName.toLowerCase()
  }
  return pagina
}

/** Se a empresa do cargo é a Conta (`mesmaEmpresa`): pela página comparável ou, sem ela, pelo nome. */
export function naConta(conta: ContaParaVarrer, empresa: EmpresaDoCargo): boolean {
  const pagina = paginaComparavel(conta, empresa)
  return mesmaEmpresa(conta, { nome: empresa.nome, linkedinUrl: pagina ? `https://www.linkedin.com/company/${pagina}` : '' })
}

/** O cargo mais recente entre os dados (o de início mais tardio); os sem data ficam de fora. */
export function maisRecente(cargos: CargoDoPerfil[]): CargoDoPerfil | null {
  const datados = cargos.filter((c) => c.inicio)
  if (!datados.length) return null
  return datados.reduce((a, b) => (Date.parse(b.inicio!) > Date.parse(a.inicio!) ? b : a))
}

/** O cargo de antes do `novo`: o de início mais tardio que começou antes dele (ou no mesmo mês, se for outro). */
export function cargoAnterior(cargos: CargoDoPerfil[], novo: CargoDoPerfil): CargoDoPerfil | null {
  return maisRecente(cargos.filter((c) => c !== novo && c.inicio && Date.parse(c.inicio) <= Date.parse(novo.inicio!)))
}

export interface CargoNaConta {
  novo: CargoDoPerfil
  anterior: CargoDoPerfil | null
  /** O cargo de antes também era na Conta (só se sabe com a experiência completa). */
  promocao: boolean
}

/**
 * O cargo atual mais recente do perfil na Conta, com o de antes dele; nulo sem cargo atual datado na Conta. Com
 * `buscaPelaConta` (o actor já filtrou quem trabalha hoje na página da Conta), a única posição atual do perfil vale
 * mesmo com outro nome quando não há página comparável que a desminta ("Acme" no LinkedIn, "Acme Logística S.A." na Conta).
 */
export function cargoAtualNaConta(item: Record<string, unknown>, conta: ContaParaVarrer, buscaPelaConta = false): CargoNaConta | null {
  const cargos = cargosDoPerfil(item)
  let novo = maisRecente(cargos.filter((c) => c.atual && naConta(conta, c.empresa)))
  const atuais = cargos.filter((c) => c.atual)
  if (!novo && buscaPelaConta && atuais.length === 1 && atuais[0].inicio && !paginaComparavel(conta, atuais[0].empresa)) {
    novo = atuais[0]
  }
  if (!novo) return null
  const anterior = cargoAnterior(cargos, novo)
  return { novo, anterior, promocao: !!anterior && naConta(conta, anterior.empresa) }
}

/** "set/2026", para a evidência. */
export function mesEAno(iso: string): string {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const d = new Date(iso)
  return `${nomes[d.getUTCMonth()]}/${d.getUTCFullYear()}`
}

/** A empresa para a chave do acontecimento: o nome sem forma jurídica, ou a página. */
export function chaveDaEmpresa(empresa: EmpresaDoCargo): string {
  return nomeDaEmpresa(empresa.nome) || paginaDoLinkedin(empresa.linkedinUrl) || empresa.universalName.toLowerCase()
}
