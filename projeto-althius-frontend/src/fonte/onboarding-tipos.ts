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

export const ORIGENS_HDYHAU = [
  'Google Ads',
  'Meta Ads',
  'Instagram',
  'LinkedIn',
  'YouTube',
  'X',
  'TikTok',
  'Influenciador',
  'Indicação',
  'Evento',
  'Podcast',
  'Busca no Google',
  'Outro',
] as const

export type OrigemHdyhau = (typeof ORIGENS_HDYHAU)[number]

/** Criador por padrão. Convidado só quando a pessoa chega por um link de convite. */
export type RamoDeOnboarding = 'criador' | 'convidado'

export type EtapaDeOnboarding = 'papel' | 'empresa' | 'dominio' | 'hdyhau' | 'convite' | 'checklist'

/** Os passos do wizard em ordem. O convidado não informa empresa nem domínio do site. */
export const ETAPAS_DO_RAMO: Record<RamoDeOnboarding, readonly EtapaDeOnboarding[]> = {
  criador: ['papel', 'empresa', 'dominio', 'hdyhau', 'convite', 'checklist'],
  convidado: ['papel', 'hdyhau', 'convite', 'checklist'],
}

/** Os passos do ramo, ou nenhum antes de o onboarding começar. */
export function etapasDoRamo(ramo: RamoDeOnboarding | null): readonly EtapaDeOnboarding[] {
  return ramo ? ETAPAS_DO_RAMO[ramo] : []
}

export type SituacaoDoItem = 'pendente' | 'concluido' | 'pulado'

export type ItemDoChecklist = 'produto' | 'persona' | 'sinal'

/** Workspace do criador. O nome sugere Workspace e Cliente; não é uma Conta-alvo. */
export interface WorkspaceSugerido {
  id: string
  nomeSugerido: string
}

/**
 * A leitura mínima do site do Cliente, a única IA do onboarding: o que ele vende, o ICP provável e as
 * Personas possíveis, considerando para quem ele vende. É só uma base editável para os itens 1 e 2.
 */
export interface LeituraDoSite {
  oQueVende: string
  miniIcp: string
  porQueCompram: string
  personas: string[]
}

export type SituacaoDaLeitura = 'inativa' | 'lendo' | 'pronta' | 'falhou'

export interface EstadoDaLeitura {
  situacao: SituacaoDaLeitura
  /** A última leitura que chegou. Serve para saber quais campos ainda são só a sugestão dela. */
  resultado: LeituraDoSite | null
}

export interface ChecklistNorte {
  miniIcp: string
  oQueVende: string
  porQueCompram: string
  /** Personas possíveis do Workspace, uma por linha. Não é a Persona de um Contato. */
  personas: string
  produto: SituacaoDoItem
  persona: SituacaoDoItem
  sinal: SituacaoDoItem
}

export interface EstadoDeOnboarding {
  /** Nulo até o onboarding começar, no ramo que a entrada indica. */
  ramo: RamoDeOnboarding | null
  etapa: EtapaDeOnboarding
  papel: PapelNoDay0 | null
  /** Nome do Cliente. Sugere o nome do Workspace. */
  empresa: string
  dominio: string
  /** Endereços do logo do site em ordem de preferência (SVG, depois favicon). Sem nenhum, vale a inicial do nome. */
  logoDoSite: string[]
  leitura: EstadoDaLeitura
  comoConheceu: OrigemHdyhau | null
  convitePulado: boolean
  workspace: WorkspaceSugerido | null
  checklist: ChecklistNorte
  /** A pessoa abriu Sinais a partir do checklist e ainda pode voltar. */
  retornoAoChecklist: boolean
  concluido: boolean
}

/**
 * A Casca exige o Day0: enquanto o wizard não chega ao checklist, a entrada leva a `/onboarding`. O checklist
 * não prende a sessão, que pode explorar a Casca e voltar a ele depois.
 */
export function precisaDoOnboarding(estado: EstadoDeOnboarding): boolean {
  return !estado.concluido && estado.etapa !== 'checklist'
}

export interface ProdutoDoChecklist {
  miniIcp: string
  oQueVende: string
  porQueCompram: string
}

/**
 * Única fronteira de estado do onboarding (wizard Day0, leitura do site e checklist).
 * A UI nunca chama um modelo: a leitura do site só acontece por `lerSite`.
 */
export interface FonteDeOnboarding extends FonteObservavel {
  ler(): Promise<EstadoDeOnboarding>
  /** Começa o onboarding no ramo que a entrada indica. Não troca um ramo já começado. */
  iniciar(ramo: RamoDeOnboarding): Promise<EstadoDeOnboarding>
  /** Volta ao passo anterior do wizard, sem apagar nada do que foi preenchido. */
  voltar(): Promise<EstadoDeOnboarding>
  definirPapel(papel: PapelNoDay0): Promise<EstadoDeOnboarding>
  /** A empresa só sugere o nome do Workspace e do Cliente. Não cria Conta-alvo. */
  definirEmpresa(nome: string): Promise<EstadoDeOnboarding>
  /** Confirma o domínio do site, resolve o logo e começa a leitura do site sem esperar por ela. */
  definirDominio(dominio: string): Promise<EstadoDeOnboarding>
  /**
   * Lê o site do domínio confirmado e pré-preenche os itens 1 e 2. Nunca sobrescreve o que a pessoa editou.
   * Uma falha só deixa os campos como estão.
   */
  lerSite(): Promise<EstadoDeOnboarding>
  definirComoConheceu(origem: OrigemHdyhau): Promise<EstadoDeOnboarding>
  pularConvite(): Promise<EstadoDeOnboarding>
  /** Segue do passo de convite sem pular. Nenhum e-mail é enviado nem guardado. */
  confirmarConvite(): Promise<EstadoDeOnboarding>
  salvarProduto(campos: ProdutoDoChecklist): Promise<EstadoDeOnboarding>
  salvarPersonas(personas: string): Promise<EstadoDeOnboarding>
  concluirProduto(): Promise<EstadoDeOnboarding>
  concluirPersona(): Promise<EstadoDeOnboarding>
  pularItem(item: ItemDoChecklist): Promise<EstadoDeOnboarding>
  /** Abrir a experiência de Sinais conclui o item 3. Não cria Monitoramento. */
  registrarVisitaASinais(): Promise<EstadoDeOnboarding>
  pedirRetornoAoChecklist(): Promise<EstadoDeOnboarding>
  dispensarRetorno(): Promise<EstadoDeOnboarding>
  concluirOnboarding(): Promise<EstadoDeOnboarding>
}
