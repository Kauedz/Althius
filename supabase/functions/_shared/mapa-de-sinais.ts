// Os Sinais do Mapa de Mercado (out/2026) por ICP: o único catálogo que o Hermes pode oferecer (sinais em cascata, fatia final).
// O banco diz o estado de cada um (disponível, em validação, sem fonte); este arquivo diz QUAIS fazem parte do Mapa, o gatilho
// de timing e a restrição regulatória de cada ICP. Um teste confere que as migrações das cascatas e este mapa dizem o mesmo.

export interface IcpDoMapa {
  nome: string
  /** Por que agora: o gatilho de timing do Mapa. */
  gatilho: string
  /** A restrição que vale para quem aborda esse ICP (vazia quando o Mapa não aponta nenhuma). */
  restricao: string
  /** Os tipos de Sinal do Mapa neste ICP (`signal_type` das cascatas), na ordem do quadro "Sinais, gatilho e restrição". */
  sinais: readonly string[]
}

export const MAPA_DE_SINAIS: Readonly<Record<string, IcpDoMapa>> = {
  A: {
    nome: 'Comex e importação',
    gatilho: 'A reforma tributária muda o custo de importação e a ordem da conta.',
    restricao: '',
    sinais: ['novo_importador', 'habilitacao_radar', 'ncm_nova_na_pauta', 'volume_por_porto', 'vaga_comex'],
  },
  B: {
    nome: 'Contabilidade e tributário',
    gatilho: 'Transição da CBS e do IBS até 2033.',
    restricao: 'CFC: publicidade informativa, tom técnico.',
    sinais: ['cnpj_novo', 'mudanca_de_porte_ou_regime', 'entrada_de_socio', 'setor_afetado_cbs_ibs'],
  },
  C: {
    nome: 'Jurídico empresarial',
    gatilho: 'A reforma gera contencioso e planejamento.',
    restricao: 'OAB e LGPD: só Sinal por empresa/CNPJ, lista de contas sem dado pessoal e sem contato frio do escritório.',
    sinais: ['processos_publicos', 'mudanca_regulatoria', 'recuperacao_judicial', 'impacto_reforma_cnae', 'processos_jusbrasil_datajud'],
  },
  D: {
    nome: 'Energia e mercado livre',
    gatilho: 'Abertura da baixa tensão até nov/2027.',
    restricao: 'Regras da ANEEL para o varejista; sem barreira à prospecção.',
    sinais: ['grupo_a_cativo', 'vencimento_contrato_energia', 'nova_planta_filial', 'cnae_eletrointensivo', 'meta_esg_publicada'],
  },
  E: {
    nome: 'Indústria, fornecedores B2B',
    gatilho: 'A Nova Indústria Brasil ampliou o crédito.',
    restricao: '',
    sinais: [
      'financiamento_bndes_finep', 'licenca_instalacao', 'licenca_instalacao_dou', 'expansao_de_planta',
      'vaga_engenharia_manutencao', 'importacao_de_maquinas',
    ],
  },
  F: {
    nome: 'Logística e transporte',
    gatilho: 'Mercado em consolidação e custo logístico em alta.',
    restricao: '',
    sinais: ['novo_cd_ou_filial', 'vaga_logistica', 'crescimento_comex_embarcador', 'troca_de_sede'],
  },
  G: {
    nome: 'Corretoras de benefícios',
    gatilho: 'Muitas corretoras pequenas sem estrutura comercial.',
    restricao: 'SUSEP; cuidado com dados de saúde (LGPD): nenhum dado de saúde entra no Sinal.',
    sinais: ['cruzando_faixa_de_headcount', 'renovacao_de_apolice', 'nova_filial_icp_g', 'frota_crescendo', 'caged_por_empresa'],
  },
  H: {
    nome: 'Agro B2B',
    gatilho: 'O crédito privado (CPR, LCA, Fiagro) cresce.',
    restricao: 'Regras da CVM e do Bacen para quem oferta crédito.',
    sinais: ['cpr_registrada', 'area_no_car', 'calendario_de_safra', 'liberacao_plano_safra', 'nova_cooperativa'],
  },
}

const ICP_DO_SINAL = new Map<string, string>(
  Object.entries(MAPA_DE_SINAIS).flatMap(([icp, m]) => m.sinais.map((s): [string, string] => [s, icp])),
)

/** O ICP do Mapa a que o tipo de Sinal pertence; `null` quando o tipo não é do Mapa (então o Hermes não o oferece). */
export function icpDoSinalDoMapa(sinal: string): string | null {
  return ICP_DO_SINAL.get(sinal) ?? null
}
