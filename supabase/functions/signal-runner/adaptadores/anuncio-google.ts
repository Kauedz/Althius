// Anúncio no Google (PR-7, coletor-google-ads): solidcode/ads-transparency-scraper, na Central de Transparência de
// Anúncios do Google (adstransparency.google.com). A entrada é a busca pelo domínio da Conta (a Central acha os
// anunciantes cujos anúncios levam ao site) ou, sem site, pelo nome; no primeiro país da Localização e sem filtro de
// data: para saber se o anúncio é o primeiro, é preciso ver também os mais antigos. Na busca por nome, o anunciante só
// conta quando o nome sem a forma jurídica é o da Conta (na dúvida, não é). Por anunciante, vira Sinal o primeiro
// anúncio visto no período ou o primeiro anúncio de um formato novo (Pesquisa, Display, YouTube). A Central não traz o
// texto do anúncio, então as palavras do formulário não filtram. Campos lidos: os do exemplo de saída do README e do
// esquema de entrada do actor (build 1.0.27, API pública do Apify em 14/10/2026); a execução real que os confirma vem
// antes de o actor passar a "disponível".
import type { AdaptadorDeSinal, SinalDoAdaptador } from '../handler.ts'
import { SemDadoParaVarrer } from '../handler.ts'
import { dataIso, dentroDoPeriodo, diasDoPeriodo, dominio, nomeDaEmpresa, objetos, paisesDaLocalizacao, primeiroTexto, sinal } from './comum.ts'
import { dataCurta, nomeParaBusca } from './anuncios.ts'

export const MAX_ITENS = 40
const SIGNAL_TYPE = 'anuncio_google'
const FONTE = 'Central de Transparência de Anúncios do Google'

/** O formato do anúncio em palavras do produto: `text` é Pesquisa, `image` é Display, `video` é YouTube. */
const FORMATOS: Record<string, string> = { text: 'Pesquisa', image: 'Display', video: 'YouTube' }

interface AnuncioDoGoogle {
  id: string
  anunciante: string
  nomeDoAnunciante: string
  formato: string | null
  inicio: string
  link: string
}

/** A busca da Conta: o domínio do site, ou o nome quando não há site. */
function buscaDaConta(conta: Parameters<AdaptadorDeSinal['entrada']>[0]): { termo: string; porDominio: boolean } {
  const site = dominio(conta.domain)
  if (site.includes('.')) return { termo: site, porDominio: true }
  if (!nomeDaEmpresa(conta.name)) throw new SemDadoParaVarrer('Contas sem site e sem nome ficaram de fora')
  return { termo: nomeParaBusca(conta), porDominio: false }
}

function lerAnuncio(item: Record<string, unknown>): AnuncioDoGoogle | null {
  const id = primeiroTexto(item, 'creativeId')
  const anunciante = primeiroTexto(item, 'advertiserId')
  const nome = primeiroTexto(item, 'advertiserName')
  const inicio = dataIso(primeiroTexto(item, 'firstShown'))
  if (!id || (!anunciante && !nome) || !inicio) return null
  const formato = FORMATOS[primeiroTexto(item, 'adFormat').toLowerCase()] ?? null
  const link = primeiroTexto(item, 'adUrl')
  return {
    id,
    anunciante: anunciante || nomeDaEmpresa(nome),
    nomeDoAnunciante: nome || anunciante,
    formato,
    inicio,
    link: /^https:\/\/adstransparency\.google\.com\//.test(link)
      ? link
      : anunciante
      ? `https://adstransparency.google.com/advertiser/${encodeURIComponent(anunciante)}/creative/${encodeURIComponent(id)}`
      : '',
  }
}

const quantos = (n: number) => `${n} ${n === 1 ? 'anúncio' : 'anúncios'}`

/** Os Sinais de um anunciante: o primeiro anúncio no período, ou o primeiro de cada formato novo no período. */
function sinaisDoAnunciante(anuncios: AnuncioDoGoogle[], agora: number, dias: number): SinalDoAdaptador[] {
  const ordem = [...anuncios].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  const [primeiro] = ordem
  const noPeriodo = (a: AnuncioDoGoogle) => dentroDoPeriodo(a.inicio, agora, dias)
  if (noPeriodo(primeiro)) {
    const desde = dataCurta(primeiro.inicio)
    const formatos = [...new Set(ordem.map((a) => a.formato).filter(Boolean))]
    return [sinal({
      eventKey: `${SIGNAL_TYPE}|${primeiro.anunciante}|primeiro`,
      phrase: `Começou a anunciar no Google: ${quantos(ordem.length)} desde ${desde}`,
      firedAt: primeiro.inicio,
      source: FONTE,
      evidence: [
        `${quantos(ordem.length)} de ${primeiro.nomeDoAnunciante} no Google; o primeiro apareceu em ${desde} (${FONTE}).`,
        formatos.length ? `Formatos: ${formatos.join(', ')}.` : '',
        primeiro.link,
      ].filter(Boolean).join(' '),
    })]
  }
  const sinais: SinalDoAdaptador[] = []
  for (const formato of Object.values(FORMATOS)) {
    const doFormato = ordem.filter((a) => a.formato === formato)
    if (!doFormato.length || !noPeriodo(doFormato[0])) continue
    const desde = dataCurta(doFormato[0].inicio)
    sinais.push(sinal({
      eventKey: `${SIGNAL_TYPE}|${primeiro.anunciante}|formato:${formato.toLowerCase()}`,
      phrase: `Novo formato de anúncio no Google: ${formato} desde ${desde}`,
      firedAt: doFormato[0].inicio,
      source: FONTE,
      evidence: [
        `${quantos(doFormato.length)} de ${primeiro.nomeDoAnunciante} em ${formato}, formato que não aparecia antes;`,
        `o primeiro em ${desde}. A empresa anuncia no Google desde ${dataCurta(primeiro.inicio)} (${FONTE}).`,
        doFormato[0].link,
      ].filter(Boolean).join(' '),
    }))
  }
  return sinais
}

export const anuncioGoogle: AdaptadorDeSinal = {
  signalType: SIGNAL_TYPE,

  entrada(conta, criterios) {
    const { termo } = buscaDaConta(conta)
    const [pais] = paisesDaLocalizacao(criterios)
    return { input: { searchQuery: termo, region: pais.codigo, maxResults: MAX_ITENS }, maxItems: MAX_ITENS }
  },

  sinais(itens, conta, criterios, agora) {
    const { porDominio } = buscaDaConta(conta)
    const alvo = nomeDaEmpresa(conta.name)
    const unicos = new Map<string, AnuncioDoGoogle>()
    for (const item of objetos(itens)) {
      const anuncio = lerAnuncio(item)
      if (!anuncio || unicos.has(anuncio.id)) continue
      if (!porDominio && nomeDaEmpresa(anuncio.nomeDoAnunciante) !== alvo) continue
      unicos.set(anuncio.id, anuncio)
    }
    const porAnunciante = new Map<string, AnuncioDoGoogle[]>()
    for (const a of unicos.values()) porAnunciante.set(a.anunciante, [...(porAnunciante.get(a.anunciante) ?? []), a])
    const dias = diasDoPeriodo(criterios)
    return [...porAnunciante.values()]
      .flatMap((grupo) => sinaisDoAnunciante(grupo, agora, dias))
      .sort((a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt))
  },
}
