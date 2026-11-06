// O Contexto da empresa da Demonstração: um contexto de exemplo da empresa fictícia da Demonstração, todo em memória,
// sem backend. Nada dele chega a um Workspace operacional, nem o contrário.

import type {
  ContextoDaEmpresa,
  FonteDoContextoDaEmpresa,
  GeracaoDoContexto,
  MotivoDaFalhaDaGeracao,
  TextosDoContexto,
  VersaoDoContexto,
} from './contexto-da-empresa-tipos'
import { ERRO_CONTEXTO_MUDOU, textosIguais } from './contexto-da-empresa-tipos'

export const CONTEXTO_DA_DEMONSTRACAO: TextosDoContexto = {
  empresa: `A Norte Sistemas desenvolve software de gestão comercial para incorporadoras.

O que vende
- Plataforma de gestão de lançamentos: estoque de unidades, tabela de preços e reservas em tempo real.
- Módulo de atendimento a leads, que distribui contatos de portais e campanhas para corretores próprios e parceiros.
- Painéis de vendas por empreendimento, com velocidade de vendas e distratos.

Problemas que resolve
- Leads de lançamento que esperam horas pela primeira resposta.
- Planilhas de estoque desencontradas entre a incorporadora e as imobiliárias parceiras.
- Pouca visibilidade da diretoria sobre a velocidade de vendas de cada empreendimento.

Diferenciais
- Implantação em até 30 dias por lançamento.
- Integração com os principais portais imobiliários e CRMs de imobiliárias.`,
  icp: `ICP primário: incorporadoras residenciais com operação comercial própria
- Lançam vários empreendimentos por ano, em mais de uma cidade.
- Têm equipe de vendas interna e trabalham também com imobiliárias parceiras.
- Precisam controlar estoque e reservas em tempo real durante o lançamento.

ICP secundário: construtoras que passaram a incorporar
- Já constroem para terceiros e começam a lançar empreendimentos próprios.
- Ainda vendem por planilha e querem estruturar o comercial antes do próximo lançamento.

Exclusões
- Imobiliárias que só intermediam vendas, sem empreendimentos próprios.
- Loteadoras sem venda de unidades na planta.

Recortes sugeridos (a confirmar)
- Sede no Sudeste e no Sul, onde estão os clientes atuais.`,
  personas: `Diretor(a) comercial da incorporadora — decide
- Responde pela meta de vendas de cada lançamento.
- Quer saber, no dia, quantas unidades foram reservadas e por qual canal.
- Dor: perder vendas no lançamento por atraso no atendimento.

Gerente de vendas ou de relacionamento com imobiliárias — influencia
- Coordena corretores próprios e parceiros.
- Quer uma única fonte de estoque e de tabela de preços.
- Dor: retrabalho para conciliar reservas feitas em canais diferentes.

Gerente de marketing — campeão
- Investe em campanhas e portais para gerar leads de lançamento.
- Quer provar o retorno das campanhas até a venda.`,
}

/** O que a leitura simulada do site devolve: os três textos ou o motivo da falha. */
export type LeituraSimulada = TextosDoContexto | { falha: MotivoDaFalhaDaGeracao }

export function criarFonteDoContextoDaEmpresaSimulada({
  autor = 'Ana Lima',
  site: siteInicial = 'nortesistemas.com.br',
  inicial = CONTEXTO_DA_DEMONSTRACAO,
  agora = () => new Date().toISOString(),
  lerSite = async () => CONTEXTO_DA_DEMONSTRACAO,
  atrasoDaLeituraMs = 0,
}: {
  autor?: string
  site?: string
  /** O contexto com que a Demonstração começa; nulo começa vazia. */
  inicial?: TextosDoContexto | null
  agora?: () => string
  /** A leitura do site simulada; os testes trocam para controlar sucesso, falha e demora. */
  lerSite?: (site: string) => Promise<LeituraSimulada>
  atrasoDaLeituraMs?: number
} = {}): FonteDoContextoDaEmpresa {
  let site = siteInicial
  let vigente: VersaoDoContexto | null = inicial
    ? { ...inicial, versao: 1, origem: 'geracao', autor: null, em: '2026-09-01T12:00:00.000Z' }
    : null
  let geracao: GeracaoDoContexto | null = null
  let proxima = 1
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  function gravar(textos: TextosDoContexto, versaoEsperada: number | null, origem: VersaoDoContexto['origem'], quem: string | null) {
    if ((vigente?.versao ?? null) !== versaoEsperada) throw new Error(ERRO_CONTEXTO_MUDOU)
    if (vigente && textosIguais(vigente, textos)) return vigente.versao
    vigente = { ...textos, versao: (vigente?.versao ?? 0) + 1, origem, autor: quem, em: agora() }
    return vigente.versao
  }

  async function concluir(id: string, base: number | null) {
    if (atrasoDaLeituraMs) await new Promise((r) => setTimeout(r, atrasoDaLeituraMs))
    const lida = await lerSite(site).catch((): LeituraSimulada => ({ falha: 'falhou' }))
    if (geracao?.id !== id || geracao.estado !== 'gerando') return
    const iniciadaEm = geracao.iniciadaEm
    if ('falha' in lida) {
      geracao = { id, site, estado: 'falha', motivo: lida.falha, iniciadaEm }
    } else if (base === null && vigente === null) {
      // A primeira leitura completa fica vigente sozinha.
      gravar(lida, null, 'geracao', null)
      geracao = null
    } else {
      // Com contexto (inclusive escrito à mão durante a leitura), vira sugestão.
      geracao = { id, site, estado: 'sugestao', textos: lida, fontes: [`https://${site}/`], iniciadaEm }
    }
    avisar()
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async contexto(): Promise<ContextoDaEmpresa> {
      return { site, vigente, geracao }
    },
    async salvar(textos, versaoEsperada) {
      const antes = vigente?.versao
      const versao = gravar(textos, versaoEsperada, 'manual', autor)
      if (versao !== antes) avisar()
      return versao
    },
    async gerar(novoSite) {
      if (novoSite !== undefined) {
        const limpo = novoSite.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0]
        if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(limpo)) {
          throw new Error('Informe um site público, como suaempresa.com.br.')
        }
        site = limpo
      }
      if (!site) throw new Error('Informe o site da empresa para gerar o contexto.')
      if (geracao?.estado === 'gerando') return
      const id = `geracao-${proxima++}`
      geracao = { id, site, estado: 'gerando', iniciadaEm: agora() }
      avisar()
      void concluir(id, vigente?.versao ?? null)
    },
    async aceitarSugestao(geracaoId, versaoEsperada) {
      if (geracao?.id !== geracaoId || geracao.estado !== 'sugestao') {
        throw new Error('Esta sugestão já foi decidida. Recarregue para ver o contexto atual.')
      }
      const versao = gravar(geracao.textos, versaoEsperada, 'geracao', autor)
      geracao = null
      avisar()
      return versao
    },
    async descartarGeracao(geracaoId) {
      if (geracao?.id !== geracaoId) return
      geracao = null
      avisar()
    },
  }
}
