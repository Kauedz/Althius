// O que os dois Sinais de vaga (LinkedIn e Indeed, sinais-reais 03) dividem: o formulário "vagas" (funções,
// senioridade, localização, período e palavras), o filtro da vaga e a chave do acontecimento. A chave é a mesma nas duas
// fontes (empresa + cargo + ano do anúncio), então a vaga repetida no LinkedIn e no Indeed conta uma vez (o banco trata
// a família `vaga|` como um acontecimento só). É o ano, não o mês: na execução real de 30/09/2026, o LinkedIn datou em
// setembro vagas que o Indeed datou em julho e agosto; o mesmo cargo reaberto no ano seguinte volta a contar.
import type { ContaParaVarrer, ContextoDoAdaptador, SinalDoAdaptador } from '../handler.ts'
import {
  contemAlgum, diasDoPeriodo, dentroDoPeriodo, lista, nomeDaEmpresa, normalizar, objeto, objetos, primeiroTexto, recortar, sinal, texto,
} from './comum.ts'

/** Os termos de busca de cada opção de "Cargos ou funções", em português e em inglês. */
export const TERMOS_DAS_FUNCOES: Readonly<Record<string, string[]>> = {
  'Engenharia de dados': ['engenheiro de dados', 'engenheira de dados', 'engenharia de dados', 'data engineer', 'data engineering', 'analytics engineer'],
  'IA e machine learning': ['machine learning', 'aprendizado de maquina', 'inteligencia artificial', 'ia', 'ai', 'ml', 'mlops', 'cientista de dados', 'data scientist', 'llm'],
  'Plataforma e infraestrutura': ['infraestrutura', 'plataforma', 'devops', 'sre', 'site reliability', 'cloud', 'platform engineer', 'infrastructure'],
  'RevOps e GTM': ['revops', 'revenue operations', 'sales operations', 'sales ops', 'operacoes de vendas', 'operacoes comerciais', 'gtm', 'go to market'],
  'Finanças': ['financeiro', 'financeira', 'financas', 'finance', 'controller', 'controladoria', 'contabil', 'tesouraria', 'fp a', 'cfo'],
  'Recursos humanos': ['recursos humanos', 'rh', 'people', 'gente e gestao', 'talent acquisition', 'recrutamento', 'hr', 'departamento pessoal'],
}

const TERMOS_DA_SENIORIDADE: Readonly<Record<string, string[]>> = {
  'Liderança': [
    'head', 'diretor', 'diretora', 'director', 'gerente', 'manager', 'coordenador', 'coordenadora', 'lider', 'lead', 'vp',
    'vice presidente', 'chief', 'superintendente', 'socio', 'partner', 'ceo', 'cto', 'cfo', 'cdo', 'coo', 'cio', 'cmo', 'cro',
  ],
  'Especialista': ['especialista', 'specialist', 'staff', 'principal', 'expert'],
  'Pleno e sênior': ['pleno', 'senior', 'mid', 'ii', 'iii'],
}

// Como o LinkedIn escreve o nível da vaga (`seniorityLevel`), para as senioridades que ele distingue.
const NIVEIS_DO_LINKEDIN: Readonly<Record<string, string[]>> = {
  'Liderança': ['director', 'executive'],
  'Pleno e sênior': ['mid senior level'],
}

/** O maior texto de um nicho ou cargo escrito pelo usuário (Custom), o mesmo limite da tela. */
export const MAX_TEXTO_CUSTOM = 60
/** Quantos cargos escritos pelo usuário (Custom) um Monitoramento usa, o mesmo limite da tela. */
export const MAX_CARGOS_CUSTOM = 10

/**
 * As funções do Monitoramento, sem repetidas. Um cargo escrito pelo usuário (Custom, ex.: "SDR") vem na mesma lista que
 * as opções prontas e é buscado e comparado exatamente como foi escrito.
 */
export function funcoesDoMonitoramento(criterios: Record<string, unknown>): string[] {
  const vistas = new Set<string>()
  const saida: string[] = []
  for (const f of lista(criterios.funcoes)) {
    const funcao = f.slice(0, MAX_TEXTO_CUSTOM).trim()
    const chave = normalizar(funcao)
    if (!chave || vistas.has(chave)) continue
    vistas.add(chave)
    saida.push(funcao)
  }
  // As opções prontas não contam no limite; os cargos escritos, até MAX_CARGOS_CUSTOM.
  let custom = 0
  return saida.filter((f) => TERMOS_DAS_FUNCOES[f] || ++custom <= MAX_CARGOS_CUSTOM)
}

/** A primeira forma de busca de cada função escolhida (a que vai para o actor); sem função, nenhuma. */
export function buscasDasFuncoes(criterios: Record<string, unknown>): string[] {
  return funcoesDoMonitoramento(criterios).map((f) => TERMOS_DAS_FUNCOES[f]?.[0] ?? f)
}

/** O nicho escrito pelo usuário (Custom, ex.: "Naval", "Óleo e gás"); vazio em "Qualquer" e nos nichos prontos. */
export function nichoCustom(criterios: Record<string, unknown>): string {
  return texto(criterios.nicho) === 'custom' ? texto(criterios.nichoCustom).slice(0, MAX_TEXTO_CUSTOM).trim() : ''
}

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o', 'as', 'os', 'no', 'na'])

/** Os termos do nicho para a regra sem modelo: o nicho inteiro e cada palavra dele com 3 letras ou mais. */
export function termosDoNicho(nicho: string): string[] {
  const inteiro = normalizar(nicho)
  if (!inteiro) return []
  const palavras = inteiro.split(' ').filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
  return [...new Set([inteiro, ...palavras])]
}

/** A regra sem modelo: a vaga é do nicho quando o cargo ou a descrição citam o nicho. */
export function vagaDoNichoPelaRegra(vaga: Vaga, nicho: string): boolean {
  return contemAlgum(`${vaga.titulo} ${vaga.descricao}`, termosDoNicho(nicho))
}

const SISTEMA_DO_NICHO = [
  'Você avalia vagas de emprego para uma equipe de vendas B2B que prospecta empresas de um nicho.',
  'A primeira linha traz o nicho escolhido; as outras, uma vaga cada, com id, cargo e descrição.',
  'Para cada vaga, diga se ela é do nicho: o cargo, a área ou a descrição da vaga e da empresa mostram atuação nele.',
  'Na dúvida, responda false. Responda só JSON: {"vagas":[{"id":"<id>","do_nicho":true}]}',
].join(' ')

/** As respostas do modelo, por id; a vaga que ele não respondeu, ou respondeu sem booleano, cai na regra. */
export function lerRespostaDoNicho(json: unknown): Map<string, boolean> {
  const r = new Map<string, boolean>()
  const vagas = objeto(json).vagas
  for (const v of objetos(Array.isArray(vagas) ? vagas : [])) {
    const id = primeiroTexto(v, 'id')
    if (id && typeof v.do_nicho === 'boolean') r.set(id, v.do_nicho)
  }
  return r
}

/**
 * Só as vagas do nicho escrito pelo usuário (Custom). Sem nicho Custom, todas passam. Com o modelo dos Sinais (o Hermes,
 * pelo mesmo caminho das publicações), ele decide; sem modelo, quando ele falha ou não responde uma vaga, vale a regra.
 */
export async function vagasDoNicho(vagas: Vaga[], criterios: Record<string, unknown>, ctx?: ContextoDoAdaptador): Promise<Vaga[]> {
  const nicho = nichoCustom(criterios)
  if (!nicho || !vagas.length) return vagas
  let doModelo = new Map<string, boolean>()
  if (ctx?.llm) {
    try {
      const usuario = [
        JSON.stringify({ nicho }),
        ...vagas.map((v, i) => JSON.stringify({ id: String(i), cargo: v.titulo, descricao: recortar(v.descricao, 800) })),
      ].join('\n')
      const { json, custoUsd } = await ctx.llm.json({ sistema: SISTEMA_DO_NICHO, usuario, maxTokens: 400 })
      ctx.custo.adicionar(custoUsd, vagas.length)
      doModelo = lerRespostaDoNicho(json)
    } catch {
      // O modelo falhou: a regra decide.
    }
  }
  return vagas.filter((v, i) => doModelo.get(String(i)) ?? vagaDoNichoPelaRegra(v, nicho))
}

/** O cargo para comparação: sem marca de gênero ("Engenheiro(a)") e com as abreviações por extenso. */
export function cargoDaVaga(titulo: string): string {
  const partes = normalizar(titulo).split(' ')
  const saida: string[] = []
  for (const p of partes) {
    if ((p === 'a' || p === 'as') && /os?$/.test(saida[saida.length - 1] ?? '')) continue
    saida.push(p === 'sr' ? 'senior' : p === 'pl' ? 'pleno' : p === 'jr' ? 'junior' : p)
  }
  return saida.join(' ')
}

export interface Vaga {
  titulo: string
  local: string
  descricao: string
  /** O nível que a fonte informa (o LinkedIn tem; o Indeed às vezes, nos atributos). */
  nivel: string
  link: string
  /** ISO 8601 da publicação; nulo quando a fonte não traz. */
  publicadaEm: string | null
}

/** Se a vaga passa pelos critérios do Monitoramento: função, senioridade, palavras e período. */
export function vagaAtende(vaga: Vaga, criterios: Record<string, unknown>, agora: number): boolean {
  const cargo = cargoDaVaga(vaga.titulo)
  const funcoes = funcoesDoMonitoramento(criterios)
  if (funcoes.length && !funcoes.some((f) => contemAlgum(cargo, TERMOS_DAS_FUNCOES[f] ?? [f]))) return false
  const senioridade = texto(criterios.senioridade)
  const termos = TERMOS_DA_SENIORIDADE[senioridade]
  if (termos && !contemAlgum(cargo, termos) && !(NIVEIS_DO_LINKEDIN[senioridade] ?? []).includes(normalizar(vaga.nivel))) {
    return false
  }
  const palavras = lista(criterios.palavras)
  if (palavras.length && !contemAlgum(`${vaga.titulo} ${vaga.descricao}`, palavras)) return false
  return !vaga.publicadaEm || dentroDoPeriodo(vaga.publicadaEm, agora, diasDoPeriodo(criterios))
}

function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/** O Sinal de uma vaga da Conta. Sem data de publicação, vale a da varredura (a busca já filtrou pelo período). */
export function sinalDaVaga(vaga: Vaga, conta: ContaParaVarrer, fonte: string, agora: number): SinalDoAdaptador {
  const firedAt = vaga.publicadaEm ?? new Date(agora).toISOString()
  const onde = vaga.local ? ` em ${vaga.local}` : ''
  const trecho = vaga.descricao ? ` ${recortar(vaga.descricao, 400)}` : ''
  return sinal({
    eventKey: `vaga|${nomeDaEmpresa(conta.name)}|${cargoDaVaga(vaga.titulo)}|${firedAt.slice(0, 4)}`,
    phrase: `Abriu vaga de ${vaga.titulo}${onde}`,
    firedAt,
    source: fonte,
    evidence: `${vaga.titulo} — ${conta.name}${onde}, publicada em ${dataCurta(firedAt)} (${fonte}). ${vaga.link}${trecho}`.trim(),
  })
}
