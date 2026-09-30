// Contato mudou de emprego ou foi promovido (sinais-reais 04): harvestapi/linkedin-profile-scraper. A entrada são os
// perfis do LinkedIn dos Contatos vinculados à Conta (até 25, no modo sem e-mail, o de US$ 4 por 1.000 perfis); sem
// Contato com LinkedIn, a Conta fica de fora sem cobrar. Sem estado: em vez de comparar com a leitura anterior, o
// cargo atual mais recente (`experience[]` com `endDate.text` "Present") precisa ter começado no período, e o cargo de
// antes dele diz o movimento: os dois na Conta é Promoção; o atual na Conta e o anterior fora, Chegada; o anterior na
// Conta e o atual em outra empresa (sem cargo atual na Conta), Mudança de empresa. A Conta é reconhecida pela página do
// LinkedIn da empresa na experiência (`companyLinkedinUrl`, `companyUniversalName`, `companyId`) ou pelo nome
// (`companyName`). Campos lidos: os do README e do esquema de entrada do actor (build 0.0.135); a execução real que os
// confirma é passo do Nan.
import type { AdaptadorDeSinal, SinalDoAdaptador } from '../handler.ts'
import { SemDadoParaVarrer } from '../handler.ts'
import { diasDoPeriodo, lista, mesDaData, objetos, semRepetidos, sinal } from './comum.ts'
import {
  cargoAnterior, cargoAtende, cargoNormalizado, cargosDoPerfil, chaveDaEmpresa, comecouNoPeriodo, maisRecente, mesEAno,
  type Movimento, movimentoAceito, naConta, pessoaDoItem, perfisDosContatos,
} from './cargos.ts'

const MAX_PERFIS = 25

export const mudancaDeEmprego: AdaptadorDeSinal = {
  signalType: 'mudanca_de_emprego',

  entrada(conta) {
    const perfis = perfisDosContatos(conta).slice(0, MAX_PERFIS)
    if (!perfis.length) throw new SemDadoParaVarrer('Contas sem Contato com LinkedIn ficaram de fora')
    return {
      input: {
        profileScraperMode: 'Profile details no email ($4 per 1k)',
        queries: perfis.map((p) => `https://www.linkedin.com/in/${p}`),
      },
      maxItems: perfis.length,
    }
  },

  sinais(itens, conta, criterios, agora) {
    const dias = diasDoPeriodo(criterios)
    return semRepetidos(objetos(itens).flatMap((item): SinalDoAdaptador[] => {
      const pessoa = pessoaDoItem(item)
      if (!pessoa) return []
      const cargos = cargosDoPerfil(item)
      const novo = maisRecente(cargos.filter((c) => c.atual))
      if (!novo || !comecouNoPeriodo(novo.inicio!, agora, dias)) return []
      const anterior = cargoAnterior(cargos, novo)
      const novoNaConta = naConta(conta, novo.empresa)
      const anteriorNaConta = !!anterior && naConta(conta, anterior.empresa)
      let movimento: Movimento
      if (novoNaConta && anteriorNaConta) {
        if (cargoNormalizado(novo.titulo) === cargoNormalizado(anterior!.titulo)) return []
        movimento = 'Promoção'
      } else if (novoNaConta) {
        movimento = 'Chegada'
      } else if (anteriorNaConta && !cargos.some((c) => c.atual && naConta(conta, c.empresa))) {
        movimento = 'Mudança de empresa'
      } else {
        return []
      }
      if (!movimentoAceito(movimento, criterios)) return []
      // Sem cargo escolhido, qualquer cargo do Contato vale; com cargo, o novo precisa ser um deles.
      if (lista(criterios.cargos).length && !cargoAtende(novo.titulo, criterios)) return []
      const empresa = novo.empresa.nome || conta.name
      const phrase = movimento === 'Promoção'
        ? `Promoção: ${pessoa.nome} agora é ${novo.titulo}`
        : movimento === 'Chegada'
        ? `Chegada: ${pessoa.nome} entrou como ${novo.titulo}`
        : `Mudança de empresa: ${pessoa.nome} saiu de ${conta.name} e agora é ${novo.titulo} em ${empresa}`
      const antes = anterior ? ` Antes: ${anterior.titulo} em ${anterior.empresa.nome || conta.name}.` : ''
      return [sinal({
        eventKey: `mov|${pessoa.perfil}|${chaveDaEmpresa(novo.empresa)}|${cargoNormalizado(novo.titulo)}|${mesDaData(novo.inicio!)}`,
        phrase,
        firedAt: novo.inicio!,
        source: 'LinkedIn',
        evidence: `${pessoa.nome} — ${novo.titulo} em ${empresa}, desde ${mesEAno(novo.inicio!)} (LinkedIn).${antes} ${pessoa.url}`,
      })]
    }))
  },
}
