import type {
  CanalId,
  CategoriaDeIntegracao,
  FonteObservavel,
  IntegracaoFutura,
  IntegracaoId,
  PreviaDeCanal,
} from './tipos'

export type EstadoDeIntegracao = 'em_breve' | 'nao_habilitada' | 'habilitada'
export type EstadoDeCanal = 'em_breve' | 'conectado' | 'nao_conectado'

export interface ItemDeCanal {
  id: CanalId
  nome: string
  descricao: string
  estado: EstadoDeCanal
  conectado: boolean
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
  habilitarIntegracao(id: IntegracaoId): Promise<void>
  conectar(conexao: CanalId | IntegracaoId): Promise<void>
  previaDeCanal(canalId: CanalId): Promise<PreviaDeCanal>
}
