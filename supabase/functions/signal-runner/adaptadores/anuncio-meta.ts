// Anúncio ativo na Meta (sinais-reais 05): curious_coder/facebook-ads-library-scraper. A entrada é a busca da biblioteca
// de anúncios por palavra-chave com o nome da Conta (a Conta não tem a página do Facebook, e a busca olha o texto e o nome
// da página, não o link: buscar o domínio acharia pouco), só anúncios ativos, em cada país do Monitoramento e a partir do
// início do período. A busca por nome traz outros anunciantes, então o anúncio só conta quando a página é a Conta
// (domínio do link de destino ou nome da página). Campos lidos: os da tabela do README e do esquema de entrada do actor
// (build 2.7.26), nos nomes da saída do actor (`ad_archive_id`, `page_id`, `page_name`, `start_date`, `is_active`,
// `snapshot`), com a forma em camelCase de reserva; a execução real que os confirma é passo do Nan.
import type { AdaptadorDeSinal } from '../handler.ts'
import { dataIso, diasDoPeriodo, nomeDaEmpresa, objeto, objetos, paisesDaLocalizacao, primeiroTexto } from './comum.ts'
import { type Anuncio, anuncianteEhAConta, dataDeDiasAtras, nomeParaBusca, sinaisDosAnuncios, textoDoAnuncio } from './anuncios.ts'

const MAX_ITENS = 30
const MAX_BUSCAS = 3

const BIBLIOTECA = {
  signalType: 'anuncio_meta',
  onde: 'na Meta',
  fonte: 'Biblioteca de anúncios da Meta',
  soAtivos: true,
}

function linkDoAnuncio(item: Record<string, unknown>, id: string): string {
  const link = primeiroTexto(item, 'ad_library_url', 'adLibraryUrl')
  return link || `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`
}

function lerAnuncio(item: Record<string, unknown>): { anuncio: Anuncio; destinos: string[] } | null {
  const id = primeiroTexto(item, 'ad_archive_id', 'adArchiveID', 'adArchiveId')
  const snapshot = objeto(item.snapshot)
  const nome = primeiroTexto(item, 'page_name', 'pageName', 'snapshot.page_name', 'snapshot.pageName')
  const pagina = primeiroTexto(item, 'page_id', 'pageID', 'pageId')
  if (!id || (!nome && !pagina)) return null
  if (item.is_active === false || item.isActive === false) return null
  const cartoes = objetos(Array.isArray(snapshot.cards) ? snapshot.cards : [])
  const corpo = snapshot.body
  return {
    anuncio: {
      id,
      anunciante: pagina || nomeDaEmpresa(nome),
      nomeDoAnunciante: nome || pagina,
      texto: textoDoAnuncio(
        typeof corpo === 'string' ? corpo : objeto(corpo).text,
        snapshot.title,
        ...cartoes.flatMap((c) => [c.title, c.body]),
      ),
      inicio: dataIso(item.start_date) ?? dataIso(item.startDate) ?? dataIso(item.start_date_formatted),
      link: linkDoAnuncio(item, id),
    },
    destinos: [
      primeiroTexto(snapshot, 'link_url', 'linkUrl'),
      primeiroTexto(snapshot, 'caption'),
      ...cartoes.flatMap((c) => [primeiroTexto(c, 'link_url', 'linkUrl'), primeiroTexto(c, 'caption')]),
    ].filter(Boolean),
  }
}

export const anuncioMeta: AdaptadorDeSinal = {
  signalType: BIBLIOTECA.signalType,

  entrada(conta, criterios, agora) {
    const nome = nomeParaBusca(conta)
    const desde = dataDeDiasAtras(diasDoPeriodo(criterios), agora)
    const urls = paisesDaLocalizacao(criterios).slice(0, MAX_BUSCAS).map((pais) => {
      const busca = new URLSearchParams({
        active_status: 'active',
        ad_type: 'all',
        country: pais.codigo,
        q: nome,
        search_type: 'keyword_unordered',
        media_type: 'all',
        'start_date[min]': desde,
      })
      return { url: `https://www.facebook.com/ads/library/?${busca}` }
    })
    return {
      input: { urls, limitPerSource: Math.ceil(MAX_ITENS / urls.length), count: MAX_ITENS, scrapeAdDetails: false },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    const daConta = objetos(itens).flatMap((item) => {
      const lido = lerAnuncio(item)
      if (!lido) return []
      return anuncianteEhAConta(conta, { nome: lido.anuncio.nomeDoAnunciante, destinos: lido.destinos }) ? [lido.anuncio] : []
    })
    return sinaisDosAnuncios(daConta, BIBLIOTECA, criterios, agora)
  },
}
