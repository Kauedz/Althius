// Avaliações no Google Maps (sinais-reais 06): compass/google-maps-reviews-scraper. A Conta não tem o lugar do Maps,
// então a entrada é uma busca do Maps pelo nome da Conta (sem a forma jurídica), com as avaliações do Google mais novas
// primeiro, só as do período, em pt-BR e sem os dados pessoais de quem avaliou (`personalData: false`). O esquema não
// limita quantos lugares a busca traz: o limite é o de avaliações por lugar e o de itens da execução. Cada item é uma
// avaliação com os dados do lugar; o lugar só conta quando é a Conta (site ou nome), e dele saem três Sinais: queda de
// nota, reclamações repetidas sobre um assunto e muitas avaliações negativas. Campos lidos: `placeId` (ou `fid`, `cid`),
// `title`, `url`, `totalScore`, `reviewsCount`, `stars`, `publishedAtDate`, `text`, `textTranslated`, `isAdvertisement` e
// `reviewId` (só para não contar a mesma avaliação duas vezes), do README e do esquema de entrada do actor (build
// 0.0.527); o site do lugar (`website`) não aparece no README e é lido por suposição. Nada de quem avaliou (nome, id, URL,
// foto) nem o link da avaliação é lido, mesmo quando o item traz. A execução real que confirma os campos é passo do Nan.
import { type AdaptadorDeSinal, type ContaParaVarrer, SemDadoParaVarrer, type SinalDoAdaptador } from '../handler.ts'
import {
  contemAlgum,
  dataIso,
  dentroDoPeriodo,
  diasDoPeriodo,
  dominio,
  lista,
  mesDaData,
  mesmoDominio,
  nomeDaEmpresa,
  normalizar,
  objetos,
  primeiroTexto,
  recortar,
  semRepetidos,
  sinal,
  texto,
} from './comum.ts'

// 50 avaliações por lugar cobrem o período de quase toda Conta B2B e bastam aos mínimos abaixo; 100 itens deixam a busca
// trazer até dois lugares inteiros (a matriz e uma unidade, por ex.) sem o custo passar de centavos.
const MAX_AVALIACOES_POR_LUGAR = 50
const MAX_ITENS = 100

// Queda de nota: pelo menos 5 avaliações no período e a média delas 1 estrela ou mais abaixo da nota geral. Com 0,7, uma
// avaliação de 1 estrela entre quatro boas já derrubava um lugar de nota 4,8; com 1, precisa de mais de uma ruim.
export const QUEDA = { minimo: 5, estrelas: 1 } as const
// Reclamações repetidas: pelo menos 3 avaliações negativas no período sobre o mesmo assunto.
export const MINIMO_POR_ASSUNTO = 3
// Muitas negativas: pelo menos 5 no período e a maioria das avaliações dele (metade ou mais). A proporção evita que um
// lugar muito avaliado, que sempre tem algumas notas baixas, dispare todo mês.
export const MUITAS_NEGATIVAS = { minimo: 5, proporcao: 0.5 } as const
const MAX_TRECHOS = 2
const TAMANHO_DO_TRECHO = 120

// Os assuntos de reclamação: a chave vai na chave do acontecimento, o nome na frase, os termos (palavra inteira, sem
// acento) no texto da avaliação. Palavras soltas demais ("ruim", "valor", "barata") ficam de fora: casariam com tudo.
export const ASSUNTOS: Readonly<Record<string, { nome: string; termos: string[] }>> = {
  atendimento: {
    nome: 'atendimento',
    termos: [
      'atendimento', 'atendente', 'atendentes', 'atendeu', 'atender', 'atendido', 'atendida', 'grosso', 'grossa', 'grosseiro',
      'grosseira', 'grosseria', 'mal educado', 'mal educada', 'descaso', 'desrespeito', 'falta de respeito', 'funcionario',
      'funcionarios', 'funcionaria', 'funcionarias', 'sac', 'suporte',
    ],
  },
  demora: {
    nome: 'demora e espera',
    termos: [
      'demora', 'demorou', 'demorado', 'demorada', 'demoram', 'demorando', 'espera', 'esperar', 'esperei', 'esperando', 'fila',
      'filas', 'lento', 'lenta', 'lentidao',
    ],
  },
  preco: {
    nome: 'preço e cobrança',
    termos: [
      'preco', 'precos', 'caro', 'caros', 'abusivo', 'abusiva', 'cobranca', 'cobrancas', 'cobrado', 'cobrada', 'cobraram',
      'cobrou', 'cobrar', 'taxa', 'taxas', 'fatura', 'boleto', 'reembolso', 'estorno',
    ],
  },
  qualidade: {
    nome: 'qualidade',
    termos: [
      'qualidade', 'defeito', 'defeitos', 'defeituoso', 'defeituosa', 'quebrado', 'quebrada', 'quebrou', 'estragado', 'estragada',
    ],
  },
  entrega: {
    nome: 'entrega e atraso',
    termos: [
      'entrega', 'entregas', 'entregue', 'entregou', 'entregaram', 'atraso', 'atrasos', 'atrasado', 'atrasada', 'atrasou', 'prazo',
      'prazos', 'nao chegou', 'extravio', 'extraviado', 'extraviada', 'rastreio',
    ],
  },
  limpeza: {
    nome: 'limpeza',
    termos: [
      'limpeza', 'sujo', 'suja', 'sujos', 'sujas', 'sujeira', 'imundo', 'imunda', 'higiene', 'banheiro', 'banheiros', 'fedor',
      'mau cheiro',
    ],
  },
  sistema: {
    nome: 'sistema e app fora do ar',
    termos: [
      'sistema', 'app', 'aplicativo', 'site', 'fora do ar', 'instavel', 'instabilidade', 'travando', 'travou', 'trava', 'bug',
      'erro', 'erros', 'login', 'caiu',
    ],
  },
  cancelamento: {
    nome: 'cancelamento',
    termos: ['cancelamento', 'cancelar', 'cancelei', 'cancelaram', 'cancelado', 'cancelada', 'multa', 'fidelidade'],
  },
}

/** O teto de estrelas de uma avaliação negativa, pela "Nota" do formulário; sem nota, até 2 estrelas (o padrão do card). */
export function tetoDaNota(criterios: Record<string, unknown>): number {
  const nota = normalizar(criterios.nota)
  if (nota.includes('qualquer')) return 5
  const achado = nota.match(/[1-5]/)
  return achado ? Number(achado[0]) : 2
}

// Busca.

const FORMA_JURIDICA_NO_FIM = /[\s,.&-]+(?:ltda|s\.?\s?\/?a|me|epp|eireli|inc|llc|ltd|corp|plc|gmbh|cia)\.?$/i

/** O nome da Conta como o Maps o escreve: sem a forma jurídica do fim ("Acme Logística S.A." vira "Acme Logística"). */
export function nomeParaBusca(nome: string): string {
  let atual = nome.trim()
  for (;;) {
    const sem = atual.replace(FORMA_JURIDICA_NO_FIM, '').replace(/[\s,&-]+$/, '').trim()
    if (sem === atual || !sem) return atual
    atual = sem
  }
}

// Reconhecer a Conta.

// Sites que não são da empresa (rede social, página pronta): não servem para dizer que o lugar é ou não é a Conta.
const SITES_DE_TERCEIROS = [
  'instagram.com', 'facebook.com', 'wa.me', 'whatsapp.com', 'linktr.ee', 'business.site', 'google.com', 'ifood.com.br',
]

function siteDoLugar(item: Record<string, unknown>): string {
  const site = dominio(primeiroTexto(item, 'website', 'site', 'domain'))
  return site && !SITES_DE_TERCEIROS.some((t) => mesmoDominio(site, t)) ? site : ''
}

// O nome da unidade vem depois de um separador com espaço ("Acme - Unidade Centro", "Acme | Matriz", "Acme (Centro)"): o
// hífen colado ("Coca-Cola") é parte do nome.
const SEPARADOR_DE_UNIDADE = /\s[-–—|·:]\s|\s?\(|,\s/

/**
 * Se o lugar é a Conta. Com o site das duas pontas, só o domínio decide. Sem ele, o nome sem a forma jurídica: igual ao da
 * Conta, ou igual antes de um separador de unidade. "Acme Logística Express" não é a "Acme Logística": na dúvida, não é.
 */
export function lugarDaConta(conta: ContaParaVarrer, lugar: { titulo: string; site: string }): boolean {
  const dominioDaConta = dominio(conta.domain)
  if (dominioDaConta && lugar.site) return mesmoDominio(dominioDaConta, lugar.site)
  const nomeDaConta = nomeDaEmpresa(conta.name)
  if (!nomeDaConta) return false
  if (nomeDaEmpresa(lugar.titulo) === nomeDaConta) return true
  const [antes] = lugar.titulo.split(SEPARADOR_DE_UNIDADE)
  return antes !== lugar.titulo && nomeDaEmpresa(antes) === nomeDaConta
}

// Resultado.

interface Avaliacao {
  estrelas: number
  data: string
  /** O texto para o trecho: a tradução em pt-BR quando há, senão o original. */
  texto: string
  /** Original e tradução juntos, para achar os assuntos. */
  busca: string
}

interface Lugar {
  id: string
  titulo: string
  url: string
  notaGeral: number | null
  totalDeAvaliacoes: number | null
  avaliacoes: Avaliacao[]
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const n = Number(texto(valor).replace(',', '.'))
  return texto(valor) && Number.isFinite(n) ? n : null
}

/** Os lugares da Conta com as avaliações do período, em ordem de data. */
function lugaresDaConta(itens: unknown[], conta: ContaParaVarrer, dias: number, agora: number): Lugar[] {
  const lugares = new Map<string, Lugar | null>()
  const vistas = new Set<string>()
  for (const item of objetos(itens)) {
    const id = primeiroTexto(item, 'placeId', 'fid', 'cid')
    const titulo = primeiroTexto(item, 'title')
    if (!id || !titulo) continue
    if (!lugares.has(id)) {
      const daConta = lugarDaConta(conta, { titulo, site: siteDoLugar(item) })
      lugares.set(id, daConta
        ? {
          id,
          titulo,
          url: primeiroTexto(item, 'url'),
          notaGeral: numero(item.totalScore),
          totalDeAvaliacoes: numero(item.reviewsCount),
          avaliacoes: [],
        }
        : null)
    }
    const lugar = lugares.get(id)
    if (!lugar || item.isAdvertisement === true) continue
    const estrelas = numero(item.stars) ?? numero(item.rating)
    const data = dataIso(item.publishedAtDate)
    if (estrelas === null || estrelas < 1 || estrelas > 5 || !data || !dentroDoPeriodo(data, agora, dias)) continue
    const original = primeiroTexto(item, 'text')
    const traduzido = primeiroTexto(item, 'textTranslated')
    const chave = `${id}|${primeiroTexto(item, 'reviewId') || `${data}|${original}`}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    lugar.avaliacoes.push({ estrelas, data, texto: traduzido || original, busca: `${original} ${traduzido}` })
  }
  const daConta = [...lugares.values()].filter((l): l is Lugar => !!l)
  for (const l of daConta) l.avaliacoes.sort((a, b) => Date.parse(a.data) - Date.parse(b.data))
  return daConta
}

/**
 * A avaliação que completou o critério: a primeira, em ordem de data, a partir da qual as avaliações do período até ela
 * já o cumprem. Nulo quando o período inteiro não cumpre. Ela dá a data do Sinal e o mês da chave.
 */
function aQueCompletou(avaliacoes: Avaliacao[], criterio: (ate: Avaliacao[]) => boolean): Avaliacao | null {
  if (!criterio(avaliacoes)) return null
  for (let i = 1; i <= avaliacoes.length; i++) if (criterio(avaliacoes.slice(0, i))) return avaliacoes[i - 1]
  return null
}

function media(avaliacoes: Avaliacao[]): number {
  return avaliacoes.reduce((soma, a) => soma + a.estrelas, 0) / avaliacoes.length
}

const decimal = (n: number) => n.toFixed(1).replace('.', ',')
const inteiro = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

/** Até dois trechos curtos das avaliações mais recentes do grupo, entre aspas. Nada de quem escreveu. */
function trechos(avaliacoes: Avaliacao[]): string {
  const escolhidos = [...avaliacoes].reverse().filter((a) => a.texto).slice(0, MAX_TRECHOS)
  return escolhidos.length ? ` Trechos: ${escolhidos.map((a) => `"${recortar(a.texto, TAMANHO_DO_TRECHO)}"`).join('; ')}.` : ''
}

function sobreOLugar(lugar: Lugar, periodo: Avaliacao[]): string {
  const emQuantas = lugar.totalDeAvaliacoes === null ? '' : ` em ${inteiro(lugar.totalDeAvaliacoes)} avaliações`
  const geral = lugar.notaGeral === null ? '' : `; nota geral ${decimal(lugar.notaGeral)}${emQuantas}`
  const onde = lugar.url ? ` (${lugar.url})` : ''
  return `${lugar.titulo}${onde}: ${periodo.length} avaliações no período, média ${decimal(media(periodo))}${geral}.`
}

function sinaisDoLugar(lugar: Lugar, criterios: Record<string, unknown>, dias: number): SinalDoAdaptador[] {
  const periodo = lugar.avaliacoes
  if (!periodo.length) return []
  const teto = tetoDaNota(criterios)
  const negativa = (a: Avaliacao) => a.estrelas <= teto
  const deAte = teto < 5 ? ` de até ${teto} ${teto === 1 ? 'estrela' : 'estrelas'}` : ''
  const contexto = sobreOLugar(lugar, periodo)
  const base = { source: 'Google Maps' }
  const sinais: SinalDoAdaptador[] = []

  // a) Queda de nota: a média do período bem abaixo da nota geral do lugar.
  const notaGeral = lugar.notaGeral
  if (notaGeral !== null) {
    const caiu = (ate: Avaliacao[]) =>
      ate.length >= QUEDA.minimo && Math.round((notaGeral - media(ate)) * 100) / 100 >= QUEDA.estrelas
    const completou = aQueCompletou(periodo, caiu)
    if (completou) {
      const piores = periodo.filter((a) => a.estrelas <= Math.min(teto, 3))
      sinais.push(sinal({
        ...base,
        eventKey: `maps|${lugar.id}|queda|${mesDaData(completou.data)}`,
        phrase: `Nota em queda no Google Maps: média ${decimal(media(periodo))} em ${dias} dias, contra ${decimal(notaGeral)}`,
        firedAt: completou.data,
        evidence: `${contexto}${trechos(piores)}`,
      }))
    }
  }

  // b) Reclamações repetidas: um Sinal por assunto (do dicionário ou das palavras do Monitoramento) e mês.
  const assuntos = [
    ...Object.entries(ASSUNTOS).map(([chave, a]) => ({ chave, ...a })),
    ...lista(criterios.palavras).map((p) => ({ chave: normalizar(p), nome: p, termos: [p] })).filter((a) => a.chave),
  ]
  for (const assunto of assuntos) {
    const sobreOAssunto = (a: Avaliacao) => negativa(a) && contemAlgum(a.busca, assunto.termos)
    const completou = aQueCompletou(periodo, (ate) => ate.filter(sobreOAssunto).length >= MINIMO_POR_ASSUNTO)
    if (!completou) continue
    const grupo = periodo.filter(sobreOAssunto)
    // Com "Qualquer nota" não dá para dizer que é reclamação: a frase diz só que o assunto se repete.
    const oQue = teto < 5 ? 'Reclamações repetidas' : 'Avaliações repetidas'
    sinais.push(sinal({
      ...base,
      eventKey: `maps|${lugar.id}|assunto|${assunto.chave}|${mesDaData(completou.data)}`,
      phrase: `${oQue} sobre ${assunto.nome} no Google Maps: ${grupo.length} em ${dias} dias`,
      firedAt: completou.data,
      evidence: `${grupo.length} avaliações${deAte} sobre ${assunto.nome} em ${dias} dias. ${contexto}${trechos(grupo)}`,
    }))
  }

  // c) Muitas avaliações negativas, com ou sem assunto em comum. Com "Qualquer nota" toda avaliação contaria: não se aplica.
  if (teto < 5) {
    const muitas = (ate: Avaliacao[]) => {
      const n = ate.filter(negativa).length
      return n >= MUITAS_NEGATIVAS.minimo && n / ate.length >= MUITAS_NEGATIVAS.proporcao
    }
    const completou = aQueCompletou(periodo, muitas)
    if (completou) {
      const negativas = periodo.filter(negativa)
      sinais.push(sinal({
        ...base,
        eventKey: `maps|${lugar.id}|negativas|${mesDaData(completou.data)}`,
        phrase: `Muitas avaliações negativas no Google Maps: ${negativas.length} de ${periodo.length} em ${dias} dias`,
        firedAt: completou.data,
        evidence: `${negativas.length} avaliações${deAte} em ${dias} dias. ${contexto}${trechos(negativas)}`,
      }))
    }
  }
  return sinais
}

export const avaliacoesGoogleMaps: AdaptadorDeSinal = {
  signalType: 'avaliacoes_google_maps',

  entrada(conta, criterios) {
    const nome = nomeParaBusca(conta.name ?? '')
    if (!nome) throw new SemDadoParaVarrer('Contas sem nome ficaram de fora')
    // O formato de busca dos links do Maps (o mesmo do `url` do README). Só o nome: o Maps busca por nome, categoria e
    // endereço, e o domínio na busca faria ela não achar nada; o site e o nome são conferidos depois, lugar por lugar.
    const url = `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: nome })}`
    return {
      input: {
        startUrls: [{ url }],
        maxReviews: MAX_AVALIACOES_POR_LUGAR,
        reviewsSort: 'newest',
        // Relativo ("30 days"): o actor conta do início da execução, e só vale com as mais novas primeiro.
        reviewsStartDate: `${diasDoPeriodo(criterios)} days`,
        reviewsOrigin: 'google',
        language: 'pt-BR',
        personalData: false,
      },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    const dias = diasDoPeriodo(criterios)
    return semRepetidos(lugaresDaConta(itens, conta, dias, agora).flatMap((l) => sinaisDoLugar(l, criterios, dias)))
  },
}
