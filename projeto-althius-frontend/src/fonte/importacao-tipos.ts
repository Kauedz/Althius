// A fronteira de dados da importação de Contas e Contatos por CSV (CRM-07). Só o Workspace operacional tem backend
// para ela: a Demonstração não oferece a importação, e nada aqui simula um resultado.

/** Os campos que uma coluna do arquivo pode alimentar. */
export type CampoDoCsv =
  | 'nomeDaEmpresa'
  | 'urlDaEmpresa'
  | 'identificadorLegal'
  | 'linkedinDaEmpresa'
  | 'segmento'
  | 'nomeDoContato'
  | 'cargo'
  | 'email'
  | 'telefone'
  | 'linkedinDoContato'

export interface DescricaoDoCampo {
  campo: CampoDoCsv
  rotulo: string
  grupo: 'Empresa' | 'Contato'
  /** Sem a coluna deste campo, o arquivo não pode ser importado. */
  obrigatorio?: boolean
}

export const CAMPOS_DO_CSV: DescricaoDoCampo[] = [
  { campo: 'nomeDaEmpresa', rotulo: 'Nome da empresa', grupo: 'Empresa', obrigatorio: true },
  { campo: 'urlDaEmpresa', rotulo: 'URL da empresa', grupo: 'Empresa', obrigatorio: true },
  { campo: 'identificadorLegal', rotulo: 'Identificador legal (CNPJ)', grupo: 'Empresa' },
  { campo: 'linkedinDaEmpresa', rotulo: 'LinkedIn da empresa', grupo: 'Empresa' },
  { campo: 'segmento', rotulo: 'Segmento', grupo: 'Empresa' },
  { campo: 'nomeDoContato', rotulo: 'Nome do Contato', grupo: 'Contato' },
  { campo: 'cargo', rotulo: 'Cargo', grupo: 'Contato' },
  { campo: 'email', rotulo: 'E-mail', grupo: 'Contato' },
  { campo: 'telefone', rotulo: 'Telefone', grupo: 'Contato' },
  { campo: 'linkedinDoContato', rotulo: 'LinkedIn do Contato', grupo: 'Contato' },
]

/** O índice da coluna do arquivo que alimenta cada campo; um campo sem coluna não é importado. */
export type Mapeamento = Partial<Record<CampoDoCsv, number>>

export type EstadoDoLote =
  | 'enviando'
  | 'mapeando'
  | 'previa'
  | 'processando'
  | 'concluido'
  | 'falhou'
  | 'cancelado'

export interface ContagensDoLote {
  /** Linhas de dados do arquivo, sem o cabeçalho. */
  total: number
  pendentes: number
  criadas: number
  atualizadas: number
  vinculadas: number
  ignoradas: number
  /** Com falha: as inválidas na confirmação e as que não puderam ser gravadas. */
  comFalha: number
  /** Só antes da confirmação: as linhas com erro de validação. */
  invalidas: number
}

/** O que a confirmação vai fazer, contado sobre as linhas válidas da prévia. */
export interface ResumoDaPrevia {
  contasNovas: number
  contasAtualizadas: number
  /** Contas que já existem sob a responsabilidade de outra pessoa: não são alteradas. */
  contasIgnoradas: number
  contatosNovos: number
  contatosExistentes: number
  decisoesPendentes: number
  /** Linhas em que um valor escrito à mão seria trocado pelo do arquivo. */
  conflitos: number
}

export interface LoteDeImportacao {
  id: string
  arquivo: string
  estado: EstadoDoLote
  /** Quando o lote falhou: por que, em palavras de quem importa. */
  motivoDaFalha?: string
  colunas: string[]
  delimitador?: string
  primeiraLinhaEhCabecalho: boolean
  mapeamento: Mapeamento
  /** Se os dados corrigidos à mão podem ser trocados pelos do arquivo. */
  substituirCorrigidosAMao: boolean
  /** O lote é de quem está na sessão; o Administrador também consulta os dos outros. */
  ehMeu: boolean
  criadoEm: string
  concluidoEm?: string
  contagens: ContagensDoLote
  previa: ResumoDaPrevia
}

export interface ResumoDeLote {
  id: string
  arquivo: string
  estado: EstadoDoLote
  ehMeu: boolean
  totalDeLinhas: number
  criadoEm: string
}

/** O que fazer com o Contato do arquivo que já existe no Workspace (e-mail, telefone ou LinkedIn iguais). */
export type DecisaoDoContato = 'atualizar' | 'vincular' | 'transferir' | 'ignorar'

export type SituacaoDaLinha =
  | 'pendente'
  | 'invalida'
  | 'criada'
  | 'atualizada'
  | 'vinculada'
  | 'ignorada'
  | 'falhou'

export interface PreviaDaLinha {
  conta: 'criar' | 'atualizar' | 'ignorar'
  /** O nome da Conta que a URL encontrou. */
  contaExistente?: string
  camposDaConta: string[]
  /** Campos escritos à mão que o arquivo não troca. */
  conflitosDaConta: string[]
  /** Sem dado de Contato na linha, não há Contato. */
  contato?: 'novo' | 'existente' | 'repetido-no-arquivo'
  contatoExistente?: string
  /** Onde o Contato que já existe atua, fora desta Conta. */
  outrosVinculos: string[]
  camposDoContato: string[]
  conflitosDoContato: string[]
  precisaDecidir: boolean
  podeTransferir: boolean
}

export interface LinhaDaImportacao {
  numero: number
  situacao: SituacaoDaLinha
  celulas: string[]
  empresa?: string
  contato?: string
  /** Os motivos da situação, em palavras de quem importa: erros de validação, falhas, o que foi ignorado. */
  motivos: string[]
  /** O que a linha fez e o que preservou, depois de processada. */
  observacoes: string[]
  previa?: PreviaDaLinha
  decisao?: DecisaoDoContato
}

export type FiltroDasLinhas = 'todas' | 'invalidas' | 'decisoes' | 'conflitos' | 'problemas'

/** Uma Conta criada pelo lote que o Administrador ainda pode distribuir. */
export interface ContaDistribuivel {
  contaId: string
  nome: string
  responsavelId: string
  distribuivelAte: string
}

export interface FonteDeImportacaoDeContas {
  /** Os lotes recentes: os de quem está na sessão e, para o Administrador, os do Workspace. */
  lotes(): Promise<ResumoDeLote[]>
  /** Envia o arquivo, que fica no armazenamento privado do Workspace, e devolve o lote já lido. */
  enviarArquivo(arquivo: File): Promise<LoteDeImportacao>
  lote(id: string): Promise<LoteDeImportacao>
  /** Grava o mapeamento e valida o arquivo inteiro, devolvendo o lote com a prévia. */
  visualizar(
    id: string,
    ajustes: { mapeamento: Mapeamento; primeiraLinhaEhCabecalho: boolean; substituirCorrigidosAMao: boolean },
  ): Promise<LoteDeImportacao>
  linhas(id: string, filtro: FiltroDasLinhas, deslocamento: number, limite: number): Promise<LinhaDaImportacao[]>
  /** Registra a decisão nas linhas indicadas, ou em todas as que esperam decisão. Devolve quantas mudaram. */
  decidir(id: string, decisao: DecisaoDoContato, linhas?: number[]): Promise<number>
  /** Libera o processamento: exige que toda decisão tenha sido tomada. */
  confirmar(id: string): Promise<LoteDeImportacao>
  /** Processa o próximo bloco de linhas pendentes; pode ser chamado de novo depois de uma interrupção. */
  processarBloco(id: string): Promise<LoteDeImportacao>
  cancelar(id: string): Promise<void>
  /** Só o Administrador do Workspace. */
  contasDistribuiveis(id: string): Promise<ContaDistribuivel[]>
  distribuir(id: string, distribuicao: { contaId: string; responsavelId: string }[]): Promise<number>
}
