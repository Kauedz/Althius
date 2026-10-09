// Os tipos do catálogo da tela que têm um Sinal real por trás (o tipo do catálogo do banco). Um tipo que não está aqui
// ainda não roda de verdade: aparece "em breve".

/**
 * Os 9 Sinais externos do lançamento (sinais-reais, tickets 03 a 06), um actor do registro para cada. O estado de cada
 * um (disponível ou em teste) vem do registro de actors.
 */
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

/**
 * Os Sinais internos que rodam de verdade (CRM-10): saem só das Interações gravadas no Workspace, sem fornecedor e sem
 * crédito. O estado vem do catálogo do banco.
 */
export const SINAL_INTERNO_DO_TIPO: Readonly<Record<string, string>> = {
  'sem-resposta': 'sem_resposta',
  'negociacao-parada': 'negociacao_parada',
}

/** Todo tipo da tela com um Sinal real, externo ou interno. */
export const SINAL_DO_TIPO: Readonly<Record<string, string>> = { ...SINAL_REAL_DO_TIPO, ...SINAL_INTERNO_DO_TIPO }

export const TIPO_DO_SINAL_REAL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SINAL_DO_TIPO).map(([tipo, sinal]) => [sinal, tipo]),
)

export const TIPOS_INTERNOS_REAIS: ReadonlySet<string> = new Set(Object.keys(SINAL_INTERNO_DO_TIPO))

/** O prazo é o único critério que a avaliação de um Sinal interno usa; a condição é o próprio tipo. */
export const CRITERIOS_DOS_SINAIS_INTERNOS: readonly string[] = ['prazo']
