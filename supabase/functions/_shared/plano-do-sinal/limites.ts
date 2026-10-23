// Os limites do Plano do Sinal v1, num lugar só do servidor. A migration `20261116120000_briefing_e_plano_do_sinal.sql`
// repete os mesmos números em `private.signal_plan_limits()`, e um teste confere que os dois dizem o mesmo.
// As linhas marcadas com DECISÃO PENDENTE não foram decididas pelo Kauê: são o padrão recomendado, fáceis de trocar aqui
// e na função do banco.

export const VERSAO_DO_PLANO = 1

export const ORIGENS_DO_PLANO = ['briefing', 'modelo', 'formulario'] as const
export type OrigemDoPlano = (typeof ORIGENS_DO_PLANO)[number]

export const LIMITES_DO_PLANO = {
  /** O Briefing escrito pela pessoa. */
  briefingMax: 1000,
  /** O texto que explica o Plano à pessoa. */
  explicacaoMax: 600,
  /** O Plano inteiro, em caracteres do JSON (o mesmo limite dos critérios de um Monitoramento). */
  planoMaxCaracteres: 20_000,
  /** DECISÃO PENDENTE 8: por enquanto o Plano tem exatamente 1 Sinal; o array já existe para o Sinal com vários tipos. */
  sinaisPorPlano: 1,
  /** DECISÃO PENDENTE 10: até 50 Contas escolhidas a dedo. */
  contasEscolhidasMax: 50,
  /** DECISÃO PENDENTE 10: o máximo de empresas por Rodada fica entre 1 e 100, padrão 50. */
  empresasPorRodadaMin: 1,
  empresasPorRodadaMax: 100,
  empresasPorRodadaPadrao: 50,
  /** Os mesmos limites de `paginas/sinais/criterios-custom.ts` e de `validate_market_criteria`. */
  textoCustomMax: 60,
  cargosCustomMax: 10,
  /** Quantos itens uma lista de critérios aceita, contando as opções prontas. */
  itensDeListaMax: 30,
  /** "Palavras na descrição" é um texto livre separado por vírgulas. */
  palavrasMax: 200,
  /** O id do Modelo de origem (reservado para o ticket dos Modelos). */
  modeloIdMax: 80,
  /** DECISÃO PENDENTE 13: gerar o Plano não cobra crédito, mas tem limite de 20 por dia (24 horas) por Workspace. */
  planosPorDia: 20,
  /** Quanto a Edge Function espera o motor antes de cair na regra. */
  esperaDoMotorMs: 25_000,
} as const
