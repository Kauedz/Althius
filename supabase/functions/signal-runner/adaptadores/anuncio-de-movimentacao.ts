// Anúncio público de movimentação (sinais-reais 04): harvestapi/linkedin-post-search. A entrada são duas buscas de posts
// com os termos de movimentação em português (no máximo 5 operadores OR por busca, como pede o README), dos autores que
// trabalham na Conta (`authorsCompanies` com a página da Conta no LinkedIn), as mais novas primeiro (`sortBy` "date"),
// no menor `postedLimit` que cobre o período, sem reações, comentários nem perfil do autor (o modo "short" não cobra
// perfil). Vira Sinal o post do período que fala da Conta (o nome dela no texto ou no título do autor, ou a própria
// página da Conta como autora), que se lê como Promoção, Chegada ou saída (Mudança de empresa) e que traz um cargo de
// liderança (ou um dos cargos escolhidos) logo depois de "como", "promovido a", "nova", "assume" e afins. A evidência é
// um trecho curto do post e o link dele. Campos lidos: os do README e do esquema de entrada do actor (build 0.0.114):
// `id`, `linkedinUrl`, `content`, `author.name`/`info`/`linkedinUrl`/`publicIdentifier`/`universalName`/`type` e
// `postedAt.timestamp`/`date`. Suposição que a execução real confirma: o esquema chama `authorsCompanies` de "nomes de
// empresa", mas o exemplo de `mentioningCompany` aceita a URL da página; vai a URL. A execução real é passo do Nan.
import type { AdaptadorDeSinal, ContaParaVarrer, SinalDoAdaptador } from '../handler.ts'
import { SemDadoParaVarrer } from '../handler.ts'
import {
  contemAlgum, dataIso, dentroDoPeriodo, diasDoPeriodo, exigirPaginaDoLinkedin, nomeDaEmpresa, normalizar, objeto, objetos,
  paginaDoLinkedin, perfilDoLinkedin, primeiroTexto, recortar, semRepetidos, sinal, texto,
} from './comum.ts'
import { cargoAtende, exigeContato, type Movimento, movimentoAceito, perfisDosContatos, pessoaAtende } from './cargos.ts'

const MAX_POSTS_POR_BUSCA = 20

// Os termos pedidos no ticket, em duas buscas de no máximo 5 operadores cada.
export const BUSCAS_DE_MOVIMENTACAO = [
  '"novo cargo" OR "fui promovido" OR "fui promovida" OR "novo desafio"',
  '"tenho o prazer de anunciar" OR "damos as boas-vindas" OR "assume como"',
]

const PROMOCAO = [
  'fui promovido', 'fui promovida', 'promovido a', 'promovida a', 'promovido para', 'promovida para', 'foi promovido',
  'foi promovida', 'minha promocao', 'promocao a', 'promocao para',
]
const SAIDA = [
  'me despeco', 'encerro meu ciclo', 'encerro um ciclo', 'encerrei meu ciclo', 'encerrando meu ciclo', 'encerrando um ciclo',
  'meu ultimo dia', 'deixo a', 'deixo o', 'deixei a', 'deixei o', 'estou deixando',
]
const CHEGADA = [
  'novo cargo', 'novo desafio', 'nova posicao', 'novo capitulo', 'tenho o prazer de anunciar', 'tenho o prazer de compartilhar',
  'damos as boas vindas', 'damos boas vindas', 'assume como', 'assumo como', 'assumi como', 'comecando em um novo',
  'acabo de entrar', 'acabei de entrar', 'juntei me', 'bem vindo', 'bem vinda',
]
// Post de vaga fala de cargo e de "novo desafio" sem ser movimentação de ninguém.
const VAGA = ['vaga', 'vagas', 'contratando', 'hiring', 'candidate se', 'candidatar', 'processo seletivo', 'oportunidade de emprego']

/** O menor `postedLimit` do actor que cobre o período (o filtro fino é feito aqui, pela data do post). */
function limiteDoPeriodo(dias: number): string {
  return dias <= 1 ? '24h' : dias <= 7 ? 'week' : dias <= 31 ? 'month' : dias <= 92 ? '3months' : dias <= 183 ? '6months' : 'year'
}

// O começo de um cargo no texto logo depois de um conector de anúncio ("como", "promovida a", "nossa nova"...).
const CONECTOR = String.raw`(?:como|cargo de|posição de|posicao de|promovid[oa]s?\s+(?:a|ao|para|para o cargo de|ao cargo de)|` +
  String.raw`assum[eiu]+(?:\s+(?:o|a)\s+(?:cargo|posição|posicao)\s+de)?|nov[oa]s?|noss[oa]|as|role of|position of)`
const INICIO_DO_CARGO = String.raw`(?:diretor(?:a|\(a\)|\/a)?|gerente|head|vp|svp|evp|vice[\s-]presidente|vice[\s-]president|` +
  String.raw`superintendente|s[óo]ci[oa](?:\(a\))?|presidente|president|chief|ceo|cto|cfo|cdo|coo|cio|cmo|cro|chro|ciso|` +
  String.raw`director|general manager|country manager|managing director)`
const ANUNCIO = new RegExp(String.raw`(?:^|[\s,(])${CONECTOR}\s+(${INICIO_DO_CARGO})(?=$|[\s,.!;:)])`, 'giu')

// As palavras que continuam o título ("de Dados", "Executivo", "of Engineering"); o resto (a Conta, a frase) fica fora.
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'of', 'for', 'e', '&', 'and', 'the'])
const MAX_PALAVRAS_DO_CARGO = 6

/** Os cargos anunciados no texto: o começo reconhecido e as palavras que o continuam, cortado antes do nome da Conta. */
export function cargosNoTexto(conteudo: string, nomeDaConta: string): string[] {
  const primeiraDaConta = normalizar(nomeDaConta).split(' ')[0] ?? ''
  const achados: string[] = []
  for (const m of conteudo.matchAll(ANUNCIO)) {
    const resto = conteudo.slice((m.index ?? 0) + m[0].length).split(/(?=[.,!;:()|\n])/)[0]
    const palavras = [m[1]]
    for (const p of resto.trim().split(/\s+/).filter(Boolean)) {
      if (palavras.length >= MAX_PALAVRAS_DO_CARGO) break
      const n = normalizar(p)
      if (!n || n === primeiraDaConta) break
      const continua = LIGACOES.has(n) || /^\p{Lu}/u.test(p) || /^(ti|ia|bi|rh)$/.test(n)
      if (!continua) break
      palavras.push(p)
    }
    while (palavras.length > 1 && LIGACOES.has(normalizar(palavras[palavras.length - 1]))) palavras.pop()
    achados.push(palavras.join(' '))
  }
  return achados
}

/** O movimento que o texto anuncia (nenhum em post de vaga); a saída só com o termo de saída logo antes do nome da Conta. */
function movimentoDoTexto(conteudo: string, nomeDaConta: string): Movimento | null {
  const t = ` ${normalizar(conteudo)} `
  if (contemAlgum(t, VAGA)) return null
  if (contemAlgum(t, PROMOCAO)) return 'Promoção'
  const conta = nomeDaEmpresa(nomeDaConta)
  const saida = conta && SAIDA.some((s) => new RegExp(` ${s} (?:\\S+ ){0,6}${conta} `).test(t))
  if (saida) return 'Mudança de empresa'
  return contemAlgum(t, CHEGADA) ? 'Chegada' : null
}

function linkDoPost(item: Record<string, unknown>): string {
  return primeiroTexto(item, 'linkedinUrl', 'url').split('?')[0]
}

function idDoPost(item: Record<string, unknown>): string {
  const id = primeiroTexto(item, 'id', 'entityId')
  if (id) return id
  const link = linkDoPost(item)
  return link.match(/activity[-:](\d+)/)?.[1] ?? link
}

const NOMES: Record<Movimento, string> = { 'Promoção': 'promoção', 'Chegada': 'chegada', 'Mudança de empresa': 'saída' }

export const anuncioDeMovimentacao: AdaptadorDeSinal = {
  signalType: 'anuncio_de_movimentacao',

  entrada(conta, criterios) {
    const pagina = exigirPaginaDoLinkedin(conta)
    if (exigeContato(criterios) && !perfisDosContatos(conta).length) {
      throw new SemDadoParaVarrer('Contas sem Contato com LinkedIn ficaram de fora')
    }
    return {
      input: {
        searchQueries: BUSCAS_DE_MOVIMENTACAO,
        authorsCompanies: [pagina],
        sortBy: 'date',
        postedLimit: limiteDoPeriodo(diasDoPeriodo(criterios)),
        maxPosts: MAX_POSTS_POR_BUSCA,
        profileScraperMode: 'short',
        scrapeReactions: false,
        scrapeComments: false,
      },
      maxItems: MAX_POSTS_POR_BUSCA * BUSCAS_DE_MOVIMENTACAO.length,
    }
  },

  sinais(itens, conta, criterios, agora) {
    return semRepetidos(objetos(itens).flatMap((item) => {
      const r = avaliarPost(item, conta, criterios, agora)
      return r.sinal ? [r.sinal] : []
    }))
  },
}

/** Em que etapa cada post parou, só a contagem (nenhum texto nem nome): serve para entender por que não saiu Sinal. */
export const ETAPAS_DO_POST = [
  'não é post',
  'sem texto, id ou data',
  'fora do período',
  'não fala da Conta',
  'pessoa não atende',
  'sem termo de movimentação (ou é vaga)',
  'movimento não aceito',
  'sem cargo de liderança depois do conector',
  'virou Sinal',
] as const

export function descartesDeMovimentacao(
  itens: unknown[],
  conta: ContaParaVarrer,
  criterios: Record<string, unknown>,
  agora: number,
): Record<(typeof ETAPAS_DO_POST)[number], number> {
  const contagem = Object.fromEntries(ETAPAS_DO_POST.map((e) => [e, 0])) as Record<(typeof ETAPAS_DO_POST)[number], number>
  for (const item of objetos(itens)) contagem[avaliarPost(item, conta, criterios, agora).etapa]++
  return contagem
}

function avaliarPost(
  item: Record<string, unknown>,
  conta: ContaParaVarrer,
  criterios: Record<string, unknown>,
  agora: number,
): { etapa: (typeof ETAPAS_DO_POST)[number]; sinal?: SinalDoAdaptador } {
  const dias = diasDoPeriodo(criterios)
  const paginaDaConta = paginaDoLinkedin(conta.linkedinUrl)
  const nomeDaConta = nomeDaEmpresa(conta.name)
  if (texto(item.type) && texto(item.type) !== 'post') return { etapa: 'não é post' }
  const conteudo = primeiroTexto(item, 'content', 'text')
  const autor = objeto(item.author)
  const publicadoEm = dataIso(objeto(item.postedAt).timestamp) ?? dataIso(objeto(item.postedAt).date) ?? dataIso(item.postedAt)
  const id = idDoPost(item)
  if (!conteudo || !id || !publicadoEm) return { etapa: 'sem texto, id ou data' }
  if (!dentroDoPeriodo(publicadoEm, agora, dias)) return { etapa: 'fora do período' }
  // O post precisa falar da Conta: o autor é a página dela, ou o nome dela está no texto ou no título do autor.
  const daPagina = !!paginaDaConta && texto(autor.universalName).toLowerCase() === paginaDaConta
  const citaAConta = !!nomeDaConta && contemAlgum(`${conteudo} ${texto(autor.info)}`, [nomeDaConta])
  if (!daPagina && !citaAConta) return { etapa: 'não fala da Conta' }
  const perfil = perfilDoLinkedin(autor.linkedinUrl) ||
    (texto(autor.type) === 'profile' ? texto(autor.publicIdentifier).toLowerCase() : '')
  if (!pessoaAtende(perfil, conta, criterios)) return { etapa: 'pessoa não atende' }
  const movimento = movimentoDoTexto(conteudo, conta.name)
  if (!movimento) return { etapa: 'sem termo de movimentação (ou é vaga)' }
  if (!movimentoAceito(movimento, criterios)) return { etapa: 'movimento não aceito' }
  const cargo = cargosNoTexto(conteudo, conta.name).find((c) => cargoAtende(c, criterios))
  if (!cargo) return { etapa: 'sem cargo de liderança depois do conector' }
  const quem = perfil && texto(autor.name) ? ` (${texto(autor.name)})` : ''
  const link = linkDoPost(item)
  return {
    etapa: 'virou Sinal',
    sinal: sinal({
      eventKey: `post|${id}`,
      phrase: `Anúncio de ${NOMES[movimento]}: ${cargo}${quem}`,
      firedAt: publicadoEm,
      source: 'LinkedIn Posts',
      evidence: `"${recortar(conteudo, 300)}" ${link}`.trim(),
    }),
  }
}
