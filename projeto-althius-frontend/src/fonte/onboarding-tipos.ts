// Estado do onboarding pós-login e a Fonte que o guarda. Vocabulário do CONTEXT.md.
// Esta fonte é independente das fontes de Agentes, Contas e Sinais. As regras ficam em `regras-onboarding.ts`.

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
export const RAMOS_DE_ONBOARDING = ['criador', 'convidado'] as const

export type RamoDeOnboarding = (typeof RAMOS_DE_ONBOARDING)[number]

export const ETAPAS_DE_ONBOARDING = ['papel', 'empresa', 'dominio', 'hdyhau', 'convite', 'checklist'] as const

export type EtapaDeOnboarding = (typeof ETAPAS_DE_ONBOARDING)[number]

export const SITUACOES_DO_ITEM = ['pendente', 'concluido', 'pulado'] as const

export type SituacaoDoItem = (typeof SITUACOES_DO_ITEM)[number]

/**
 * Os itens do checklist na ordem do Norte. O Contexto da empresa (Empresa, ICP e Personas) substitui o mini-ICP e as
 * Personas do onboarding (contexto-da-empresa 03): ele é gerado pelo site e fica em Configurações.
 */
export const ITENS_DO_CHECKLIST = ['contexto', 'sinal'] as const

export type ItemDoChecklist = (typeof ITENS_DO_CHECKLIST)[number]

/** Workspace do criador. O nome sugere Workspace e Cliente; não é uma Conta-alvo. */
export interface WorkspaceSugerido {
  id: string
  nomeSugerido: string
}

/**
 * O que a pessoa fez em cada item. O Contexto da empresa conta como concluído pela versão vigente dele, não por esta
 * marca: aqui fica só se a pessoa o pulou.
 */
export interface ChecklistNorte {
  contexto: SituacaoDoItem
  sinal: SituacaoDoItem
}

export interface EstadoDeOnboarding {
  /** Nulo até o onboarding começar, no ramo que a entrada indica. */
  ramo: RamoDeOnboarding | null
  etapa: EtapaDeOnboarding
  papel: PapelNoDay0 | null
  /** O nome do Cliente, que o Day0 pede como a empresa. Sugere o nome do Workspace. */
  empresa: string
  dominio: string
  /**
   * O logo resolvido do site: o SVG ou o favicon. Nenhum enquanto ele é resolvido ou quando o site não tem logo;
   * aí vale a inicial do nome.
   */
  logoDoSite: string | null
  /** A pessoa preferiu informar o site depois, em Configurações → Contexto da empresa. */
  sitePulado: boolean
  comoConheceu: OrigemHdyhau | null
  convitePulado: boolean
  workspace: WorkspaceSugerido | null
  checklist: ChecklistNorte
  /** A pessoa abriu Sinais a partir do checklist e ainda pode voltar. */
  retornoAoChecklist: boolean
  /** O wizard já chegou ao checklist uma vez: daí em diante o checklist fica aberto, mesmo voltando a um passo do Day0. */
  day0Concluido: boolean
  concluido: boolean
}

/** Os marcos do progresso do onboarding: o Workspace, o site do Cliente e os três itens do checklist. */
export type MarcoDoOnboarding = 'workspace' | 'site' | ItemDoChecklist

export interface ProgressoDoOnboarding {
  marcos: { marco: MarcoDoOnboarding; feito: boolean }[]
  /** De 0 a 100. Um item pulado não conta: o onboarding só fica completo com tudo preenchido. */
  percentual: number
  /** O primeiro marco que falta, na ordem do Norte. Nenhum quando o onboarding está completo. */
  proximo: MarcoDoOnboarding | null
  /** Com o Day0 feito e abaixo de 100%, a Casca leva de volta ao checklist, mesmo com o onboarding concluído. */
  pendente: boolean
}

/** Como o Workspace criado no onboarding se apresenta na Casca. */
export interface IdentidadeDoWorkspace {
  nome: string
  /** Uma linha sobre o Cliente. Vazia: a descrição fica no Contexto da empresa. */
  descricao: string
  logo: string | null
}

/**
 * Única fronteira de estado do onboarding (wizard Day0 e checklist). A leitura do site não é desta Fonte: ela gera o
 * Contexto da empresa pela `FonteDoContextoDaEmpresa`.
 */
export interface FonteDeOnboarding extends FonteObservavel {
  ler(): Promise<EstadoDeOnboarding>
  /** Começa o onboarding no ramo que a entrada indica. Não troca um ramo já começado. */
  iniciar(ramo: RamoDeOnboarding): Promise<EstadoDeOnboarding>
  /** Reabre o fluxo guardado: com o Day0 concluído, começa no checklist, sem refazer o Day0. */
  retomar(): Promise<EstadoDeOnboarding>
  /** Volta ao passo anterior do wizard, sem apagar nada do que foi preenchido. */
  voltar(): Promise<EstadoDeOnboarding>
  definirPapel(papel: PapelNoDay0): Promise<EstadoDeOnboarding>
  /** O nome do Cliente, que o Day0 pede como a empresa, só sugere o nome do Workspace. Não cria Conta-alvo. */
  definirCliente(nome: string): Promise<EstadoDeOnboarding>
  /** Confirma o domínio do site e, sem esperar, resolve o logo do Workspace. */
  definirDominio(dominio: string): Promise<EstadoDeOnboarding>
  /** Segue sem o site: ele é informado depois, em Configurações → Contexto da empresa. Não bloqueia a entrada. */
  pularSite(): Promise<EstadoDeOnboarding>
  /**
   * Procura o logo do site do domínio (o SVG ou o favicon) sem guardar nada: é a prévia do passo do domínio.
   * Nenhum quando o site não tem logo.
   */
  buscarLogo(dominio: string): Promise<string | null>
  definirComoConheceu(origem: OrigemHdyhau): Promise<EstadoDeOnboarding>
  pularConvite(): Promise<EstadoDeOnboarding>
  /** Segue do passo de convite sem pular. Nenhum e-mail é enviado nem guardado. */
  confirmarConvite(): Promise<EstadoDeOnboarding>
  pularItem(item: ItemDoChecklist): Promise<EstadoDeOnboarding>
  /** Abrir a experiência de Sinais conclui o item 3. Não cria Monitoramento. */
  registrarVisitaASinais(): Promise<EstadoDeOnboarding>
  pedirRetornoAoChecklist(): Promise<EstadoDeOnboarding>
  dispensarRetorno(): Promise<EstadoDeOnboarding>
  concluirOnboarding(): Promise<EstadoDeOnboarding>
  /**
   * Só na demonstração, para smoke test: recomeça o onboarding do zero no outro ramo, como uma entrada nova com ou
   * sem link de convite. Sem login nem Participação no Workspace. Uma Fonte real não oferece a troca.
   */
  trocarRamoDaDemonstracao?(ramo: RamoDeOnboarding): Promise<EstadoDeOnboarding>
}
