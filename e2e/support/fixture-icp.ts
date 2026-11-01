// ICP do Workspace QA, no texto da seção ICP do Playbook (ADR-0034): setor, porte e geografia escritos por extenso, para
// o teste do Plano do Sinal conferir que a IA usa o ICP.
export const NOME_DO_WORKSPACE_QA = 'QA Althius (automação)'

export const ICP_DO_PLAYBOOK_DO_QA =
  'Empresas de logística e transporte de porte médio (51 a 200 funcionários) no Sul do Brasil (Paraná, Santa Catarina ' +
  'e Rio Grande do Sul) e no México. Cargos: Diretor de Operações e Gerente de Logística.'

/**
 * O critério `localizacao` que a geografia do ICP estruturado virava no Plano (ticket sinais-first 16; sai no ticket 05
 * de desfazer-sinais-first).
 * O México está no fixture de propósito: o padrão do Plano é ["Brasil"], então só a geografia do ICP explica o México.
 */
export const LOCALIZACAO_DO_ICP = ['Brasil', 'México'] as const

/** Os tipos de Sinal cujo Plano lê `localizacao` (CAMPOS_POR_TIPO em supabase/functions/_shared/plano-do-sinal). */
export const TIPOS_COM_LOCALIZACAO = ['vaga_linkedin', 'vaga_indeed', 'nova_lideranca', 'entradas_e_saidas', 'anuncio_linkedin', 'anuncio_meta', 'anuncio_google'] as const

/** Termos que, se aparecerem no Plano, mostram que a IA levou o ICP em conta (já sem acento e em minúsculas). */
export const TERMOS_DO_ICP = {
  setor: ['logistica', 'transport', 'frota'],
  porte: ['51 a 200', '51-200', 'medio porte', 'medias', 'media empresa'],
  geografia: ['sul', 'mexico', 'parana', 'santa catarina', 'rio grande do sul', ' pr', ' sc', ' rs'],
} as const

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
