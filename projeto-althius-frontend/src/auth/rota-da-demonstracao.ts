/** Onde a equipe Althius abre a Demonstração para mostrar a plataforma. Não aparece em nenhum menu. */
export const ROTA_DA_DEMONSTRACAO = '/demonstracao'

/** Se o caminho é a Demonstração da equipe ou uma tela dentro dela (`/demonstracao/contas`). */
export function ehCaminhoDaDemonstracao(caminho: string): boolean {
  return caminho === ROTA_DA_DEMONSTRACAO || caminho.startsWith(`${ROTA_DA_DEMONSTRACAO}/`)
}
