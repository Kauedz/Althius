// Os passos do ICP E (indústria: fornecedores B2B): a implementação do que o banco registra nas cascatas deste ICP
// (`signal_cascade_steps.handler`; a semente está em 20261013190000_cascatas_icp_e.sql). Cada handler tem teste ao lado.
//   financiamento_bndes_finep      financiamentos_publicos (fonte aberta: BNDES + Finep) → casar_fatos_com_contas
//   expansao_de_planta             noticias_expansao_planta (actor) → empresa_da_noticia_expansao → casar_fatos_com_contas → cnpj_da_conta
//   vaga_engenharia_manutencao     os cinco passos do A1 (linkedin_vagas ... cnpj_da_conta) com os termos de E; nenhum handler novo
//   licenca_instalacao_dou         licencas_dou (actor) → licencas_de_instalacao_dou (mercado)
//   licenca_instalacao             sem fonte (órgãos estaduais)
//   importacao_de_maquinas         sem fonte por empresa (o Comex Stat é agregado; o mercado está no ICP A)
import type { RegistroDePassos } from '../tipos.ts'
import { bndesOperacoes, financiamentosPublicos, financiamentosPublicosAlternativa, finepContratos } from './icp-e-financiamentos.ts'
import { licencasDeInstalacaoDou, licencasDou } from './icp-e-licencas.ts'
import { empresaDaNoticiaExpansao, noticiasExpansaoPlanta } from './icp-e-noticias.ts'

export function passosDoIcp_e(fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      // Só a montagem e a leitura do actor alternativo do BNDES; o motor ainda não roda alternativa de actor em fonte pública.
      financiamentos_publicos: financiamentosPublicosAlternativa,
      noticias_expansao_planta: noticiasExpansaoPlanta,
      empresa_da_noticia_expansao: empresaDaNoticiaExpansao,
      licencas_dou: licencasDou,
      licencas_de_instalacao_dou: licencasDeInstalacaoDou,
    },
    fontes: {
      financiamentos_publicos: financiamentosPublicos(fetchFn),
      bndes_operacoes: bndesOperacoes(fetchFn),
      finep_contratos: finepContratos(fetchFn),
    },
  }
}
