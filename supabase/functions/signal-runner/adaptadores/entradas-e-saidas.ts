// Entradas de pessoas na Conta (sinais-reais 04): harvestapi/linkedin-company-employees. A entrada é a busca de
// funcionários da página da Conta no LinkedIn (`companies`) com menos de 1 ano de casa (`yearsAtCurrentCompanyIds`
// ["1"]), que mudaram de emprego há pouco (`recentlyChangedJobs`), com os cargos escolhidos ou os de liderança
// (`jobTitles`) e no país (`locations`), no modo Short (o mais barato; o README diz que ele traz as posições atuais,
// `currentPosition[]`). Vira Sinal a Chegada: o cargo atual na Conta, de liderança (ou um dos cargos escolhidos), que
// começou no período. Suposição que a execução real confirma: o perfil curto traz `currentPosition[].dateRange.start`
// (como o `currentPosition` do perfil completo da busca de perfis); sem essa data, nada vira Sinal. Se vier a
// experiência completa (`experience[]`), a Promoção dentro da Conta não conta como entrada.
// Saídas ficam de fora: o esquema do actor só filtra quem trabalha hoje na empresa (não há filtro de ex-funcionários,
// só `excludePastCompanies`), e sem estado não dá para ver quem sumiu da lista. Campos lidos: os do README e do esquema
// de entrada do actor (build 0.0.161); a execução real que os confirma é passo do Nan.
import type { AdaptadorDeSinal, SinalDoAdaptador } from '../handler.ts'
import { SemDadoParaVarrer } from '../handler.ts'
import {
  diasDoPeriodo, exigirPaginaDoLinkedin, mesDaData, objetos, paginaDoLinkedin, paisesDaLocalizacao, semRepetidos, sinal,
} from './comum.ts'
import {
  buscasDosCargos, cargoAtende, cargoAtualNaConta, comecouNoPeriodo, exigeContato, mesEAno, movimentoAceito, perfisDosContatos,
  pessoaAtende, pessoaDoItem,
} from './cargos.ts'

const MAX_ITENS = 25

export const entradasESaidas: AdaptadorDeSinal = {
  signalType: 'entradas_e_saidas',

  entrada(conta, criterios) {
    const pagina = exigirPaginaDoLinkedin(conta)
    if (exigeContato(criterios) && !perfisDosContatos(conta).length) {
      throw new SemDadoParaVarrer('Contas sem Contato com LinkedIn ficaram de fora')
    }
    return {
      input: {
        profileScraperMode: 'Short ($4 per 1k)',
        companies: [pagina],
        yearsAtCurrentCompanyIds: ['1'],
        recentlyChangedJobs: true,
        jobTitles: buscasDosCargos(criterios),
        locations: paisesDaLocalizacao(criterios).map((p) => p.nomeEmIngles),
        maxItems: MAX_ITENS,
        takePages: 1,
      },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    if (!movimentoAceito('Chegada', criterios)) return []
    const dias = diasDoPeriodo(criterios)
    const empresa = paginaDoLinkedin(conta.linkedinUrl) || conta.name
    return semRepetidos(objetos(itens).flatMap((item): SinalDoAdaptador[] => {
      const pessoa = pessoaDoItem(item)
      const achado = cargoAtualNaConta(item, conta, true)
      if (!pessoa || !achado || achado.promocao || !pessoaAtende(pessoa.perfil, conta, criterios)) return []
      const { novo } = achado
      if (!cargoAtende(novo.titulo, criterios) || !comecouNoPeriodo(novo.inicio!, agora, dias)) return []
      return [sinal({
        eventKey: `entrada|${empresa}|${pessoa.perfil}|${mesDaData(novo.inicio!)}`,
        phrase: `Entrada: ${pessoa.nome} chegou como ${novo.titulo}`,
        firedAt: novo.inicio!,
        source: 'LinkedIn',
        evidence: `${pessoa.nome} — ${novo.titulo} em ${novo.empresa.nome || conta.name}, desde ${mesEAno(novo.inicio!)} ` +
          `(LinkedIn). ${pessoa.url}`,
      })]
    }))
  },
}
