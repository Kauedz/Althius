// O que os dois Sinais de vaga (LinkedIn e Indeed, sinais-reais 03) dividem: o formulário "vagas" (funções,
// senioridade, localização, período e palavras), o filtro da vaga e a chave do acontecimento. A chave é a mesma nas duas
// fontes (empresa + cargo + mês do anúncio), então a vaga repetida no LinkedIn e no Indeed conta uma vez (o banco trata
// a família `vaga|` como um acontecimento só).
import type { ContaParaVarrer, SinalDoAdaptador } from '../handler.ts'
import { contemAlgum, diasDoPeriodo, dentroDoPeriodo, lista, mesDaData, nomeDaEmpresa, normalizar, recortar, sinal, texto } from './comum.ts'

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

/** A primeira forma de busca de cada função escolhida (a que vai para o actor); sem função, nenhuma. */
export function buscasDasFuncoes(criterios: Record<string, unknown>): string[] {
  return lista(criterios.funcoes).map((f) => TERMOS_DAS_FUNCOES[f]?.[0] ?? f)
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
  const funcoes = lista(criterios.funcoes)
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
    eventKey: `vaga|${nomeDaEmpresa(conta.name)}|${cargoDaVaga(vaga.titulo)}|${mesDaData(firedAt)}`,
    phrase: `Abriu vaga de ${vaga.titulo}${onde}`,
    firedAt,
    source: fonte,
    evidence: `${vaga.titulo} — ${conta.name}${onde}, publicada em ${dataCurta(firedAt)} (${fonte}). ${vaga.link}${trecho}`.trim(),
  })
}
