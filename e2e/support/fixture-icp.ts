// ICP do Workspace QA, no texto da seção ICP do Playbook (ADR-0034): setor, porte e geografia escritos por extenso, para
// o teste do Plano do Sinal conferir que a IA usa o ICP.
export const NOME_DO_WORKSPACE_QA = 'QA Althius (automação)'

export const ICP_DO_PLAYBOOK_DO_QA =
  'Empresas de logística e transporte de porte médio (51 a 200 funcionários) no Sul do Brasil (Paraná, Santa Catarina ' +
  'e Rio Grande do Sul) e no México. Cargos: Diretor de Operações e Gerente de Logística.'

/** Termos que, se aparecerem no Plano, mostram que a IA levou o ICP em conta (já sem acento e em minúsculas). */
export const TERMOS_DO_ICP = {
  setor: ['logistica', 'transport', 'frota'],
  porte: ['51 a 200', '51-200', 'medio porte', 'medias', 'media empresa'],
  geografia: ['sul', 'mexico', 'parana', 'santa catarina', 'rio grande do sul', ' pr', ' sc', ' rs'],
} as const

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
