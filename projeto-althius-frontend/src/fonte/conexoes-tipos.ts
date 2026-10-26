import type {
  CanalId,
  CategoriaDeIntegracao,
  FonteObservavel,
  IntegracaoFutura,
  IntegracaoId,
  PreviaDeCanal,
} from './tipos'

export type EstadoDeIntegracao = 'em_breve' | 'nao_habilitada' | 'habilitada'
/** `retirado`: o Canal já foi instalado e um Administrador o retirou; reinstalar só no mesmo app (Slack). */
export type EstadoDeCanal = 'em_breve' | 'conectado' | 'nao_conectado' | 'retirado'

export interface ItemDeCanal {
  id: CanalId
  nome: string
  descricao: string
  estado: EstadoDeCanal
  conectado: boolean
  /** O adaptador pode receber habilitação nova; o estado atual pode continuar visível sem ele. */
  habilitarDisponivel?: boolean
  /** Onde o Canal está instalado (o nome do workspace Slack). */
  instaladoEm?: string
}

export interface ItemDeIntegracao {
  id: IntegracaoId
  nome: string
  categoria: CategoriaDeIntegracao
  descricao: string
  escreve: boolean
  estado: EstadoDeIntegracao
  habilitada: boolean
  habilitadaEm?: string
  habilitadaPor?: string
  appPortal?: string
}

/** Como o participante conecta o próprio Acesso: autorizando no app (OAuth no servidor MCP) ou colando uma chave de API. */
export type CaminhoDeConexao = 'autorizacao' | 'chave'

export type EstadoDoAcesso = 'conectado' | 'precisa_reconectar' | 'desconectado'

/** O Acesso do próprio participante a uma Integração habilitada, sem token nem chave (ADR-0017). */
export interface AcessoDaIntegracao {
  integracaoId: IntegracaoId
  estado: EstadoDoAcesso
  caminho?: CaminhoDeConexao
  /** A conta do app com que a pessoa entrou. */
  conta?: string
  falha?: string
  /** Quantos participantes ativos do Workspace já conectaram. */
  conectados: number
  /** Os caminhos que esta Integração aceita. */
  caminhos: CaminhoDeConexao[]
}

/** Uma ferramenta que o servidor da Integração oferece aos Agentes. `escreve` marca as que escrevem ou gastam. */
export interface FerramentaDaIntegracao {
  nome: string
  descricao: string
  escreve: boolean
}

/**
 * A permissão de uma ferramenta do conector no Workspace, decidida pelo Administrador (ADR-0022): sempre permitir, pedir
 * Aprovação ou bloquear. Sem decisão, vale o padrão: leitura sempre, escrita ou gasto pede Aprovação.
 */
export type RegraDaFerramenta = 'sempre' | 'aprovacao' | 'bloqueada'

/** A regra que vale para a ferramenta: a decidida ou o padrão. */
export function regraDaFerramenta(
  regras: Partial<Record<string, RegraDaFerramenta>>,
  ferramenta: Pick<FerramentaDaIntegracao, 'nome' | 'escreve'>,
): RegraDaFerramenta {
  return regras[ferramenta.nome] ?? (ferramenta.escreve ? 'aprovacao' : 'sempre')
}

export type CanalDeConexao = ItemDeCanal
export type IntegracaoDeConexao = ItemDeIntegracao

/**
 * A fronteira da tela Conexões: Canais e Integrações, com os estados reais de cada um no Workspace.
 * Na Demonstração, a implementação simulada preserva o comportamento anterior. No Workspace operacional,
 * a implementação real lê do Supabase e reflete a habilitação por Administradores.
 */
export interface FonteDeConexoes extends FonteObservavel {
  canais(): Promise<ItemDeCanal[]>
  integracoes(): Promise<ItemDeIntegracao[]>
  integracoesFuturas(): Promise<IntegracaoFutura[]>
  resultadosDeRetirada?(): Promise<{ integracaoId: IntegracaoId; resultado: 'revogado' | 'nao_suportado' | 'falhou' | 'nao_se_aplica' }[]>
  /** Desabilita a Integração para todos os participantes; exige Administrador ativo. */
  desabilitarIntegracao?(id: IntegracaoId): Promise<{ revogado: number; naoSuportado: number; falhou: number; naoSeAplica: number } | void>
  habilitarIntegracao(id: IntegracaoId): Promise<void>
  conectar(conexao: CanalId | IntegracaoId): Promise<void>
  previaDeCanal(canalId: CanalId): Promise<PreviaDeCanal>
  /** O Acesso do próprio participante em cada Integração habilitada. Ausente: o Workspace ainda não conecta Acessos. */
  acessos?(): Promise<AcessoDaIntegracao[]>
  /** Abre a autorização no app e devolve o endereço de consentimento para o navegador ir. */
  conectarPorAutorizacao?(id: IntegracaoId): Promise<string>
  /** Valida a chave de API no app e guarda no backend; a chave nunca volta ao navegador. */
  conectarPorChave?(id: IntegracaoId, chave: string): Promise<void>
  /**
   * Desconecta só o próprio Acesso e revoga o token no app quando dá. `revogacaoFalhou`: a Althius desconectou, mas não
   * conseguiu confirmar a revogação no app.
   */
  desconectarAcesso?(id: IntegracaoId): Promise<{ revogacaoFalhou: boolean }>
  /** Abre a instalação do Canal no app e devolve o endereço para o navegador ir; exige Administrador ativo. */
  instalarCanal?(id: CanalId): Promise<string>
  /** Habilita o WhatsApp no Workspace; o simulador do adaptador já está disponível em desenvolvimento. */
  habilitarCanal?(id: CanalId): Promise<void>
  /** Retira o Canal: o app para de responder e nada é apagado; exige Administrador ativo. */
  retirarCanal?(id: CanalId): Promise<void>
  /** As ferramentas que o servidor da Integração oferece, lidas com o próprio Acesso. */
  ferramentas?(id: IntegracaoId): Promise<FerramentaDaIntegracao[]>
  /** As regras decididas para as ferramentas da Integração; a que não consta segue o padrão. */
  regrasDasFerramentas?(id: IntegracaoId): Promise<Partial<Record<string, RegraDaFerramenta>>>
  /** O Administrador decide a regra de uma ferramenta; nulo volta ao padrão. */
  definirRegraDaFerramenta?(id: IntegracaoId, ferramenta: string, regra: RegraDaFerramenta | null): Promise<void>
}
