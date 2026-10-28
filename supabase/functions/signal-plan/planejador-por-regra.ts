// O planejador por regra: sem IA, o Briefing vira um Plano válido por palavras-chave. É o plano B de quando o motor está
// desligado (`SIGNALS_LLM_PROVIDER=regra`, o padrão), demora mais que o prazo ou devolve uma saída que não passa no
// esquema. Também aqui o Briefing é só dado: ele escolhe entre os tipos do catálogo recebido do banco e preenche os
// critérios dentro dos limites; nunca cria tipo, preço nem limite.
import {
  CAMPOS_POR_TIPO,
  type CampoDoPlano,
  chaveDoCargo,
  type Criterios,
  LIMITES_DO_PLANO,
  OPCOES,
  type PlanoDoSinal,
  tiposAceitosNoPlano,
  validarCriterios,
  validarPlano,
  VERSAO_DO_PLANO,
} from '../_shared/plano-do-sinal/index.ts'
import { explicacaoDoPlano } from './explicacao.ts'

export const AVISO_DO_PLANO_INICIAL = 'Montamos um plano inicial. Revise os critérios.'

/** Sem acento e sem caixa: o texto como as regras o leem. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Do mais específico ao mais geral. A primeira regra que casa e cujo tipo está no catálogo escolhe o tipo.
const REGRAS: readonly { tipo: string; padrao: RegExp }[] = [
  { tipo: 'anuncio_linkedin', padrao: /linkedin ads|anunci\w*[^.\n]{0,30}linkedin|linkedin[^.\n]{0,30}anunci/ },
  { tipo: 'anuncio_google', padrao: /google ads|anunci\w*[^.\n]{0,30}google/ },
  { tipo: 'vaga_indeed', padrao: /\bindeed\b/ },
  { tipo: 'nova_lideranca', padrao: /\bnov[oa]s?\s+(diretor\w*|gerente\w*|head|vp|cfo|cto|cdo|ceo|coo|cio|cmo|cro|lider\w*|lideranca\w*)|\blideranca (nova|chegando)|chegada de (um|uma)/ },
  { tipo: 'mudanca_de_emprego', padrao: /promovid\w*|promocao|promocoes|mudou de emprego/ },
  { tipo: 'anuncio_meta', padrao: /anunci\w+|instagram|facebook|\bmeta\b(?! de)/ },
  { tipo: 'avaliacoes_google_maps', padrao: /avalia\w+|reclama\w+|google maps|estrelas?|nota baixa/ },
  { tipo: 'vaga_linkedin', padrao: /\bvagas?\b|contratando|contrata\w*|recrutando|hiring|processo seletivo/ },
  { tipo: 'nova_lideranca', padrao: /diretor\w*|gerente\w*|\bhead\b|lideranca|\bvp\b|\bc[a-z]o\b/ },
]

/** O tipo que o Briefing pede, entre os aceitos; sem palavra-chave, a Abertura de vagas ou, na falta dela, o primeiro. */
export function tipoPorRegra(briefing: string, aceitos: readonly string[]): string | null {
  const texto = normalizar(briefing)
  for (const regra of REGRAS) {
    if (aceitos.includes(regra.tipo) && regra.padrao.test(texto)) return regra.tipo
  }
  if (aceitos.includes('vaga_linkedin')) return 'vaga_linkedin'
  return aceitos[0] ?? null
}

// Cargos.

const ARTIGOS = /^(?:(?:um|uma|o|a|os|as|novo|nova|novos|novas|de|do|da|dos|das|para|como)\s+)+/i
const PARADAS = /\s+(?:em|no|na|nos|nas|que|para|pra|com|dos|das|nesta|neste|nas|ate|até|desde|nos ultimos|nos últimos|quando|onde|ou seja)\s+|[.;:!?\n]/i

const APELIDOS_DE_FUNCAO: readonly { padrao: RegExp; funcao: string }[] = [
  { padrao: /^(revops|revenue operations|sales ops\w*|operacoes de vendas)$/, funcao: 'RevOps e GTM' },
  { padrao: /^(gtm|go to market)$/, funcao: 'RevOps e GTM' },
  { padrao: /^(engenharia de dados|engenheir[oa] de dados|data engineer\w*)$/, funcao: 'Engenharia de dados' },
  { padrao: /^(ia|machine learning|inteligencia artificial|ml|mlops)$/, funcao: 'IA e machine learning' },
  { padrao: /^(financas|financeiro|financeira)$/, funcao: 'Finanças' },
  { padrao: /^(rh|recursos humanos)$/, funcao: 'Recursos humanos' },
]

function limparCargo(bruto: string): string {
  return bruto.replace(/\s+/g, ' ').replace(ARTIGOS, '').replace(/[“”"'`]/g, '').trim()
}

function unicos(cargos: string[]): string[] {
  const vistos = new Set<string>()
  return cargos.filter((c) => {
    const chave = chaveDoCargo(c)
    if (!chave || vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}

/** Os cargos que o Briefing cita: entre aspas ou depois de "vaga de" / "cargo de" (separados por vírgula, "e" ou "ou"). */
export function cargosDoBriefing(briefing: string): string[] {
  const achados: string[] = []
  for (const m of briefing.matchAll(/[“"]([^”"\n]{1,60})[”"]/g)) achados.push(limparCargo(m[1]))
  if (!achados.length) {
    for (const m of briefing.matchAll(/(?:vagas?|cargos?|posi[cç][aãoõ]\w*)\s+(?:de|para|como)\s+([^.;:\n]+)/gi)) {
      const trecho = m[1].split(PARADAS)[0]
      for (const parte of trecho.split(/\s*,\s*|\s+ou\s+|\s+e\s+/i)) achados.push(limparCargo(parte))
    }
  }
  const cargos = unicos(achados.filter((c) => c.length > 0 && c.length <= LIMITES_DO_PLANO.textoCustomMax))
  return cargos.slice(0, LIMITES_DO_PLANO.cargosCustomMax)
}

function comoFuncao(cargo: string): string {
  const chave = chaveDoCargo(cargo)
  return APELIDOS_DE_FUNCAO.find((a) => a.padrao.test(chave))?.funcao ?? cargo
}

const PALAVRAS_QUE_ENCERRAM_O_CARGO = new Set([
  'ou', 'e', 'que', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'com', 'ate', 'chegar', 'chegou', 'chegam', 'entrar', 'entrou',
  'nas', 'dos', 'das', 'quando', 'onde',
])

/** Os cargos de liderança citados por sigla ou por "diretor de X" quando o Briefing não os põe entre aspas. */
function cargosDeLideranca(briefing: string): string[] {
  const achados = [...briefing.matchAll(/\b(CDO|CTO|CFO|CEO|COO|CIO|CMO|CRO)\b/g)].map((m) => m[1])
  for (const m of briefing.matchAll(/\b(?:diretor|diretora|gerente|head|vp)(?:\s+[\p{L}]+){0,3}/giu)) {
    const palavras = m[0].split(/\s+/)
    const corte = palavras.findIndex((p, i) => i > 0 && PALAVRAS_QUE_ENCERRAM_O_CARGO.has(normalizar(p)) && !['de', 'of'].includes(normalizar(p)))
    const cargo = limparCargo((corte > 0 ? palavras.slice(0, corte) : palavras).join(' '))
    if (cargo) achados.push(cargo)
  }
  return unicos(achados.filter((c) => c.length <= LIMITES_DO_PLANO.textoCustomMax)).slice(0, LIMITES_DO_PLANO.cargosCustomMax)
}

// Período e lugar.

function periodoDoBriefing(briefing: string): string {
  const texto = normalizar(briefing)
  const dias = texto.match(/(?:ultimos|ultimas|nos proximos|em)\s+(\d{1,3})\s+dias/)
  let n = dias ? Number(dias[1]) : /(semana)/.test(texto) ? 7 : /(trimestre|3 meses|tres meses)/.test(texto) ? 90 : 30
  if (/quinzena/.test(texto)) n = 14
  const alvo = n <= 7 ? 7 : n <= 14 ? 14 : n <= 30 ? 30 : 90
  return `Últimos ${alvo} dias`
}

function paisesDoBriefing(briefing: string): string[] {
  const texto = normalizar(briefing)
  const achados = OPCOES.localizacao.filter((pais) => {
    const chave = normalizar(pais)
    return pais === 'Estados Unidos' ? /estados unidos|\beua\b|\busa\b/.test(texto) : new RegExp(`\\b${chave}\\b`).test(texto)
  })
  return achados.length ? achados : ['Brasil']
}

// Critérios por tipo, só com os campos que o tipo lê.

function criteriosPorRegra(tipo: string, briefing: string): Criterios {
  const campos = CAMPOS_POR_TIPO[tipo] ?? []
  const texto = normalizar(briefing)
  const quer = (campo: CampoDoPlano) => campos.includes(campo)
  const criterios: Criterios = {}
  const citados = cargosDoBriefing(briefing)

  if (quer('funcoes') && citados.length) criterios.funcoes = unicos(citados.map(comoFuncao))
  if (quer('cargos')) {
    const cargos = citados.length ? citados : cargosDeLideranca(briefing)
    if (cargos.length) criterios.cargos = cargos
  }
  if (quer('senioridade')) {
    criterios.senioridade = /lideranca|\bhead\b|diretor|gerente|coordenador|\bvp\b|c-level/.test(texto) ? 'Liderança' : 'Qualquer'
  }
  if (quer('movimento')) {
    criterios.movimento = tipo === 'mudanca_de_emprego' ? ['Promoção'] : /promovid|promocao/.test(texto) ? ['Chegada', 'Promoção'] : ['Chegada']
  }
  if (quer('pessoas')) criterios.pessoas = 'Qualquer pessoa no cargo'
  if (quer('nota')) criterios.nota = 'Até 2 estrelas'
  if (quer('localizacao')) criterios.localizacao = paisesDoBriefing(briefing)
  if (quer('periodo')) criterios.periodo = periodoDoBriefing(briefing)
  return criterios
}

/** Os critérios que passam no esquema: se algum campo não passar, ele sai, e os outros ficam. */
function criteriosValidos(tipo: string, criterios: Criterios): Criterios {
  const limpos: Criterios = {}
  for (const [campo, valor] of Object.entries(criterios)) {
    if (validarCriterios(tipo, { [campo]: valor }).ok) limpos[campo] = valor
  }
  return limpos
}

export interface PedidoDoPlano {
  briefing: string
  contaIds: string[]
  escopo?: 'contas' | 'mercado'
  /** Os tipos que o banco diz que estão disponíveis (já cruzados com os campos conhecidos). */
  tiposAceitos: readonly string[]
}

/** O Plano por regra, ou `null` quando nenhum tipo está disponível. */
export function planoPorRegra(pedido: PedidoDoPlano): PlanoDoSinal | null {
  const aceitos = tiposAceitosNoPlano(pedido.tiposAceitos)
  const tipo = tipoPorRegra(pedido.briefing, aceitos)
  if (!tipo) return null
  const criterios = criteriosValidos(tipo, criteriosPorRegra(tipo, pedido.briefing))
  const resultado = validarPlano({
    versao: VERSAO_DO_PLANO,
    origem: 'briefing',
    escopo: pedido.escopo === 'mercado' ? { tipo: 'mercado' } : { tipo: 'contas', contaIds: pedido.contaIds },
    sinais: [{ tipo, criterios }],
    explicacao: explicacaoDoPlano(tipo, criterios, pedido.escopo === 'mercado' ? 'mercado' : pedido.contaIds.length),
    maxEmpresasPorRodada: LIMITES_DO_PLANO.empresasPorRodadaPadrao,
  }, aceitos)
  return resultado.ok ? resultado.plano : null
}
