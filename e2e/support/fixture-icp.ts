// ICP do Workspace QA: setor, porte e geografia preenchidos, para o teste do Plano do Sinal conferir que a IA usa o ICP.
export const NOME_DO_WORKSPACE_QA = 'QA Althius (automação)'

export const FIXTURE_ICP = {
  sector: 'Logística e transporte',
  companySize: '51-200',
  geography: 'Sul do Brasil (Paraná, Santa Catarina e Rio Grande do Sul)',
  targetRoles: ['Diretor de Operações', 'Gerente de Logística'],
} as const

/** O critério `localizacao` que a geografia do fixture vira no Plano quando o Briefing não fala de lugar (ticket 16). */
export const LOCALIZACAO_DO_ICP = ['Brasil'] as const

/** Os tipos de Sinal cujo Plano lê `localizacao` (CAMPOS_POR_TIPO em supabase/functions/_shared/plano-do-sinal). */
export const TIPOS_COM_LOCALIZACAO = ['vaga_linkedin', 'vaga_indeed', 'nova_lideranca', 'entradas_e_saidas', 'anuncio_linkedin', 'anuncio_meta', 'anuncio_google'] as const

/** Termos que, se aparecerem no Plano, mostram que a IA levou o ICP em conta (já sem acento e em minúsculas). */
export const TERMOS_DO_ICP = {
  setor: ['logistica', 'transport', 'frota'],
  porte: ['51 a 200', '51-200', 'medio porte', 'medias', 'media empresa'],
  geografia: ['sul', 'parana', 'santa catarina', 'rio grande do sul', ' pr', ' sc', ' rs'],
} as const

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
