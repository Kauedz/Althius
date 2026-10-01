// O encaixe de uma empresa candidata no ICP, por critério e sem IA: setor, região, porte e tecnologias, nesta ordem de
// peso. Cada critério que a pessoa escolheu vira um motivo ("Setor: combina com Software"); o que a fonte não informou
// fica "sem dado" e não conta nem a favor nem contra. O número só ordena a lista (ADR-0006: a tela mostra o nível e os
// motivos, nunca a nota). Um termo da lista "excluir" tira a empresa da busca. Nada aqui fala com a rede.
import { contemAlgum, normalizar } from '../signal-runner/adaptadores/comum.ts'
import { type CriteriosDeBusca, FAIXAS_DE_PORTE, PORTES_LEGAIS } from './criterios.ts'
import { ehBrasil, ufDe } from './regioes.ts'

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
  const texto = junta(c.sector, c.tags, c.description, c.name)
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
  if (uf) return c.uf === uf || ufDe(textos) === uf
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
