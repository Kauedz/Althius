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

/** Os itens do checklist na ordem do Norte. */
export const ITENS_DO_CHECKLIST = ['produto', 'persona', 'sinal'] as const

export type ItemDoChecklist = (typeof ITENS_DO_CHECKLIST)[number]

/** Workspace do criador. O nome sugere Workspace e Cliente; não é uma Conta-alvo. */
export interface WorkspaceSugerido {
  id: string
  nomeSugerido: string
}

/** O item 1 do checklist: o mini-ICP e a lógica curta de produto, que a leitura do site sugere. */
export interface MiniIcpEProduto {
  miniIcp: string
  oQueVende: string
  porQueCompram: string
  setor?: string
  porte?: string
  regiao?: string
}

export const CAMPOS_DO_MINI_ICP_E_PRODUTO = ['miniIcp', 'oQueVende', 'porQueCompram'] as const satisfies readonly (keyof MiniIcpEProduto)[]

/**
 * A leitura mínima do site do Cliente, a única IA do onboarding: o que ele vende, o ICP provável e as
 * Personas possíveis, considerando para quem ele vende. É só uma base editável para os itens 1 e 2.
 */
export interface LeituraDoSite extends MiniIcpEProduto {
  personas: string[]
}

export const SITUACOES_DA_LEITURA = ['inativa', 'lendo', 'pronta', 'falhou'] as const

export type SituacaoDaLeitura = (typeof SITUACOES_DA_LEITURA)[number]

export interface EstadoDaLeitura {
  situacao: SituacaoDaLeitura
  /** A última leitura que chegou. Serve para saber quais campos ainda são só a sugestão dela. */
  resultado: LeituraDoSite | null
}

export interface ChecklistNorte extends MiniIcpEProduto {
  setor?: string
  porte?: string
  regiao?: string
  /**
   * As Personas possíveis do Workspace, uma por item. São uma base do onboarding: não mudam as definições de
   * Personas da Memória do Workspace e não são a Persona de um Contato.
   */
  personas: string[]
  produto: SituacaoDoItem
  persona: SituacaoDoItem
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
  leitura: EstadoDaLeitura
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
  /** O que o Cliente vende, do item 1 do checklist. Vazio enquanto ninguém o preencheu. */
  descricao: string
  logo: string | null
}

/**
 * Única fronteira de estado do onboarding (wizard Day0, leitura do site e checklist).
 * A UI nunca chama um modelo: a leitura do site só acontece por `lerSite`.
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
  /** Confirma o domínio do site e, sem esperar, resolve o logo do Workspace e começa a leitura do site. */
  definirDominio(dominio: string): Promise<EstadoDeOnboarding>
  /**
   * Procura o logo do site do domínio (o SVG ou o favicon) sem guardar nada: é a prévia do passo do domínio.
   * Nenhum quando o site não tem logo.
   */
  buscarLogo(dominio: string): Promise<string | null>
  /**
   * A leitura do site: recebe o domínio e devolve o que a empresa vende, o ICP provável e as Personas possíveis.
   * Só lê o domínio confirmado no Day0 do criador. A leitura pré-preenche os itens 1 e 2 por `aplicarLeitura`,
   * sem sobrescrever o que a pessoa editou. Devolve nenhuma quando falha, quando uma leitura mais nova a
   * substitui ou quando o domínio não é o confirmado; uma falha só deixa os campos como estão.
   */
  lerSite(dominio: string): Promise<LeituraDoSite | null>
  definirComoConheceu(origem: OrigemHdyhau): Promise<EstadoDeOnboarding>
  pularConvite(): Promise<EstadoDeOnboarding>
  /** Segue do passo de convite sem pular. Nenhum e-mail é enviado nem guardado. */
  confirmarConvite(): Promise<EstadoDeOnboarding>
  salvarProduto(campos: MiniIcpEProduto): Promise<EstadoDeOnboarding>
  salvarPersonas(personas: readonly string[]): Promise<EstadoDeOnboarding>
  concluirProduto(): Promise<EstadoDeOnboarding>
  concluirPersona(): Promise<EstadoDeOnboarding>
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
