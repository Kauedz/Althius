// Os interruptores "confirmar ou automático" e os tetos mensais (creditos-e-planos, ticket 03, ADR-0019): por tipo de
// ação, por Agente e por Integração. A fronteira entre a tela e o banco; a Demonstração usa a implementação simulada.

import type { FonteObservavel } from './tipos'

export type ModoDeAutomacao = 'confirmar' | 'automatico'

/** O que o teto diz de um escopo que roda sozinho: está em confirmar, não tem teto aprovado ou chegou no teto do mês. */
export type BloqueioDoTeto = 'confirmar' | 'sem_teto' | 'teto_atingido'

/**
 * Por que o automático não roda agora: o bloqueio do teto, ou ninguém executa este escopo sozinho ainda (sem_executor:
 * fica travado em confirmar).
 */
export type BloqueioDaAutomacao = BloqueioDoTeto | 'sem_executor'

export interface EscopoDeAutomacao {
  /** "acao:varredura", "acao:enriquecimento", "acao:agentes", "agente:<id>", "rotina:<id>" ou "integracao:<id>". */
  escopo: string
  tipo: 'acao' | 'agente' | 'rotina' | 'integracao'
  nome: string
  modo: ModoDeAutomacao
  /** O teto mensal aprovado, em créditos; sem ele, o automático não roda. */
  teto: number | null
  gastoNoMes: number
  /** Nulo quando o automático roda. */
  bloqueio: BloqueioDaAutomacao | null
}

/** O limite mensal único do Workspace, o do contrato. Ausente nas fontes que ainda tratam um teto por tipo de ação. */
export interface ResumoDoLimite {
  ilimitado: boolean
  /** Nulo no Workspace ilimitado e sem contrato. */
  limite: number | null
  /** Os créditos da faixa. O Administrador não passa daqui. Nulo sem faixa. */
  tetoDaFaixa: number | null
  uso: number
  inativo: boolean
}

export interface FonteDeAutomacao extends FonteObservavel {
  /** Todos os escopos do Workspace, em ordem: tipos de ação, Agentes, Integrações e Rotinas. Todo participante consulta. */
  escopos(): Promise<EscopoDeAutomacao[]>
  /** Liga ou desliga o automático e aprova o teto. Só Administrador; automático sem teto é recusado. */
  salvar(escopo: string, modo: ModoDeAutomacao, teto: number | null): Promise<void>
  /** O limite mensal do contrato e o uso do mês. Ausente quando a fonte não separa esse limite dos tetos. */
  resumoDoLimite?(): Promise<ResumoDoLimite>
  /** Grava o limite mensal do Workspace, até os créditos da faixa. Só Administrador. */
  salvarLimite?(limite: number): Promise<void>
}

export const MOTIVO_DO_BLOQUEIO: Record<BloqueioDaAutomacao, string> = {
  confirmar: 'Cada ação pede confirmação.',
  sem_teto: 'O automático não roda sem um teto mensal aprovado.',
  teto_atingido: 'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.',
  sem_executor: 'Ainda não roda sozinho: cada ação pede confirmação.',
}
