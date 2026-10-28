import type { AjusteAprendido, CodigoDoDescarte } from './aprendizado-da-descoberta'
import type { FonteObservavel } from './tipos'
export interface CriteriosDaBusca {
  fonte: 'linkedin' | 'receita'
  setores: string[]
  palavrasChave: string[]
  portes: string[]
  regioes: string[]
  tecnologias: string[]
  excluir: string[]
  cnaes: string[]
  [campo: string]: unknown
}

export function criteriosDaBuscaVazios(): CriteriosDaBusca {
  return { fonte: 'linkedin', setores: [], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] }
}

export type EstadoContaDescoberta = 'nova' | 'aceita' | 'descartada'
export type NivelDeEncaixe = 'alto' | 'medio' | 'baixo' | 'sem_dado'
/** De onde a candidata veio: da busca pelo ICP, de um Sinal ou da sincronização com o CRM (ainda sem dado). */
export type OrigemDaDescoberta = 'busca' | 'sinal' | 'sincronizacao'
/** O que o aceite diz sobre o Comitê: `liberado` quando o saldo e o limite do mês permitem enriquecer agora. */
export type SituacaoDoComite = 'liberado' | 'sem_saldo' | 'limite_do_mes' | 'sem_contrato'

export interface SinalDaCandidata {
  frase: string
  fonte: string
  data?: string
}

/** Um Sinal que trouxe a candidata para a Caixa, já em linguagem de usuário: sem fornecedor nem dado pessoal. */
export interface SinalDoMotivo {
  id: string
  tipo: string
  frase: string
  fonte?: string
  data: string
  /** O Sinal ainda vale (30 dias). */
  valido: boolean
  /** Veio de um Sinal de mercado com o CNPJ da empresa. */
  mercado: boolean
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
  origem: OrigemDaDescoberta
  /** Os Sinais reais que a trouxeram, do mais recente ao mais antigo. */
  motivosDeSinal: SinalDoMotivo[]
  /** Quando a candidata voltou para Novas por um Sinal novo, depois de 90 dias do descarte. */
  voltouPorSinalEm?: string
  /** O motivo do descarte que valia antes de ela voltar. */
  motivoDoDescarteAnterior?: string
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

export interface ResultadoDoAceite {
  targetAccountId: string
  created: boolean
  /** Quantos Sinais da candidata passaram a ser da Conta. */
  sinaisMigrados: number
  comite: SituacaoDoComite
}

export interface FonteDeDescobertas extends FonteObservavel {
  cotarBusca(maxResults?: number): Promise<CotacaoDaDescoberta>
  criteriosDaBusca(): Promise<{ temIcp: boolean; icpVersion: number | null; icpResumo: string; criterios: CriteriosDaBusca }>
  buscarContas(args: { criterios: CriteriosDaBusca; icpVersion: number | null; maxResults?: number; allowTesting?: boolean }): Promise<void>
  listarDescobertas(estado?: EstadoContaDescoberta): Promise<ContaDescoberta[]>
  aceitarDescoberta(id: string, url?: string): Promise<ResultadoDoAceite>
  descartarDescoberta(id: string, motivo?: string, codigo?: CodigoDoDescarte): Promise<void>
  /** O que a Descoberta aprendeu com os aceites e descartes do Workspace (feedback-que-ensina). */
  aprendizado?(): Promise<AjusteAprendido[]>
  /** Desfaz um ajuste ou, sem argumentos, recomeça o aprendizado. Só Administrador. */
  desfazerAprendizado?(ajuste?: Pick<AjusteAprendido, 'dimensao' | 'valor'>): Promise<void>
  restaurarDescoberta(id: string): Promise<void>
}
