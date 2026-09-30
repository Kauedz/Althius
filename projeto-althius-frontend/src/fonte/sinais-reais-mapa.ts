// Os tipos do catálogo da tela que têm um Sinal real por trás (o tipo do registro de actors, sinais-reais 01). Um tipo
// que não está aqui ainda não roda de verdade: aparece "em breve". Os 9 Sinais do lançamento (tickets 03 a 06) estão
// aqui; o estado de cada um (disponível ou em teste) vem do registro.
export const SINAL_REAL_DO_TIPO: Readonly<Record<string, string>> = {
  'abertura-de-vagas': 'vaga_linkedin',
  'vagas-no-indeed': 'vaga_indeed',
  promocoes: 'mudanca_de_emprego',
  'nova-lideranca': 'nova_lideranca',
  'novas-contratacoes': 'entradas_e_saidas',
  'anuncio-de-movimentacao': 'anuncio_de_movimentacao',
  'anuncios-linkedin': 'anuncio_linkedin',
  'anuncios-meta': 'anuncio_meta',
  'avaliacoes-google-maps': 'avaliacoes_google_maps',
}

export const TIPO_DO_SINAL_REAL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SINAL_REAL_DO_TIPO).map(([tipo, sinal]) => [sinal, tipo]),
)
