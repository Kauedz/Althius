// Estado do onboarding pós-login. Vocabulário do CONTEXT.md.
// Esta fonte é independente das fontes de Agentes, Contas e Sinais.

import type { FonteObservavel } from './tipos'

export const PAPEIS_DO_DAY0 = [
  'Founder',
  'Head de Vendas',
  'SDR/BDR',
  'AE',
  'Marketing',
  'RevOps',
  'Outro',
] as const

export type PapelNoDay0 = (typeof PAPEIS_DO_DAY0)[number]

export const ORIGENS_HDYHAU = ['Indicação', 'LinkedIn', 'Busca', 'Evento', 'Conteúdo', 'Outro'] as const

export type OrigemHdyhau = (typeof ORIGENS_HDYHAU)[number]

export type RamoDeOnboarding = 'criador' | 'convidado'

export type EtapaDeOnboarding = 'ramo' | 'papel' | 'empresa' | 'hdyhau' | 'convite' | 'checklist'

export type SituacaoDoItem = 'pendente' | 'concluido' | 'pulado'

export type ItemDoChecklist = 'produto' | 'persona' | 'sinal'

/** Workspace do criador. O nome sugere Workspace e Cliente; não é uma Conta-alvo. */
export interface WorkspaceSugerido {
  id: string
  nomeSugerido: string
}

export interface ChecklistNorte {
  miniIcp: string
  oQueVende: string
  porQueCompram: string
  produto: SituacaoDoItem
  persona: SituacaoDoItem
  sinal: SituacaoDoItem
}

export interface EstadoDeOnboarding {
  etapa: EtapaDeOnboarding
  ramo: RamoDeOnboarding | null
  papel: PapelNoDay0 | null
  empresa: string
  comoConheceu: OrigemHdyhau | null
  convitePulado: boolean
  workspace: WorkspaceSugerido | null
  checklist: ChecklistNorte
  /** A pessoa abriu Sinais a partir do checklist e ainda pode voltar. */
  retornoAoChecklist: boolean
}

export interface ProdutoDoChecklist {
  miniIcp: string
  oQueVende: string
  porQueCompram: string
}

/**
 * Única fronteira de estado do onboarding (wizard Day0 + checklist).
 * A implementação simulada não chama rede, auth nem IA.
 */
export interface FonteDeOnboarding extends FonteObservavel {
  ler(): Promise<EstadoDeOnboarding>
  escolherRamo(ramo: RamoDeOnboarding): Promise<EstadoDeOnboarding>
  definirPapel(papel: PapelNoDay0): Promise<EstadoDeOnboarding>
  definirEmpresa(empresa: string): Promise<EstadoDeOnboarding>
  definirComoConheceu(origem: OrigemHdyhau): Promise<EstadoDeOnboarding>
  pularConvite(): Promise<EstadoDeOnboarding>
  salvarProduto(campos: ProdutoDoChecklist): Promise<EstadoDeOnboarding>
  concluirProduto(): Promise<EstadoDeOnboarding>
  concluirPersona(): Promise<EstadoDeOnboarding>
  pularItem(item: ItemDoChecklist): Promise<EstadoDeOnboarding>
  /** Abrir a experiência de Sinais conclui o item 3. Não cria Monitoramento. */
  registrarVisitaASinais(): Promise<EstadoDeOnboarding>
  pedirRetornoAoChecklist(): Promise<EstadoDeOnboarding>
  dispensarRetorno(): Promise<EstadoDeOnboarding>
}
