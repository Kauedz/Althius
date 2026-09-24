import type { Aderencia, ContaAlvo } from '@/fonte/contas-tipos'

/**
 * Os grupos da Prioridade no menu de filtros e na ordem: Quente, Fit e Não fit. Quente não é Aderência (ADR 0007):
 * vem dos Sinais válidos da conta. Os dois só se juntam aqui, para ordenar e filtrar.
 */
export type GrupoDaPrioridade = 'quente' | Aderencia

const ORDEM_DO_GRUPO: Record<GrupoDaPrioridade, number> = {
  quente: 1,
  fit: 2,
  'nao-fit': 3,
}
// Sem Aderência nem Sinal válido, a Conta-alvo ainda não foi avaliada: fica depois das Não fit.
const ORDEM_NAO_AVALIADA = 4

/** O grupo da conta: Quente se tiver ao menos um Sinal válido; senão, a Aderência dela. */
export function grupoDaConta(
  conta?: Pick<ContaAlvo, 'aderencia' | 'quente' | 'totalSinaisValidos'>,
): GrupoDaPrioridade | undefined {
  if (!conta) return undefined
  if (conta.quente || (conta.totalSinaisValidos ?? 0) > 0) return 'quente'
  return conta.aderencia
}

/** A posição do grupo na Prioridade: Quente, Fit, Não fit e não avaliada. */
export const posicaoDaAderencia = (grupo?: GrupoDaPrioridade) => (grupo ? ORDEM_DO_GRUPO[grupo] : ORDEM_NAO_AVALIADA)

/** Os grupos, na ordem da Prioridade. */
export const ADERENCIAS = Object.keys(ORDEM_DO_GRUPO) as GrupoDaPrioridade[]

/** Como cada grupo aparece no menu de filtros e nos chips. */
export const ROTULO_ADERENCIA: Record<GrupoDaPrioridade, string> = {
  quente: 'Quente',
  fit: 'Fit',
  'nao-fit': 'Não fit',
}
