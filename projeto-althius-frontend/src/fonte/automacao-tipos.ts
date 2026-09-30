// Os interruptores "confirmar ou automático" e os tetos mensais (creditos-e-planos, ticket 03, ADR-0019): por tipo de
// ação, por Agente e por Integração. A fronteira entre a tela e o banco; a Demonstração usa a implementação simulada.

import type { FonteObservavel } from './tipos'

export type ModoDeAutomacao = 'confirmar' | 'automatico'

/** Por que o automático não roda agora: está em confirmar, não tem teto aprovado ou chegou no teto do mês. */
export type BloqueioDaAutomacao = 'confirmar' | 'sem_teto' | 'teto_atingido'

export interface EscopoDeAutomacao {
  /** "acao:varredura", "acao:enriquecimento", "acao:agentes", "agente:<id>" ou "integracao:<id>". */
  escopo: string
  tipo: 'acao' | 'agente' | 'integracao'
  nome: string
  modo: ModoDeAutomacao
  /** O teto mensal aprovado, em créditos; sem ele, o automático não roda. */
  teto: number | null
  gastoNoMes: number
  /** Nulo quando o automático roda. */
  bloqueio: BloqueioDaAutomacao | null
}

export interface FonteDeAutomacao extends FonteObservavel {
  /** Todos os escopos do Workspace, em ordem: tipos de ação, Agentes e Integrações. Todo participante consulta. */
  escopos(): Promise<EscopoDeAutomacao[]>
  /** Liga ou desliga o automático e aprova o teto. Só Administrador; automático sem teto é recusado. */
  salvar(escopo: string, modo: ModoDeAutomacao, teto: number | null): Promise<void>
}

export const MOTIVO_DO_BLOQUEIO: Record<BloqueioDaAutomacao, string> = {
  confirmar: 'Cada ação pede confirmação.',
  sem_teto: 'O automático não roda sem um teto mensal aprovado.',
  teto_atingido: 'Chegou no teto do mês: o automático está pausado até o mês virar ou o teto subir.',
}
