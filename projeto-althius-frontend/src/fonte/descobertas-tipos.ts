import type { ExplicacaoDeAderencia } from './aderencia-explicada'
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

// A busca pelo Contexto da empresa (contexto-da-empresa, ticket 04): o servidor lê o Perfil de cliente ideal vigente e
// devolve um recorte por perfil, cada critério ligado ao trecho do texto, e o que a fonte não aplica.

/** Setor, modelo de negócio, funcionários, porte cadastral e faturamento são coisas diferentes; sede e atuação também. */
export type ConceitoDoContexto =
  | 'setor'
  | 'modeloDeNegocio'
  | 'funcionarios'
  | 'porteCadastral'
  | 'faturamento'
  | 'sede'
  | 'atuacao'
  | 'cnae'
  | 'palavraChave'
  | 'tecnologia'
  | 'excluir'

export const NOMES_DOS_CONCEITOS: Record<ConceitoDoContexto, string> = {
  setor: 'Setor',
  modeloDeNegocio: 'Modelo de negócio',
  funcionarios: 'Funcionários',
  porteCadastral: 'Porte cadastral',
  faturamento: 'Faturamento',
  sede: 'Sede',
  atuacao: 'Atuação',
  cnae: 'CNAE',
  palavraChave: 'Palavra-chave',
  tecnologia: 'Tecnologia',
  excluir: 'Excluir',
}

export interface CriterioDoContexto {
  conceito: ConceitoDoContexto
  valor: string
  /** O trecho do Perfil de cliente ideal de onde o critério saiu. */
  trecho: string
}

export type MotivoDaPendencia = 'sem_suporte_na_fonte' | 'ambiguo' | 'faixa_aproximada' | 'local_desconhecido' | 'valor_invalido'

export interface CriterioPendente extends CriterioDoContexto {
  motivo: MotivoDaPendencia
  explicacao: string
}

export interface PerfilDaBusca {
  nome: string
  criterios: CriteriosDaBusca
  aplicados: CriterioDoContexto[]
  pendentes: CriterioPendente[]
}

export interface PreparacaoDaBusca {
  /** `sem_contexto`: não há Perfil de cliente ideal salvo; `falha_traducao`: a leitura do texto falhou. */
  estado: 'pronta' | 'sem_contexto' | 'falha_traducao'
  contextoVersao: number | null
  fonte: 'linkedin' | 'receita'
  perfis: PerfilDaBusca[]
  mensagem?: string
}

/** O desfecho da busca mais recente. Sem resultados não é falha, e nenhum dos dois prova que o mercado não existe. */
export type DesfechoDaBusca = 'em_andamento' | 'com_resultados' | 'sem_resultados' | 'falha_da_fonte'

export interface UltimaBuscaDeContas {
  desfecho: DesfechoDaBusca
  encontradas: number
  novas: number
  /** A mensagem da fonte (falha ou falha parcial), já sem nome de fornecedor. */
  mensagem?: string
  /** A versão do Contexto da empresa da qual os filtros saíram; nula para filtros avulsos. */
  contextoVersao: number | null
  perfis: string[]
}

/** Uma recusa da busca com o código do servidor (por exemplo, `contexto_mudou`). */
export class ErroDaBuscaDeContas extends Error {
  readonly codigo?: string
  constructor(message: string, codigo?: string) {
    super(message)
    this.name = 'ErroDaBuscaDeContas'
    this.codigo = codigo
  }
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
  /** Os filtros derivados do Contexto da empresa vigente, um recorte por perfil. */
  prepararBusca?(): Promise<PreparacaoDaBusca>
  /** Roda a busca com os perfis ajustados na tela. Recusa com `contexto_mudou` se o contexto mudou desde a preparação. */
  buscarPorPerfis?(args: {
    perfis: Pick<PerfilDaBusca, 'nome' | 'criterios' | 'aplicados' | 'pendentes'>[]
    contextoVersao: number
    maxResults?: number
    allowTesting?: boolean
  }): Promise<void>
  /** A busca de contas mais recente e o seu desfecho; nula quando ainda não houve nenhuma. */
  ultimaBusca?(): Promise<UltimaBuscaDeContas | null>
  listarDescobertas(estado?: EstadoContaDescoberta): Promise<ContaDescoberta[]>
  aceitarDescoberta(id: string, url?: string): Promise<ResultadoDoAceite>
  descartarDescoberta(id: string, motivo?: string, codigo?: CodigoDoDescarte): Promise<void>
  /** O que a Descoberta aprendeu com os aceites e descartes do Workspace (feedback-que-ensina). */
  aprendizado?(): Promise<AjusteAprendido[]>
  /** Desfaz um ajuste ou, sem argumentos, recomeça o aprendizado. Só Administrador. */
  desfazerAprendizado?(ajuste?: Pick<AjusteAprendido, 'dimensao' | 'valor'>): Promise<void>
  restaurarDescoberta(id: string): Promise<void>
  /** Por que essa Aderência: texto que explica os motivos da Descoberta. A nota não muda. */
  explicarAderencia?(id: string): Promise<ExplicacaoDeAderencia>
}
