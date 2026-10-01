// Dos filtros da busca à entrada de cada Actor. Os nomes dos campos são os do esquema de entrada do build mais recente de
// cada Actor (API pública do Apify, 01/10/2026); nenhum campo é inventado. Nada aqui fala com a rede.
import { type CriteriosDeBusca, FAIXAS_DE_PORTE } from './criterios.ts'
import { ACTOR_LINKEDIN_EMPRESAS, ACTOR_RECEITA } from './normalizar.ts'
import { localDoLinkedin, ufDe } from './regioes.ts'

export interface ChamadaDoActor {
  input: Record<string, unknown>
  maxItems: number
}

export interface PlanoDaBusca {
  actorId: string
  chamadas: ChamadaDoActor[]
}

/** O Actor de cada fonte de busca. */
export const ACTOR_DA_FONTE = {
  linkedin: ACTOR_LINKEDIN_EMPRESAS,
  receita: ACTOR_RECEITA,
} as const

/** Quantas empresas cada página de busca do LinkedIn traz. */
const EMPRESAS_POR_PAGINA = 50
const MAX_CONSULTA = 300
const MAX_LOCAIS = 20
/** Combinações de CNAE e estado numa busca da Receita: cada uma é uma execução do Actor. */
const MAX_COMBINACOES = 6

/**
 * O texto da busca do LinkedIn: as palavras-chave e os setores como termos alternativos (OR), entre aspas quando têm mais de
 * uma palavra. O esquema do Actor diz que a consulta aceita os operadores de busca do LinkedIn; se o Actor tratar o texto
 * de outro jeito, a execução de teste mostra e o ajuste é só aqui.
 */
export function consultaDoLinkedin(criterios: CriteriosDeBusca): string {
  const termos = [...new Set([...criterios.palavrasChave, ...criterios.setores].map((t) => t.trim()).filter(Boolean))]
  const partes: string[] = []
  let tamanho = 0
  for (const termo of termos) {
    const parte = /\s/.test(termo) ? `"${termo.replace(/"/g, '')}"` : termo
    const acrescimo = parte.length + (partes.length ? 4 : 0)
    if (tamanho + acrescimo > MAX_CONSULTA) break
    partes.push(parte)
    tamanho += acrescimo
  }
  return partes.join(' OR ')
}

function chamadasDoLinkedin(criterios: CriteriosDeBusca, maxResults: number): ChamadaDoActor[] {
  const faixas = new Set(FAIXAS_DE_PORTE.map((f) => f.rotulo))
  const portes = criterios.portes.filter((p) => faixas.has(p))
  const locais = [...new Set(criterios.regioes.map(localDoLinkedin))].slice(0, MAX_LOCAIS)
  return [{
    input: {
      scraperMode: 'full',
      searchQuery: consultaDoLinkedin(criterios),
      ...(locais.length ? { locations: locais } : {}),
      ...(portes.length ? { companySize: portes } : {}),
      maxItems: maxResults,
      takePages: Math.ceil(maxResults / EMPRESAS_POR_PAGINA),
    },
    maxItems: maxResults,
  }]
}

function chamadasDaReceita(criterios: CriteriosDeBusca, maxResults: number): ChamadaDoActor[] {
  const ufs = [...new Set(criterios.regioes.map((r) => ufDe(r)).filter((u): u is string => !!u))]
  const combinacoes = criterios.cnaes.flatMap((cnae) => (ufs.length ? ufs : [null]).map((uf) => ({ cnae, uf })))
    .slice(0, MAX_COMBINACOES)
  const porChamada = Math.max(Math.ceil(maxResults / Math.max(combinacoes.length, 1)), 1)
  return combinacoes.map(({ cnae, uf }) => ({
    input: { mode: 'discovery', cnae, ...(uf ? { uf } : {}), situacao: 'ATIVA', maxResults: porChamada },
    maxItems: porChamada,
  }))
}

/** O Actor e as chamadas que a busca faz. Lança se os filtros não bastam (use `faltaParaBuscar` antes). */
export function montarPlano(criterios: CriteriosDeBusca, maxResults: number): PlanoDaBusca {
  const actorId = ACTOR_DA_FONTE[criterios.fonte]
  const chamadas = criterios.fonte === 'receita'
    ? chamadasDaReceita(criterios, maxResults)
    : chamadasDoLinkedin(criterios, maxResults)
  if (!chamadas.length) throw new Error('Os filtros não bastam para montar a busca.')
  return { actorId, chamadas }
}
