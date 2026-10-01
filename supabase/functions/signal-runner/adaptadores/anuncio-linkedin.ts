// Anúncio no LinkedIn (sinais-reais 05): silva95gustavo/linkedin-ad-library-scraper. A entrada é a busca da biblioteca de
// anúncios do LinkedIn pelo anunciante (`accountOwner`) com o nome da Conta, em cada país e no período do Monitoramento.
// A página da empresa também serve de entrada e acharia só a Conta, mas não filtra data nem país (o README desaconselha):
// o limite de anúncios iria para campanhas antigas. A busca por nome traz outros anunciantes, então o anúncio só conta
// quando o anunciante é a Conta (página do LinkedIn, domínio do link de destino ou nome). Os detalhes ficam ligados:
// a data de início (`availability.start`) é da página de cada anúncio, e sem ela não dá para saber se a campanha é nova.
// Campos lidos: os do exemplo de saída do README e do esquema de entrada do actor (build 1.2.2); a execução real que os
// confirma é passo do Nan.
import type { AdaptadorDeSinal } from '../handler.ts'
import { dataIso, diasDoPeriodo, nomeDaEmpresa, objetos, paginaDoLinkedin, paisesDaLocalizacao, primeiroTexto } from './comum.ts'
import { type Anuncio, anuncianteEhAConta, dataDeDiasAtras, nomeParaBusca, sinaisDosAnuncios, textoDoAnuncio } from './anuncios.ts'

const MAX_ITENS = 20
const MAX_BUSCAS = 3
// O maior período fixo da biblioteca do LinkedIn; acima dele, o intervalo de datas.
const PERIODO_FIXO_EM_DIAS = 30

const BIBLIOTECA = {
  signalType: 'anuncio_linkedin',
  onde: 'no LinkedIn',
  fonte: 'Biblioteca de anúncios do LinkedIn',
  soAtivos: false,
  semDataValeAVarredura: true,
}

function periodoDaBusca(dias: number, agora: number): Record<string, string> {
  if (dias <= PERIODO_FIXO_EM_DIAS) return { dateOption: 'last-30-days' }
  return { dateOption: 'custom-date-range', startdate: dataDeDiasAtras(dias, agora), enddate: dataDeDiasAtras(0, agora) }
}

function linkDoAnuncio(item: Record<string, unknown>, id: string): string {
  const link = primeiroTexto(item, 'adLibraryUrl', 'adUrl', 'url')
  if (/linkedin\.com\/ad-library\/detail\//.test(link)) return link
  return `https://www.linkedin.com/ad-library/detail/${encodeURIComponent(id)}`
}

export const anuncioLinkedin: AdaptadorDeSinal = {
  signalType: BIBLIOTECA.signalType,

  entrada(conta, criterios, agora) {
    const nome = nomeParaBusca(conta)
    const periodo = periodoDaBusca(diasDoPeriodo(criterios), agora)
    const startUrls = paisesDaLocalizacao(criterios).slice(0, MAX_BUSCAS).map((pais) => {
      const busca = new URLSearchParams({ accountOwner: nome, countries: pais.codigo, ...periodo })
      return { url: `https://www.linkedin.com/ad-library/search?${busca}` }
    })
    return {
      input: { startUrls, resultsLimit: Math.ceil(MAX_ITENS / startUrls.length), skipDetails: false },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    const daConta = objetos(itens).flatMap((item): Anuncio[] => {
      const id = primeiroTexto(item, 'adId')
      const nome = primeiroTexto(item, 'advertiserName')
      const linkedinUrl = primeiroTexto(item, 'advertiserUrl')
      if (!id || !nome) return []
      if (!anuncianteEhAConta(conta, { nome, linkedinUrl, destinos: [primeiroTexto(item, 'clickUrl')] })) return []
      return [{
        id,
        anunciante: paginaDoLinkedin(linkedinUrl) || nomeDaEmpresa(nome),
        nomeDoAnunciante: nome,
        texto: textoDoAnuncio(item.headline, item.body),
        inicio: dataIso(primeiroTexto(item, 'availability.start')),
        link: linkDoAnuncio(item, id),
      }]
    })
    return sinaisDosAnuncios(daConta, BIBLIOTECA, criterios, agora)
  },
}
