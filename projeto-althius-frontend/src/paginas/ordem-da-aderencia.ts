import type { Aderencia } from '@/fonte/contas-tipos'

const ORDEM_ADERENCIA: Record<Aderencia, number> = {
  quente: 1,
  fit: 2,
  'nao-fit': 3,
}
// Sem Aderência, a Conta-alvo ainda não foi avaliada: fica depois das Não fit.
const ORDEM_NAO_AVALIADA = 4

/** A posição do grupo da Aderência na Prioridade: Quente, Fit, Não fit e não avaliada. */
export const posicaoDaAderencia = (aderencia?: Aderencia) => (aderencia ? ORDEM_ADERENCIA[aderencia] : ORDEM_NAO_AVALIADA)

/** As Aderências, na ordem de grupos da Prioridade. */
export const ADERENCIAS = Object.keys(ORDEM_ADERENCIA) as Aderencia[]
