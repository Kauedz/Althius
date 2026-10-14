// Publicações da empresa (PR-8, equipes-e-publicacoes): harvestapi/linkedin-company-posts. A entrada é a página da Conta
// no LinkedIn, até 10 posts no período, sem repostagens, reações nem comentários (cada um seria cobrado). Cada post da
// própria empresa é classificado em expansão, nova unidade, contratação, investimento, certificação ou irrelevante pelo
// modelo dos Sinais da plataforma (`SIGNALS_LLM_PROVIDER`, o mesmo das cascatas); sem modelo, ou quando ele falha, vale a
// regra de palavra-chave. Só o post não irrelevante vira Sinal, um por post. Campos lidos: os do exemplo de saída do
// README do actor (build 0.0.53, API pública do Apify em 14/10/2026): `id`, `linkedinUrl`, `content`, `author.type`,
// `author.universalName`, `author.linkedinUrl`, `postedAt.date`/`postedAt.timestamp`.
import type { AdaptadorDeSinal, ContaParaVarrer, ContextoDoAdaptador, SinalDoAdaptador } from '../handler.ts'
import {
  contemAlgum, dataIso, dentroDoPeriodo, diasDoPeriodo, exigirPaginaDoLinkedin, normalizar, objeto, objetos,
  paginaDoLinkedin, primeiroTexto, recortar, sinal,
} from './comum.ts'

export const MAX_POSTS = 10
const FONTE = 'Publicações da empresa no LinkedIn'
const TRECHO = 280

export type Categoria = 'expansao' | 'nova_unidade' | 'contratacao' | 'investimento' | 'certificacao' | 'irrelevante'

export const ROTULOS: Record<Exclude<Categoria, 'irrelevante'>, string> = {
  expansao: 'expansão',
  nova_unidade: 'nova unidade',
  contratacao: 'contratação',
  investimento: 'investimento',
  certificacao: 'certificação',
}
const CATEGORIAS = new Set<string>([...Object.keys(ROTULOS), 'irrelevante'])

// A regra sem modelo: a primeira categoria com termo no texto (sem acento, minúsculo); nada, irrelevante.
const TERMOS: [Categoria, string[]][] = [
  ['nova_unidade', ['nova unidade', 'nova filial', 'nova fabrica', 'novo escritorio', 'inauguramos', 'inauguracao', 'novo centro de distribuicao', 'nova sede']],
  ['investimento', ['investimento', 'aporte', 'rodada', 'captamos', 'captacao', 'investiremos', 'milhoes em']],
  ['certificacao', ['certificacao', 'certificada', 'certificados', 'iso 9001', 'iso 14001', 'iso 27001', 'selo', 'great place to work']],
  ['contratacao', ['estamos contratando', 'vagas abertas', 'vaga aberta', 'venha fazer parte', 'oportunidade de carreira', 'contratando']],
  ['expansao', ['expansao', 'expandir', 'chegamos a', 'novo mercado', 'novos mercados', 'ampliacao', 'crescimento']],
]

export function categoriaPelaRegra(texto: string): Categoria {
  for (const [categoria, termos] of TERMOS) if (contemAlgum(texto, termos)) return categoria
  return 'irrelevante'
}

export interface Post {
  id: string
  texto: string
  data: string
  link: string
}

/** Os posts da página da Conta, no período, com texto. Repostagem de outro autor não conta. */
export function postsDaConta(itens: unknown[], conta: ContaParaVarrer, criterios: Record<string, unknown>, agora: number): Post[] {
  const pagina = paginaDoLinkedin(conta.linkedinUrl)
  const dias = diasDoPeriodo(criterios)
  const vistos = new Set<string>()
  return objetos(itens).flatMap((item): Post[] => {
    if (primeiroTexto(item, 'type') && primeiroTexto(item, 'type') !== 'post') return []
    const id = primeiroTexto(item, 'id')
    const texto = primeiroTexto(item, 'content').replace(/\s+/g, ' ').trim()
    const postedAt = objeto(item.postedAt)
    const data = dataIso(primeiroTexto(postedAt, 'date')) ?? dataIso(postedAt.timestamp)
    if (!id || !texto || !data || vistos.has(id) || !dentroDoPeriodo(data, agora, dias)) return []
    const autor = objeto(item.author)
    const tipo = primeiroTexto(autor, 'type')
    const doAutor = [paginaDoLinkedin(primeiroTexto(autor, 'linkedinUrl')), primeiroTexto(autor, 'universalName').toLowerCase()].filter(Boolean)
    if (tipo === 'profile' || (doAutor.length && !doAutor.includes(pagina))) return []
    vistos.add(id)
    const link = primeiroTexto(item, 'linkedinUrl')
    return [{ id, texto, data, link: /^https:\/\/www\.linkedin\.com\//.test(link) ? link : `https://www.linkedin.com/feed/update/urn:li:activity:${encodeURIComponent(id)}/` }]
  })
}

const SISTEMA = [
  'Você classifica publicações da página de uma empresa no LinkedIn para uma equipe de vendas B2B.',
  'Para cada publicação, escolha uma categoria: expansao (crescimento, novos mercados), nova_unidade (filial, fábrica,',
  'escritório ou sede nova), contratacao (vagas, contratação), investimento (aporte, rodada, investimento anunciado),',
  'certificacao (certificação, selo, prêmio de gestão) ou irrelevante (o resto). Responda só JSON:',
  '{"posts":[{"id":"<id>","categoria":"<categoria>"}]}',
].join(' ')

/** As categorias do modelo, por id; o post que ele não respondeu, ou respondeu fora da lista, cai na regra. */
export function lerResposta(json: unknown): Map<string, Categoria> {
  const r = new Map<string, Categoria>()
  for (const p of objetos(Array.isArray(objeto(json).posts) ? objeto(json).posts as unknown[] : [])) {
    const id = primeiroTexto(p, 'id')
    const c = normalizar(p.categoria).replace(/\s+/g, '_')
    if (id && CATEGORIAS.has(c)) r.set(id, c as Categoria)
  }
  return r
}

async function classificar(posts: Post[], ctx: ContextoDoAdaptador): Promise<Map<string, Categoria>> {
  let doModelo = new Map<string, Categoria>()
  if (ctx.llm && posts.length) {
    try {
      const usuario = posts.map((p) => JSON.stringify({ id: p.id, texto: recortar(p.texto, 1500) })).join('\n')
      const { json, custoUsd } = await ctx.llm.json({ sistema: SISTEMA, usuario, maxTokens: 600 })
      ctx.custo.adicionar(custoUsd, posts.length)
      doModelo = lerResposta(json)
    } catch {
      // O modelo falhou: a regra de palavra-chave classifica.
    }
  }
  return new Map(posts.map((p) => [p.id, doModelo.get(p.id) ?? categoriaPelaRegra(p.texto)]))
}

export const publicacaoDaEmpresa: AdaptadorDeSinal = {
  signalType: 'publicacao_da_empresa',

  entrada(conta, criterios) {
    const dias = diasDoPeriodo(criterios)
    const postedLimit = dias <= 1 ? '24h' : dias <= 7 ? 'week' : dias <= 31 ? 'month' : dias <= 92 ? '3months' : dias <= 183 ? '6months' : 'year'
    return {
      input: {
        targetUrls: [exigirPaginaDoLinkedin(conta)],
        maxPosts: MAX_POSTS,
        postedLimit,
        includeReposts: false,
        includeQuotePosts: false,
        scrapeReactions: false,
        scrapeComments: false,
      },
      maxItems: MAX_POSTS,
    }
  },

  // Sem o contexto, só a regra de palavra-chave.
  sinais(itens, conta, criterios, agora) {
    const posts = postsDaConta(itens, conta, criterios, agora)
    return sinaisDosPosts(posts, new Map(posts.map((p) => [p.id, categoriaPelaRegra(p.texto)])), conta)
  },

  async sinaisComContexto(itens, conta, criterios, agora, ctx) {
    const posts = postsDaConta(itens, conta, criterios, agora)
    return sinaisDosPosts(posts, await classificar(posts, ctx), conta)
  },
}

function sinaisDosPosts(posts: Post[], categorias: Map<string, Categoria>, conta: ContaParaVarrer): SinalDoAdaptador[] {
  return posts.flatMap((p): SinalDoAdaptador[] => {
    const c = categorias.get(p.id) ?? 'irrelevante'
    if (c === 'irrelevante') return []
    return [sinal({
      eventKey: `publicacao_da_empresa|${p.id}`,
      phrase: `Publicação da empresa sobre ${ROTULOS[c]}: “${recortar(p.texto, 120)}”`,
      firedAt: p.data,
      source: FONTE,
      evidence: [`Post de ${conta.name} no LinkedIn sobre ${ROTULOS[c]}:`, `“${recortar(p.texto, TRECHO)}”`, p.link].join(' '),
    })]
  }).sort((a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt))
}
