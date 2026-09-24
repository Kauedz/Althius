import type { PerfilFirmografico } from '@/paginas/sinais/perfil'
import type { FonteObservavel } from './tipos'

export type Origem = 'externo' | 'interno' | 'originado'

export type EstadoDoMonitoramento = 'rascunho' | 'em-preparacao' | 'ativo' | 'pausado'

export type ModoDePublico = 'listas' | 'descoberta' | 'ambos'

export interface Publico {
  modo: ModoDePublico
  listas: string[]
  /** Na descoberta, usa o público recomendado das configurações do Cliente; senão, o perfil personalizado. */
  usaRecomendado: boolean
  perfil?: PerfilFirmografico
}

export type Criterios = Record<string, any>

export interface Monitoramento {
  id: string
  tipoId: string
  nome: string
  estado: EstadoDoMonitoramento
  publico: Publico
  criterios: Criterios
  /** Só nos personalizados: o pedido em linguagem livre, a fonte indicada e os critérios preparados. */
  descricao?: string
  fonte?: string
  origem?: Origem
  criteriosLivres?: string[]
}

export interface NovoMonitoramento {
  id?: string
  tipoId: string
  nome: string
  estado?: EstadoDoMonitoramento
  publico?: Publico
  criterios?: Criterios
  descricao?: string
  fonte?: string
  origem?: Origem
  criteriosLivres?: string[]
}

export type Formulario =
  | 'vagas'
  | 'pessoas'
  | 'capital'
  | 'expansao'
  | 'tecnologia'
  | 'noticias'
  | 'eventos'
  | 'reputacao'
  | 'comunidade'
  | 'site'
  | 'historico'
  | 'verificacao'
  | 'seguranca'

export interface Familia {
  id: string
  nome: string
  origem: Origem
  formulario: Formulario
  /** A família aceita descobrir empresas novas por perfil, além de acompanhar listas. */
  descoberta: boolean
}

export interface TipoDeSinal {
  id: string
  nome: string
  descricao: string
  familiaId: string
  formulario?: Formulario
  padroes?: Criterios
}

export interface SinalEncontrado {
  id: string
  contaId: string
  tipoId: string
  monitoramentoId: string
  frase: string
  data: string
  fonte: string
  evidencia: string
  reencontrado?: { data: string; monitoramentoId: string }
}

/**
 * A fronteira de dados do módulo Sinais e Monitoramentos.
 * Operações assíncronas com observador de mudanças (ADR 0003 e ADR 0007).
 */
export interface FonteDeSinais extends FonteObservavel {
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todos os tipos do catálogo de sinais. */
  tipos(): Promise<TipoDeSinal[]>

  /** Busca um tipo de sinal pelo id. Rejeita se não existir. */
  tipo(id: string): Promise<TipoDeSinal>

  /** Lista todos os Monitoramentos. */
  monitoramentos(): Promise<Monitoramento[]>

  /** Lista os Monitoramentos de um tipo específico. */
  monitoramentosDoTipo(tipoId: string): Promise<Monitoramento[]>

  /** Busca um Monitoramento pelo id. Rejeita se não existir. */
  monitoramento(id: string): Promise<Monitoramento>

  /** Salva ou atualiza um Monitoramento (cria se novo, atualiza se existente). */
  salvarMonitoramento(monitoramento: Monitoramento | NovoMonitoramento): Promise<Monitoramento>

  /** Altera o estado de um Monitoramento ('rascunho' | 'em-preparacao' | 'ativo' | 'pausado'). */
  mudarEstado(id: string, estado: EstadoDoMonitoramento): Promise<Monitoramento>

  /** Exclui um Monitoramento. */
  excluirMonitoramento(id: string): Promise<void>

  /** Lista os sinais encontrados da demonstração. */
  sinaisEncontrados(): Promise<SinalEncontrado[]>
}
