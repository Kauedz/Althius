import type { FonteObservavel } from './tipos'

export type EstadoContaDescoberta = 'nova' | 'aceita' | 'descartada'
export type NivelDeEncaixe = 'alto' | 'medio' | 'baixo'

export interface SinalDaCandidata {
  frase: string
  fonte: string
  data?: string
}

export interface ContaDescoberta {
  id: string
  runId?: string
  state: EstadoContaDescoberta
  nome: string
  website?: string
  dominio?: string
  cnpj?: string
  linkedinUrl?: string
  localizacao?: string
  uf?: string
  setor?: string
  tamanho?: string
  funcionarios?: number
  descricao?: string
  tags: string[]
  fitLevel: NivelDeEncaixe
  motivos: string[]
  sinais: SinalDaCandidata[]
  targetAccountId?: string
  decididoPor?: string
  decididoEm?: string
  motivoDescarte?: string
  criadaEm: string
}

export interface CotacaoDaDescoberta {
  creditos: number
  saldoDisponivel: number
  emAndamento: boolean
  estadoDoActor: 'available' | 'testing' | 'none'
  podeTestar: boolean
}

export interface FonteDeDescobertas extends FonteObservavel {
  cotarBusca(maxResults?: number): Promise<CotacaoDaDescoberta>
  buscarContas(args?: { maxResults?: number; allowTesting?: boolean }): Promise<void>
  listarDescobertas(estado?: EstadoContaDescoberta): Promise<ContaDescoberta[]>
  aceitarDescoberta(id: string, url?: string): Promise<{ targetAccountId: string; created: boolean }>
  descartarDescoberta(id: string, motivo?: string): Promise<void>
  restaurarDescoberta(id: string): Promise<void>
}
