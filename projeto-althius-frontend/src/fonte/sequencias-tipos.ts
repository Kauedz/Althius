import type { FonteObservavel } from './tipos'

export type StatusSequencia = 'ativa' | 'pausada' | 'reuniao' | 'esgotada' | 'encerrada'

/** Por que o sistema encerrou a Sequência: o responsável da Conta mudou (Transferência) ou a Conta foi apagada. */
export type MotivoDeEncerramento = 'transferencia' | 'exclusao'

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
  /**
   * Qual e-mail (passo de E-mail) ou telefone (WhatsApp) do Contato o passo usa, de 1 a 3: 1 é o principal e ausente
   * vale 1. A confirmação fixa o endereço dessa posição (ADR-0014).
   */
  destino?: number
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
  /** Só numa Sequência encerrada: o histórico fica, e a Conta pode ter outra Sequência em andamento. */
  encerradaPor?: MotivoDeEncerramento
  /** A Conta-alvo está arquivada: a Sequência fica pausada e só volta a ser retomada depois de restaurar a Conta. */
  pausadaPelaConta?: boolean
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
  encerradaPor?: MotivoDeEncerramento
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

/** A situação de um Envio do passo, como o backend a guarda. */
export type StatusDoEnvio =
  | 'waiting'
  | 'scheduled'
  | 'confirmed'
  | 'awaiting_reconfirmation'
  | 'sending'
  | 'sent'
  | 'uncertain'
  | 'failed'
  | 'bounced'
  | 'cancelled'

/** O Envio de um passo de E-mail: o Destino fixado na confirmação e o que o provedor respondeu. */
export interface EnvioDoPasso {
  id: string
  stepId: string
  contatoId: string
  destino: string
  status: StatusDoEnvio
  confirmadoEm: string
  enviadoEm?: string
  ultimoErro?: string
  /** Automático (sai pelo Executor) ou manual (espera o envio explícito do titular). Só num passo de versão ativada. */
  modo?: 'auto' | 'manual'
  /** Quando o passo sai (automático) ou fica pronto para o titular enviar (manual). */
  programadoPara?: string
}

/** A versão autorizada mais recente dos envios da sequência (canais-05). */
export interface AutorizacaoDosEnvios {
  versao: number
  autorizadaEm: string
  ativa: boolean
  /**
   * Por que deixou de valer: um passo pendente foi editado, uma nova ativação a substituiu ou o sistema a revogou (a
   * responsabilidade da Conta foi transferida, ou a Conta foi arquivada ou apagada).
   */
  motivoDaRevogacao?: 'edited' | 'reactivated' | 'responsibility_transferred' | 'account_archived' | 'account_deleted'
}

/**
 * O que o backend respondeu a "Ativar envios". `activated` traz o passo programado (se houver); os outros valores são
 * bloqueios com o passo que os causou, e a tela mostra a `mensagem`.
 */
export interface ResultadoDaAtivacao {
  outcome: string
  stepId?: string
  versao?: number
  programadoPara?: string
  mensagem?: string
}

/**
 * O que o backend respondeu a um pedido de envio. `sent`, `failed` e `uncertain` são o resultado do provedor; os
 * outros valores são bloqueios com motivo (ex.: `sender_not_ready`, `destination_changed`, `reply_found`), e a tela
 * mostra a `mensagem` que veio com eles.
 */
export interface ResultadoDoEnvio {
  outcome: string
  mensagem?: string
}

export interface AnexoRecebido {
  id: string
  nome: string
  mime?: string
  tamanho?: number
  status: 'pending' | 'stored' | 'failed'
}

/** Uma resposta do Contato guardada pela Althius; só o Responsável pela Sequência a lê. */
export interface RespostaRecebida {
  interacaoId: string
  sequenciaId: string
  envioId?: string
  contatoId?: string
  de: { email?: string; nome?: string }
  assunto?: string
  corpo?: string
  recebidaEm: string
  anexos: AnexoRecebido[]
}

/**
 * A fronteira de dados do módulo Sequências.
 * Operações assíncronas com observador de mudanças (ADR 0003).
 */
export interface FonteDeSequencias extends FonteObservavel {
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todas as sequências do Workspace. */
  sequencias(): Promise<Sequencia[]>

  /** Busca uma sequência pelo seu id. Rejeita se não existir. */
  sequencia(id: string): Promise<Sequencia>

  /**
   * Busca a sequência de uma Conta-alvo: a em andamento (no máximo uma) ou, se só houver encerradas, a mais recente.
   * Devolve null se não houver.
   */
  sequenciaPorConta(contaId: string): Promise<Sequencia | null>

  /**
   * Cria uma nova sequência para uma Conta-alvo. Rejeita se já existir uma em andamento para ela ou se quem chama não
   * for o Vendedor responsável pela Conta. Depois de uma Transferência de responsabilidade, o novo responsável cria a dele.
   */
  criarSequencia(nova: NovaSequencia): Promise<Sequencia>

  /** Atualiza o documento de uma sequência (participantes, steps, delays, janela, pause). */
  atualizarDocumento(id: string, atualizacao: AtualizacaoDocumento): Promise<Sequencia>

  /** Confirma ou ajusta os participantes de uma sequência. */
  confirmarParticipantes(id: string, participantesIds: string[]): Promise<Sequencia>

  /** Lê as métricas de demonstração de uma sequência. */
  metricasDeDemo(id: string): Promise<MetricasDemoSequencia | null>

  /** Lê apenas a projeção pública da sequência (sem corpos, assuntos ou anexos privados). */
  resumoPublico(id: string): Promise<ResumoPublicoSequencia | null>

  /** Os Envios dos passos da sequência. Só o Responsável pela Sequência os vê; os demais recebem uma lista vazia. */
  envios(sequenciaId: string): Promise<EnvioDoPasso[]>

  /** Confirma um passo de E-mail: fixa o e-mail atual do Contato como Destino. Rejeita passos de outro canal. */
  confirmarPasso(sequenciaId: string, stepId: string): Promise<EnvioDoPasso>

  /** Pede ao backend o envio de um passo confirmado. Um bloqueio volta como resultado, não como erro. */
  enviarPasso(sequenciaId: string, envioId: string): Promise<ResultadoDoEnvio>

  /** As respostas recebidas da sequência, com conteúdo. Só para o Responsável pela Sequência. */
  respostasRecebidas(sequenciaId: string): Promise<RespostaRecebida[]>

  /** Um endereço temporário para abrir um anexo recebido. Só para o Responsável pela Sequência. */
  urlDoAnexo(interacaoId: string, anexoId: string): Promise<string>

  /** A autorização mais recente dos envios automáticos, ou null quando nunca foram ativados. Só para o Responsável. */
  autorizacao(sequenciaId: string): Promise<AutorizacaoDosEnvios | null>

  /** Ativa os envios: autoriza o documento atual e programa o próximo passo. Um bloqueio volta como resultado. */
  ativarEnvios(sequenciaId: string): Promise<ResultadoDaAtivacao>

  /** Resolve um envio incerto que o provedor não confirmou: o titular diz se ele saiu. */
  resolverIncerto(sequenciaId: string, stepId: string, saiu: boolean): Promise<void>
}
