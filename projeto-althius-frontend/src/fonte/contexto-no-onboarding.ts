// O Contexto da empresa no onboarding e nas operações que dependem dele (contexto-da-empresa 03): quando o site
// confirmado começa a geração e o que falta enquanto não há versão vigente. Só lê a Fonte do contexto; quem autoriza
// e isola por Workspace é o banco.
import type { ContextoDaEmpresa, FonteDoContextoDaEmpresa } from './contexto-da-empresa-tipos'

/** Onde o Administrador informa o site, gera ou escreve o contexto. */
export const ENDERECO_DO_CONTEXTO = '/configuracoes/contexto'

/**
 * O que falta para o contexto valer: o site, a leitura que está em andamento, uma decisão sobre a falha ou gerar.
 * Nenhuma com versão vigente: uma nova leitura não tira o contexto que já vale.
 */
export type PendenciaDoContexto = 'sem_site' | 'gerando' | 'falha' | 'sem_contexto'

export function pendenciaDoContexto(contexto: ContextoDaEmpresa): PendenciaDoContexto | null {
  if (contexto.vigente) return null
  if (contexto.geracao?.estado === 'gerando') return 'gerando'
  if (contexto.geracao?.estado === 'falha') return 'falha'
  if (!contexto.site) return 'sem_site'
  return 'sem_contexto'
}

/**
 * Confirmar o site no onboarding começa a geração, sem outra confirmação. Não começa de novo quando já há leitura em
 * andamento ou contexto vigente (um Workspace que já tinha contexto, ou uma retomada do onboarding): uma nova leitura,
 * aí, é decisão do Administrador em Configurações. `site` é o domínio que o onboarding acabou de confirmar, que passa
 * a ser o site cadastrado do contexto. Devolve se pediu a geração.
 */
export async function gerarContextoDoOnboarding(fonte: FonteDoContextoDaEmpresa, site: string): Promise<boolean> {
  const atual = await fonte.contexto()
  if (!site || atual.vigente || atual.geracao?.estado === 'gerando') return false
  await fonte.gerar(site)
  return true
}
