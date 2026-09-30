// Os tipos do catálogo da tela que têm um Sinal real por trás (o tipo do registro de actors, sinais-reais 01). Um tipo
// que não está aqui ainda não roda de verdade: aparece "em breve". Cada família de Sinais (tickets 03 a 06) acrescenta
// as suas linhas ao entregar o adaptador.
export const SINAL_REAL_DO_TIPO: Readonly<Record<string, string>> = {
  'abertura-de-vagas': 'vaga_linkedin',
  promocoes: 'mudanca_de_emprego',
  'nova-lideranca': 'nova_lideranca',
  'novas-contratacoes': 'entradas_e_saidas',
}

export const TIPO_DO_SINAL_REAL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SINAL_REAL_DO_TIPO).map(([tipo, sinal]) => [sinal, tipo]),
)
