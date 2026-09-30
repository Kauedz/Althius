// Vaga no Indeed Brasil (sinais-reais 03): valig/indeed-jobs-scraper. O actor busca por um texto só ("cargo, palavra ou
// empresa") num país, então a entrada é o nome da Conta no país do Monitoramento, e a vaga só vira Sinal quando o
// empregador é a Conta (site ou nome); função, senioridade e palavras são filtradas aqui. A chave é a mesma das vagas do
// LinkedIn: a vaga que aparece nas duas fontes conta uma vez. Campos lidos: os do README e do esquema de entrada do actor
// (build 0.0.16); a execução real que os confirma é passo do Nan.
import type { AdaptadorDeSinal } from '../handler.ts'
import { dataIso, diasDoPeriodo, mesmaEmpresa, objeto, objetos, paisesDaLocalizacao, primeiroTexto, semRepetidos } from './comum.ts'
import { sinalDaVaga, type Vaga, vagaAtende } from './vagas.ts'

const MAX_ITENS = 100
// Os períodos que o Indeed aceita, em dias; acima de 14, a busca não limita e o filtro fica aqui.
const PERIODOS_DO_INDEED = [1, 3, 7, 14]

function nivelNosAtributos(item: Record<string, unknown>): string {
  const atributos = Object.values(objeto(item.attributes)).filter((v): v is string => typeof v === 'string')
  return atributos.find((a) => /level|n[ií]vel/i.test(a)) ?? ''
}

export const vagaIndeed: AdaptadorDeSinal = {
  signalType: 'vaga_indeed',

  entrada(conta, criterios) {
    const dias = diasDoPeriodo(criterios)
    const periodo = PERIODOS_DO_INDEED.find((p) => p >= dias)
    const [pais] = paisesDaLocalizacao(criterios)
    return {
      input: {
        country: pais.codigo.toLowerCase(),
        title: conta.name,
        limit: MAX_ITENS,
        ...(periodo ? { datePosted: String(periodo) } : {}),
      },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    return semRepetidos(objetos(itens).flatMap((item) => {
      const empresa = {
        nome: primeiroTexto(item, 'employer.name'),
        site: primeiroTexto(item, 'employer.corporateWebsite'),
      }
      const titulo = primeiroTexto(item, 'title')
      if (!titulo || !mesmaEmpresa(conta, empresa)) return []
      const cidade = primeiroTexto(item, 'location.city')
      const vaga: Vaga = {
        titulo,
        local: cidade || primeiroTexto(item, 'location.countryName'),
        descricao: primeiroTexto(item, 'description.text'),
        nivel: nivelNosAtributos(item),
        link: primeiroTexto(item, 'url'),
        publicadaEm: dataIso(item.datePublished) ?? dataIso(item.dateOnIndeed),
      }
      return vagaAtende(vaga, criterios, agora) ? [sinalDaVaga(vaga, conta, 'Indeed', agora)] : []
    }))
  },
}
