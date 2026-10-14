// O encaixe de uma empresa candidata no ICP, por critério e sem IA: setor, região, porte e tecnologias, nesta ordem de
// peso. Cada critério que a pessoa escolheu vira um motivo ("Setor: combina com Software"); o que a fonte não informou
// fica "sem dado" e não conta nem a favor nem contra. O número só ordena a lista (ADR-0006: a tela mostra o nível e os
// motivos, nunca a nota). Um termo da lista "excluir" tira a empresa da busca. Nada aqui fala com a rede.
import { contemAlgum, normalizar } from '../signal-runner/adaptadores/comum.ts'
import { type CriteriosDeBusca, FAIXAS_DE_PORTE, PORTES_LEGAIS } from './criterios.ts'
import { CAPITAIS, ehBrasil, ufDe } from './regioes.ts'

/** Uma empresa como a fonte a descreveu, já numa forma só (cada Actor tem o seu normalizador). */
export interface CandidataBruta {
  name: string
  website?: string
  linkedinUrl?: string
  cnpj?: string
  location?: string
  uf?: string
  city?: string
  country?: string
  sector?: string
  sizeLabel?: string
  employeeCount?: number
  description?: string
  /** Especialidades ou tecnologias que a fonte listou. */
  tags: string[]
  sourceRef?: string
  sourceActor: string
  sourceRunId?: string
  /** Indícios de Sinal que a própria fonte trouxe (ex.: empresa aberta há pouco). */
  signals: { texto: string; fonte: string; data?: string }[]
  /** Os outros locais da empresa (unidades), só para conferir a região; não são guardados. */
  outrosLocais?: string[]
}

export type CriterioAvaliado = 'setor' | 'regiao' | 'porte' | 'tecnologia' | 'excluir'

export interface Motivo {
  criterio: CriterioAvaliado
  /** Verdadeiro bate, falso não bate, nulo a fonte não informou. */
  atende: boolean | null
  texto: string
}

export type NivelDeEncaixe = 'alto' | 'medio' | 'baixo' | 'sem_dado'

export interface Avaliacao {
  score: number
  level: NivelDeEncaixe
  reasons: Motivo[]
  /** Um termo de "excluir" apareceu: a empresa não entra na Caixa. */
  excluida: boolean
}

const PESOS: Record<'setor' | 'regiao' | 'porte' | 'tecnologia', number> = { setor: 35, regiao: 25, porte: 25, tecnologia: 15 }

function junta(...partes: (string | string[] | undefined)[]): string {
  return partes.flatMap((p) => (Array.isArray(p) ? p : [p ?? ''])).filter(Boolean).join(' | ')
}

function primeiroQueBate(texto: string, termos: string[]): string | undefined {
  return termos.find((t) => contemAlgum(texto, [t]))
}

function lista(termos: string[]): string {
  return termos.slice(0, 3).join(', ')
}

function avaliarSetor(c: CandidataBruta, criterios: CriteriosDeBusca): Motivo | null {
  const termos = [...criterios.setores, ...criterios.palavrasChave]
  if (!termos.length) return null
  const texto = junta(c.sector, c.tags, c.description)
  if (!c.sector && !c.description && !c.tags.length) {
    return { criterio: 'setor', atende: null, texto: 'Setor: a fonte não informou a atividade da empresa.' }
  }
  const achado = primeiroQueBate(texto, termos)
  return achado
    ? { criterio: 'setor', atende: true, texto: `Setor: combina com "${achado}".` }
    : { criterio: 'setor', atende: false, texto: `Setor: nada na descrição lembra ${lista(termos)}.` }
}

function bucketsQueCobrem(c: CandidataBruta): { min: number; max: number } | null {
  if (typeof c.employeeCount === 'number' && c.employeeCount >= 0) return { min: c.employeeCount, max: c.employeeCount }
  const faixa = FAIXAS_DE_PORTE.find((f) => f.rotulo === c.sizeLabel?.replace(/\s*(funcion[aá]rios|employees)\s*$/i, '').trim())
  return faixa ? { min: faixa.min, max: faixa.max } : null
}

function avaliarPorte(c: CandidataBruta, criterios: CriteriosDeBusca): Motivo | null {
  if (!criterios.portes.length) return null
  const legais = criterios.portes.filter((p) => (PORTES_LEGAIS as readonly string[]).includes(p))
  const faixas = FAIXAS_DE_PORTE.filter((f) => criterios.portes.includes(f.rotulo))
  const legal = c.sizeLabel?.trim().toUpperCase()
  if (legal && (PORTES_LEGAIS as readonly string[]).includes(legal)) {
    if (legais.length) {
      return legais.includes(legal)
        ? { criterio: 'porte', atende: true, texto: `Porte: ${legal}, como no ICP.` }
        : { criterio: 'porte', atende: false, texto: `Porte: ${legal}, fora de ${lista(legais)}.` }
    }
    return { criterio: 'porte', atende: null, texto: `Porte: o cadastro diz ${legal}, sem número de funcionários.` }
  }
  const alcance = bucketsQueCobrem(c)
  if (!alcance || !faixas.length) {
    return { criterio: 'porte', atende: null, texto: 'Porte: a fonte não informou o número de funcionários.' }
  }
  const dentro = faixas.some((f) => alcance.max >= f.min && alcance.min <= f.max)
  const mostrado = typeof c.employeeCount === 'number' ? `${c.employeeCount.toLocaleString('pt-BR')} funcionários` : `${c.sizeLabel} funcionários`
  return dentro
    ? { criterio: 'porte', atende: true, texto: `Porte: ${mostrado}, dentro do ICP.` }
    : { criterio: 'porte', atende: false, texto: `Porte: ${mostrado}, fora de ${lista(faixas.map((f) => f.rotulo))}.` }
}

function regiaoBate(regiao: string, c: CandidataBruta, textos: string): boolean {
  if (ehBrasil(regiao)) return ehBrasil(c.country) || /\b(brasil|brazil)\b/.test(normalizar(textos)) || !!c.uf
  const uf = ufDe(regiao)
  if (uf) {
    if (c.uf === uf || ufDe(textos) === uf) return true
    for (const [capital, estadoUf] of Object.entries(CAPITAIS)) {
      if (estadoUf === uf && contemAlgum(textos, [capital])) return true
    }
    return false
  }
  return contemAlgum(textos, [regiao])
}

function avaliarRegiao(c: CandidataBruta, criterios: CriteriosDeBusca): Motivo | null {
  if (!criterios.regioes.length) return null
  const sede = junta(c.city, c.uf, c.country, c.location)
  const outras = c.outrosLocais ?? []
  if (!sede && !outras.length) {
    return { criterio: 'regiao', atende: null, texto: 'Região: a fonte não informou onde fica a empresa.' }
  }
  const naSede = criterios.regioes.find((r) => regiaoBate(r, c, sede))
  if (naSede) return { criterio: 'regiao', atende: true, texto: `Região: sede em ${naSede}.` }
  const emOutra = criterios.regioes.find((r) => outras.some((o) => regiaoBate(r, { ...c, uf: undefined, country: undefined }, o)))
  if (emOutra) return { criterio: 'regiao', atende: true, texto: `Região: tem unidade em ${emOutra}.` }
  return { criterio: 'regiao', atende: false, texto: `Região: fica fora de ${lista(criterios.regioes)}.` }
}

function avaliarTecnologia(c: CandidataBruta, criterios: CriteriosDeBusca): Motivo | null {
  if (!criterios.tecnologias.length) return null
  const texto = junta(c.tags, c.description, c.sector)
  if (!texto) return { criterio: 'tecnologia', atende: null, texto: 'Tecnologias: a fonte não informou.' }
  const achado = primeiroQueBate(texto, criterios.tecnologias)
  return achado
    ? { criterio: 'tecnologia', atende: true, texto: `Tecnologias: cita "${achado}".` }
    : { criterio: 'tecnologia', atende: false, texto: `Tecnologias: não cita ${lista(criterios.tecnologias)}.` }
}

export function avaliar(c: CandidataBruta, criterios: CriteriosDeBusca): Avaliacao {
  const proibido = criterios.excluir.length ? primeiroQueBate(junta(c.name, c.sector, c.tags, c.description), criterios.excluir) : undefined
  if (proibido) {
    return {
      score: 0,
      level: 'baixo',
      reasons: [{ criterio: 'excluir', atende: false, texto: `Tem o termo que o ICP exclui: "${proibido}".` }],
      excluida: true,
    }
  }
  const motivos = [
    avaliarSetor(c, criterios),
    avaliarRegiao(c, criterios),
    avaliarPorte(c, criterios),
    avaliarTecnologia(c, criterios),
  ].filter((m): m is Motivo => m !== null)

  const conhecidos = motivos.filter((m) => m.atende !== null)
  if (!conhecidos.length) return { score: 0, level: 'sem_dado', reasons: motivos, excluida: false }
  const peso = (m: Motivo) => PESOS[m.criterio as keyof typeof PESOS]
  const total = conhecidos.reduce((soma, m) => soma + peso(m), 0)
  const batidos = conhecidos.filter((m) => m.atende).reduce((soma, m) => soma + peso(m), 0)
  const score = Math.round((100 * batidos) / total)
  return { score, level: score >= 75 ? 'alto' : score >= 45 ? 'medio' : 'baixo', reasons: motivos, excluida: false }
}

// ---------------------------------------------------------------------------------------------------------------------
// A nota final: Encaixe ICP mais o peso dos Sinais
//
// Uma candidata da Caixa de Descobertas tem o Encaixe ICP (acima, de 0 a 100) e, quando veio de um Sinal, os Sinais que a
// trouxeram. A nota final é o Encaixe mais o peso dos Sinais, e só ela ordena a lista. O número nunca aparece (ADR-0006):
// a tela mostra o nível (alto, médio, baixo). Quem calcula na leitura é o banco (`private.discovery_note` e
// `private.discovery_level`, migração 20261018130000), porque o decaimento depende da data de hoje; este arquivo tem a
// mesma regra com os mesmos números, é de onde vêm os pesos que o banco guarda em cada motivo, e um teste de cada lado
// confere os dois.

/** Quantos dias depois do disparo um Sinal ainda pesa por inteiro. */
export const DIAS_DE_PESO_CHEIO = 30
/** Em quantos dias o peso de um Sinal chega a zero (cai em linha reta dos 30 aos 90). */
export const DIAS_ATE_ZERO = 90
/** Quanto os Sinais, juntos, podem somar na nota: muitos Sinais não passam o Encaixe ICP. */
export const TETO_DOS_SINAIS = 60
/** Os cortes do nível, na nota final. Abaixo do médio é baixo. */
export const CORTE_ALTO = 75
export const CORTE_MEDIO = 45

/**
 * O peso cheio de um Sinal, pelo tipo. Três faixas, pela força do que o acontecimento diz sobre comprar agora:
 *   - forte (40): o negócio da empresa mudou ou vai mudar de tamanho (expansão, investimento, financiamento, filial,
 *     planta, centro de distribuição, sede, escritório, CNPJ novo, importação, licença, mudança de porte);
 *   - médio (30): contratação e movimento de mercado que aumentam a chance de compra (vagas, equipes, liderança,
 *     movimentação de pessoas, sócio, anúncios, volume de comércio exterior, mudança regulatória, safra);
 *   - contexto (15): fatos que situam a empresa mas pouco dizem sobre o momento (apólice, contrato de energia, CAGED,
 *     processos, avaliações, ESG, registros, área rural).
 * Um tipo que não está aqui pesa `PESO_PADRAO_DO_SINAL`. O banco recebe o peso de quem grava o Sinal, então mudar um
 * número aqui vale para os Sinais novos; os que já foram gravados guardam o peso da época.
 */
export const PESO_DO_SINAL: Readonly<Record<string, number>> = {
  // forte
  cnpj_novo: 40,
  cruzando_faixa_de_headcount: 40,
  expansao_de_planta: 40,
  expansao_geografica: 40,
  financiamento_bndes_finep: 40,
  frota_crescendo: 40,
  habilitacao_radar: 40,
  importacao_de_maquinas: 40,
  investimentos_anunciados: 40,
  licenca_instalacao: 40,
  licenca_instalacao_dou: 40,
  mudanca_de_porte_ou_regime: 40,
  nova_cooperativa: 40,
  nova_filial_icp_g: 40,
  nova_planta_filial: 40,
  novo_cd_ou_filial: 40,
  novo_escritorio: 40,
  novo_importador: 40,
  troca_de_sede: 40,
  // médio
  anuncio_de_movimentacao: 30,
  anuncio_linkedin: 30,
  anuncio_meta: 30,
  calendario_de_safra: 30,
  cpr_registrada: 30,
  crescimento_comex_embarcador: 30,
  crescimento_de_equipes: 30,
  entrada_de_socio: 30,
  impacto_reforma_cnae: 30,
  liberacao_plano_safra: 30,
  mudanca_de_emprego: 30,
  mudanca_regulatoria: 30,
  ncm_nova_na_pauta: 30,
  nova_lideranca: 30,
  setor_afetado_cbs_ibs: 30,
  vaga_comex: 30,
  vaga_engenharia_manutencao: 30,
  vaga_indeed: 30,
  vaga_linkedin: 30,
  vaga_logistica: 30,
  volume_por_porto: 30,
  // contexto
  area_no_car: 15,
  avaliacoes_google_maps: 15,
  caged_por_empresa: 15,
  cnae_eletrointensivo: 15,
  entradas_e_saidas: 15,
  grupo_a_cativo: 15,
  meta_esg_publicada: 15,
  processos_jusbrasil_datajud: 15,
  processos_publicos: 15,
  recuperacao_judicial: 15,
  registros_empresariais: 15,
  renovacao_de_apolice: 15,
  vencimento_contrato_energia: 15,
}

export const PESO_PADRAO_DO_SINAL = 20

export function pesoDoSinal(tipo: string): number {
  return PESO_DO_SINAL[tipo] ?? PESO_PADRAO_DO_SINAL
}

/** A fração do peso que um Sinal ainda tem, `dias` depois do disparo: 1 até 30 dias, 0 a partir de 90, linear entre os dois. */
export function decaimentoDoSinal(dias: number): number {
  if (dias <= DIAS_DE_PESO_CHEIO) return 1
  if (dias >= DIAS_ATE_ZERO) return 0
  return (DIAS_ATE_ZERO - dias) / (DIAS_ATE_ZERO - DIAS_DE_PESO_CHEIO)
}

const MS_POR_DIA = 86_400_000

export interface SinalParaNota {
  /** O peso cheio gravado no motivo; sem ele, o do tipo. */
  peso?: number
  tipo: string
  /** ISO 8601 do disparo. */
  disparadoEm: string
}

/** A nota final: o Encaixe ICP (0 a 100) mais os Sinais com decaimento, que somam no máximo `TETO_DOS_SINAIS`. */
export function notaFinal(encaixeIcp: number, sinais: SinalParaNota[], agora: number): number {
  const soma = sinais.reduce((acc, s) => {
    const dias = (agora - Date.parse(s.disparadoEm)) / MS_POR_DIA
    return acc + (s.peso ?? pesoDoSinal(s.tipo)) * decaimentoDoSinal(dias)
  }, 0)
  return encaixeIcp + Math.min(TETO_DOS_SINAIS, soma)
}

/**
 * O nível que a tela mostra. `encaixeAvaliado` diz se a busca avaliou a empresa no ICP: uma empresa avaliada que ficou
 * fora do ICP é "baixo" mesmo com nota zero; uma que ninguém avaliou e não tem Sinal vigente fica "sem dado".
 */
export function nivelDaNota(nota: number, encaixeAvaliado: boolean): NivelDeEncaixe {
  if (nota >= CORTE_ALTO) return 'alto'
  if (nota >= CORTE_MEDIO) return 'medio'
  return nota > 0 || encaixeAvaliado ? 'baixo' : 'sem_dado'
}

/**
 * A ordem da lista: a maior nota primeiro e, no empate, o Sinal mais recente. `ultimoSinalEm` é o disparo mais recente
 * entre os Sinais da candidata (ISO 8601), ou nulo.
 */
export function compararCandidatas(
  a: { nota: number; ultimoSinalEm: string | null },
  b: { nota: number; ultimoSinalEm: string | null },
): number {
  if (a.nota !== b.nota) return b.nota - a.nota
  const ta = a.ultimoSinalEm ? Date.parse(a.ultimoSinalEm) : Number.NEGATIVE_INFINITY
  const tb = b.ultimoSinalEm ? Date.parse(b.ultimoSinalEm) : Number.NEGATIVE_INFINITY
  return tb - ta
}
