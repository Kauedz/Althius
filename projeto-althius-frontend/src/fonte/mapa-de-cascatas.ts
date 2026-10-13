// Os ICPs do Mapa de Mercado como a tela os mostra: o nome, a restrição regulatória e a ordem dos Sinais de cada um. É a
// cópia, para o navegador, de `supabase/functions/_shared/mapa-de-sinais.ts` (que o Hermes lê); `mapa-de-cascatas.test.ts`
// falha se os dois divergirem. A letra do ICP e o tipo de cada Sinal vêm do banco; o texto vem daqui.

export interface IcpDoMapaNaTela {
  id: string
  nome: string
  /** A restrição que vale para quem aborda esse ICP; vazia quando o Mapa não aponta nenhuma. */
  restricao: string
  /** Os tipos de Sinal do ICP, na ordem do Mapa. */
  sinais: readonly string[]
}

export const ICPS_DO_MAPA: readonly IcpDoMapaNaTela[] = [
  {
    id: 'A',
    nome: 'Comex e importação',
    restricao: '',
    sinais: ['novo_importador', 'habilitacao_radar', 'ncm_nova_na_pauta', 'volume_por_porto', 'vaga_comex'],
  },
  {
    id: 'B',
    nome: 'Contabilidade e tributário',
    restricao: 'CFC: publicidade informativa, tom técnico.',
    sinais: ['cnpj_novo', 'mudanca_de_porte_ou_regime', 'entrada_de_socio', 'setor_afetado_cbs_ibs'],
  },
  {
    id: 'C',
    nome: 'Jurídico empresarial',
    restricao: 'OAB e LGPD: só Sinal por empresa/CNPJ, lista de contas sem dado pessoal e sem contato frio do escritório.',
    sinais: ['processos_publicos', 'mudanca_regulatoria', 'recuperacao_judicial', 'impacto_reforma_cnae', 'processos_jusbrasil_datajud'],
  },
  {
    id: 'D',
    nome: 'Energia e mercado livre',
    restricao: 'Regras da ANEEL para o varejista; sem barreira à prospecção.',
    sinais: ['grupo_a_cativo', 'vencimento_contrato_energia', 'nova_planta_filial', 'cnae_eletrointensivo', 'meta_esg_publicada'],
  },
  {
    id: 'E',
    nome: 'Indústria, fornecedores B2B',
    restricao: '',
    sinais: [
      'financiamento_bndes_finep', 'licenca_instalacao', 'licenca_instalacao_dou', 'expansao_de_planta',
      'vaga_engenharia_manutencao', 'importacao_de_maquinas',
    ],
  },
  {
    id: 'F',
    nome: 'Logística e transporte',
    restricao: '',
    sinais: ['novo_cd_ou_filial', 'vaga_logistica', 'crescimento_comex_embarcador', 'troca_de_sede'],
  },
  {
    id: 'G',
    nome: 'Corretoras de benefícios',
    restricao: 'SUSEP; cuidado com dados de saúde (LGPD): nenhum dado de saúde entra no Sinal.',
    sinais: ['cruzando_faixa_de_headcount', 'renovacao_de_apolice', 'nova_filial_icp_g', 'frota_crescendo', 'caged_por_empresa'],
  },
  {
    id: 'H',
    nome: 'Agro B2B',
    restricao: 'Regras da CVM e do Bacen para quem oferta crédito.',
    sinais: ['cpr_registrada', 'area_no_car', 'calendario_de_safra', 'liberacao_plano_safra', 'nova_cooperativa'],
  },
]
