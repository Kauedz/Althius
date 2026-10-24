// Os limites do Plano do Sinal v1, num lugar só do servidor. A migration `20261116120000_briefing_e_plano_do_sinal.sql`
// repete os mesmos números em `private.signal_plan_limits()`, e um teste confere que os dois dizem o mesmo.
// As linhas marcadas com DECISÃO PENDENTE não foram decididas pelo Kauê: são o padrão recomendado, fáceis de trocar aqui
// e na função do banco. As marcadas com "Decidido pelo Kauê em 24/10/2026" foram decididas.

export const VERSAO_DO_PLANO = 1

export const ORIGENS_DO_PLANO = ['briefing', 'modelo', 'formulario'] as const
export type OrigemDoPlano = (typeof ORIGENS_DO_PLANO)[number]

export const LIMITES_DO_PLANO = {
  /** O Briefing escrito pela pessoa. */
  briefingMax: 1000,
  /** O texto que explica o Plano à pessoa. */
  explicacaoMax: 600,
  /** O Plano inteiro, em caracteres do JSON. 500 ids de Conta passam de 20 mil caracteres, então o limite é de 32 mil. */
  planoMaxCaracteres: 32_000,
  /** DECISÃO PENDENTE 8: por enquanto o Plano tem exatamente 1 Sinal; o array já existe para o Sinal com vários tipos. */
  sinaisPorPlano: 1,
  /** Decidido pelo Kauê em 24/10/2026: até 500 Contas escolhidas, em rotação (cada Rodada leva um lote). */
  contasEscolhidasMax: 500,
  /** Decidido pelo Kauê em 24/10/2026: o lote (empresas por Rodada) fica entre 1 e 100, padrão 25. */
  empresasPorRodadaMin: 1,
  empresasPorRodadaMax: 100,
  empresasPorRodadaPadrao: 25,
  /** Os mesmos limites de `paginas/sinais/criterios-custom.ts` e de `validate_market_criteria`. */
  textoCustomMax: 60,
  cargosCustomMax: 10,
  /** Quantos itens uma lista de critérios aceita, contando as opções prontas. */
  itensDeListaMax: 30,
  /** "Palavras na descrição" é um texto livre separado por vírgulas. */
  palavrasMax: 200,
  /** O id do Modelo de origem (reservado para o ticket dos Modelos). */
  modeloIdMax: 80,
  /** Decidido pelo Kauê em 24/10/2026: gerar o Plano não cobra crédito, mas tem limite de 20 por dia (24 horas) por Workspace. */
  planosPorDia: 20,
  /** Quanto a Edge Function espera o motor antes de cair na regra. */
  esperaDoMotorMs: 25_000,
} as const
