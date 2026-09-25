import type { FonteObservavel } from './tipos'

export type StatusSequencia = 'ativa' | 'pausada' | 'reuniao' | 'esgotada'

export type CanalStep =
  | 'email'
  | 'linkedin'
  | 'whatsapp'
  | 'sms'
  | 'ligacao'
  | 'tarefa'

export const CANAIS_SUPORTADOS = ['email', 'linkedin', 'whatsapp'] as const
export type CanalSuportado = (typeof CANAIS_SUPORTADOS)[number]

export function ehCanalSuportado(canal: string): canal is CanalSuportado {
  return (CANAIS_SUPORTADOS as readonly string[]).includes(canal)
}

export type ModoEmail = 'auto' | 'manual'

export type SubtipoLinkedIn = 'convite' | 'mensagem' | 'inmail'

export interface JanelaHorario {
  de: string
  ate: string
}

export interface AnexoStep {
  tipo: 'imagem' | 'video'
  nome: string
  duracao?: string
  /** URL local (blob:) criada via URL.createObjectURL — só persiste na sessão. */
  url?: string
}

export interface MetricasDemoStep {
  aberturas?: number | null
  respondeu?: boolean
  desfecho?: string
}

export interface StepSequencia {
  id: string
  ordem: number
  canal: CanalStep
  contatoId: string
  delayDiasUteis: number
  titulo: string
  assunto?: string
  corpo?: string
  objetivo?: string
  modoEmail?: ModoEmail
  subtipoLinkedIn?: SubtipoLinkedIn
  janela?: JanelaHorario | null
  anexos?: AnexoStep[]
  metricas?: MetricasDemoStep | null
}

export interface Sequencia {
  id: string
  contaId: string
  status: StatusSequencia
  /** False when the active user may see only the shared status projection. */
  responsavel?: boolean
  /** Safe shared count of steps; private step content is only present for the owner. */
  totalSteps?: number
  motivoPause?: string
  participantesIds: string[]
  janelaPadrao: JanelaHorario
  regraDePause: string
  steps: StepSequencia[]
  /** Quantos steps já foram concluídos na demo (índice do próximo step). */
  passoAtual: number
  /** Total de participantes confirmados (calculado pela fonte). */
  totalParticipantes: number
  criadaEm: string
  atualizadaEm?: string
}

export interface NovaSequencia {
  contaId: string
  participantesIds?: string[]
  steps?: StepSequencia[]
  janelaPadrao?: JanelaHorario
  regraDePause?: string
  status?: StatusSequencia
}

export interface AtualizacaoDocumento {
  participantesIds?: string[]
  steps?: StepSequencia[]
  janelaPadrao?: JanelaHorario
  regraDePause?: string
  status?: StatusSequencia
  motivoPause?: string
}

export interface ResumoPublicoSequencia {
  id: string
  contaId: string
  status: StatusSequencia
  totalParticipantes: number
  totalSteps: number
  passoAtual: number
  motivoPause?: string
  atualizadaEm?: string
}

export interface MetricasDemoSequencia {
  sequenciaId: string
  status: StatusSequencia
  coberturaContatos: number
  stepsConcluidos: number
  totalSteps: number
  respostas: number
  reunioes: number
}

/**
 * A fronteira de dados do módulo Sequências.
 * Operações assíncronas com observador de mudanças (ADR 0003).
 */
export interface FonteDeSequencias extends FonteObservavel {
  /** Identifica uma fonte ligada ao backend, sem ações de demonstração. */
  readonly modo?: 'demo' | 'real'
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todas as sequências do Workspace. */
  sequencias(): Promise<Sequencia[]>

  /** Busca uma sequência pelo seu id. Rejeita se não existir. */
  sequencia(id: string): Promise<Sequencia>

  /** Busca a sequência de uma Conta-alvo (zero ou uma). Devolve null se não houver. */
  sequenciaPorConta(contaId: string): Promise<Sequencia | null>

  /** Cria uma nova sequência para uma Conta-alvo. Rejeita se já existir sequência para ela. */
  criarSequencia(nova: NovaSequencia): Promise<Sequencia>

  /** Atualiza o documento de uma sequência (participantes, steps, delays, janela, pause). */
  atualizarDocumento(id: string, atualizacao: AtualizacaoDocumento): Promise<Sequencia>

  /** Confirma ou ajusta os participantes de uma sequência. */
  confirmarParticipantes(id: string, participantesIds: string[]): Promise<Sequencia>

  /** Lê as métricas de demonstração de uma sequência. */
  metricasDeDemo(id: string): Promise<MetricasDemoSequencia | null>

  /** Lê apenas a projeção pública da sequência (sem corpos, assuntos ou anexos privados). */
  resumoPublico(id: string): Promise<ResumoPublicoSequencia | null>
}
