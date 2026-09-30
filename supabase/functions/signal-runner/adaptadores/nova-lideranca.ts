// Nova liderança na Conta (sinais-reais 04): harvestapi/linkedin-profile-search. A entrada é uma busca de pessoas com
// cargo atual na página da Conta no LinkedIn (`currentCompanies`), que mudaram de emprego nos últimos 90 dias
// (`recentlyChangedJobs`), com os cargos escolhidos ou os de liderança (`currentJobTitles`) e no país
// (`locations`); uma página de busca só (25 perfis). O modo é o Full: o README só mostra a data de início do cargo no
// perfil completo (`experience[].startDate`, `currentPosition[].dateRange.start`), e é a experiência que separa a
// Chegada da Promoção. Vira Sinal o perfil cujo cargo atual na Conta é de liderança (ou um dos cargos escolhidos),
// começou no período e passa por "Movimento" e "Pessoas de referência". Campos lidos: os do README e do esquema de
// entrada do actor (build 0.0.272); a execução real que os confirma é passo do Nan.
import type { AdaptadorDeSinal, SinalDoAdaptador } from '../handler.ts'
import { SemDadoParaVarrer } from '../handler.ts'
import {
  diasDoPeriodo, exigirPaginaDoLinkedin, mesDaData, objetos, paginaDoLinkedin, paisesDaLocalizacao, semRepetidos, sinal,
} from './comum.ts'
import {
  buscasDosCargos, cargoAtende, cargoAtualNaConta, cargoNormalizado, comecouNoPeriodo, exigeContato, mesEAno, movimentoAceito,
  perfisDosContatos, pessoaAtende, pessoaDoItem,
} from './cargos.ts'

const MAX_ITENS = 25

export const novaLideranca: AdaptadorDeSinal = {
  signalType: 'nova_lideranca',

  entrada(conta, criterios) {
    const pagina = exigirPaginaDoLinkedin(conta)
    if (exigeContato(criterios) && !perfisDosContatos(conta).length) {
      throw new SemDadoParaVarrer('Contas sem Contato com LinkedIn ficaram de fora')
    }
    return {
      input: {
        profileScraperMode: 'Full',
        currentCompanies: [pagina],
        recentlyChangedJobs: true,
        currentJobTitles: buscasDosCargos(criterios),
        locations: paisesDaLocalizacao(criterios).map((p) => p.nomeEmIngles),
        maxItems: MAX_ITENS,
        takePages: 1,
      },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    const dias = diasDoPeriodo(criterios)
    const empresa = paginaDoLinkedin(conta.linkedinUrl) || conta.name
    return semRepetidos(objetos(itens).flatMap((item): SinalDoAdaptador[] => {
      const pessoa = pessoaDoItem(item)
      const achado = cargoAtualNaConta(item, conta, true)
      if (!pessoa || !achado || !pessoaAtende(pessoa.perfil, conta, criterios)) return []
      const { novo, anterior, promocao } = achado
      if (!cargoAtende(novo.titulo, criterios) || !comecouNoPeriodo(novo.inicio!, agora, dias)) return []
      if (promocao && cargoNormalizado(novo.titulo) === cargoNormalizado(anterior!.titulo)) return []
      if (!movimentoAceito(promocao ? 'Promoção' : 'Chegada', criterios)) return []
      const antes = anterior ? ` Antes: ${anterior.titulo} em ${anterior.empresa.nome || conta.name}.` : ''
      return [sinal({
        eventKey: `lideranca|${empresa}|${pessoa.perfil}|${cargoNormalizado(novo.titulo)}|${mesDaData(novo.inicio!)}`,
        phrase: promocao
          ? `Nova liderança: ${pessoa.nome} foi promovido(a) a ${novo.titulo}`
          : `Nova liderança: ${pessoa.nome} chegou como ${novo.titulo}`,
        firedAt: novo.inicio!,
        source: 'LinkedIn',
        evidence: `${pessoa.nome} — ${novo.titulo} em ${novo.empresa.nome || conta.name}, desde ${mesEAno(novo.inicio!)} ` +
          `(LinkedIn).${antes} ${pessoa.url}`,
      })]
    }))
  },
}
