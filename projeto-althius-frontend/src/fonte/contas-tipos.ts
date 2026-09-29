import type { FonteObservavel } from './tipos'

/**
 * Aderência ao perfil de cliente ideal (ICP), avaliada pelo Scopus (ADR 0007).
 * 'fit' ou 'nao-fit'. Sem valor, a Conta-alvo importada ainda não foi avaliada.
 * Quente não faz parte da Aderência: é derivado da presença de sinais válidos.
 */
export type Aderencia = 'fit' | 'nao-fit'

export type OrigemDaConta =
  | { tipo: 'recomendada' }
  | { tipo: 'importada'; importadaPor: string; importadaEm: string }

export interface PreviaContato {
  nome: string
  foto?: string
}

export interface ReencontroSinal {
  data: string
  monitoramentoId?: string
  fonte?: string
  vezes?: number
}

export interface Sinal {
  id: string
  contaId: string
  /** Identidade estável do acontecimento para deduplicação por Conta-alvo. */
  acontecimentoId?: string
  tipo?: string
  tipoId?: string
  monitoramentoId?: string
  titulo?: string
  frase: string
  descricao?: string
  /** Data do disparo, que define a janela de validade de 30 dias. */
  data: string
  dataDisparo?: string
  /** Data do acontecimento, se distinta da data de disparo (não substitui data de disparo na validade). */
  dataAcontecimento?: string
  fonte?: string
  evidencia?: string
  detectadoPor?: string
  /** Registro de reencontro do mesmo acontecimento (mantém data original e não renova validade). */
  reencontrado?: ReencontroSinal
}

export interface NovoSinal {
  id?: string
  contaId: string
  acontecimentoId?: string
  tipo?: string
  tipoId?: string
  monitoramentoId?: string
  titulo?: string
  frase?: string
  descricao?: string
  data?: string | Date
  dataDisparo?: string | Date
  dataAcontecimento?: string | Date
  fonte?: string
  evidencia?: string
  detectadoPor?: string
  reencontrado?: ReencontroSinal
}

export interface ContaAlvo {
  id: string
  nome: string
  dominio?: string
  siteUrl?: string
  linkedinUrl?: string
  /** Endereço da imagem do logo. Sem logo, a tela mostra as iniciais do nome. */
  logo?: string
  /** O logo é um vetor de uma cor só, que a tela pinta com a cor do texto para aparecer nos dois temas. */
  logoDeUmaCor?: boolean
  segmento?: string
  aderencia?: Aderencia
  origem?: OrigemDaConta
  /** Total de contatos da conta (calculado pela fonte). */
  totalContatos: number
  /** Até três pré-visualizações de contato para os avatares (calculado pela fonte). */
  previaContatos?: PreviaContato[]
  /** O sinal mais recente detectado na conta (calculado pela fonte, mesmo se expirado). */
  ultimoSinal?: Sinal
  /** Quantidade de sinais válidos disparados nos últimos 30 dias (calculado pela fonte). */
  totalSinaisValidos?: number
  /** Conta Quente: ao menos um sinal válido nos últimos 30 dias (calculado pela fonte). */
  quente?: boolean
  /** Data da interação mais recente com qualquer contato (calculada pela fonte, ou undefined para 'Nunca'). */
  ultimoContatoEm?: string
  /** A Conta está sob a responsabilidade de quem está na sessão. Sem valor, a fonte não informa. */
  sobMinhaResponsabilidade?: boolean
  /** Quando a Conta foi arquivada: fora das listas e buscas padrão, com o histórico, até ser restaurada. */
  arquivadaEm?: string
  /** Quem está na sessão pode arquivar e restaurar a Conta (o Vendedor responsável ou um Administrador). */
  podeArquivar?: boolean
  /** Quem está na sessão pode apagar a Conta definitivamente (só o Administrador). */
  podeApagar?: boolean
}

/** O cadastro manual de uma Conta-alvo. A URL da empresa identifica a Conta existente, que é atualizada. */
export interface NovaContaAlvo {
  nome: string
  url: string
  segmento?: string
}

export interface DestinosReaisContato {
  email?: string
  whatsapp?: string
  linkedin?: string
}

export interface Contato {
  id: string
  contaId: string
  nome: string
  cargo?: string
  area?: string
  /**
   * O nome da Persona que classifica o Contato: a referência à definição vigente na Memória do Workspace, sem cópia
   * dela. Uma revisão aprovada muda a definição, não o Contato.
   */
  persona?: string
  foto?: string
  /**
   * Como terminou a última busca da foto pública, quando não deu foto: o perfil não tem imagem pública, ou a busca
   * falhou. Sem valor, a foto nunca foi buscada, ou existe.
   */
  fotoConsulta?: 'nao-encontrada' | 'falhou'
  canais: {
    email: boolean
    telefone: boolean
    linkedin: boolean
  }
  ultimoContatoEm?: string
  email?: string
  whatsapp?: string
  linkedin?: string
  ehReal?: boolean
  /** Quem está na sessão pode arquivar o Contato (o Vendedor responsável pela Conta dele ou um Administrador). */
  podeArquivar?: boolean
  /** Quem está na sessão pode apagar o Contato definitivamente (só o Administrador). */
  podeApagar?: boolean
}

/** Um Contato arquivado: sem Vínculo ativo, fora das listas padrão, guardado até ser restaurado ou apagado. */
export interface ContatoArquivado {
  id: string
  nome: string
  cargo?: string
  arquivadoEm: string
  /** A Conta-alvo do último Vínculo, que o arquivamento encerrou. */
  contaId?: string
  contaNome?: string
  podeApagar?: boolean
}

/** O que o arquivamento de uma Conta fez: quantas Sequências em andamento foram pausadas. */
export interface ResultadoDoArquivamentoDaConta {
  sequenciasPausadas: number
}

/** O que a restauração de uma Conta fez: a Sequência só é destravada, nunca retomada. */
export interface ResultadoDaRestauracaoDaConta {
  sequenciasDestravadas: number
}

/** O que o apagamento definitivo de uma Conta fez, em números. Nada do que foi apagado volta na resposta. */
export interface ResultadoDoApagamentoDaConta {
  contatosApagados: number
  contatosMantidos: number
  sequenciasEncerradas: number
}

/** O cadastro de um Contato numa Conta-alvo, que abre o Vínculo do Contato com ela. Só o nome é obrigatório. */
export interface NovoContato {
  contaId: string
  nome: string
  cargo?: string
  email?: string
  whatsapp?: string
  linkedin?: string
}

export type TipoDeInteracao =
  | 'email-enviado'
  | 'email-recebido'
  | 'mensagem-enviada'
  | 'ligacao'
  | 'reuniao'

export interface Interacao {
  id: string
  contaId: string
  /** O Contato envolvido; uma Interação registrada só na Conta não tem. */
  contatoId?: string
  tipo: TipoDeInteracao
  data: string
  participanteCliente?: string
  origem?: string
}

export interface NovaInteracao {
  contaId: string
  contatoId?: string
  tipo: TipoDeInteracao
  data?: string
  participanteCliente?: string
  origem?: string
}

/**
 * A fronteira de dados do módulo Contas e Contatos.
 * Operações assíncronas com observador de mudanças (ADR 0003 e ADR 0007).
 */
export interface FonteDeContas extends FonteObservavel {
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todas as Contas-alvo com suas projeções de sinais e Aderência. */
  contas(): Promise<ContaAlvo[]>

  /**
   * Cadastra uma Conta-alvo, sob a responsabilidade de quem a cria, ou atualiza a que tem a mesma URL da empresa.
   * Sem este método, a fonte não aceita cadastro manual.
   */
  salvarConta?(nova: NovaContaAlvo): Promise<ContaAlvo>

  /** Busca uma Conta-alvo pelo identificador. Rejeita se não existir. */
  conta(id: string): Promise<ContaAlvo>

  /** Lista todos os Contatos de todas as Contas-alvo. */
  contatos(): Promise<Contato[]>

  /** Lista os Contatos de uma Conta-alvo específica. */
  contatosDaConta(contaId: string): Promise<Contato[]>

  /**
   * Cadastra um Contato na Conta-alvo, abrindo o Vínculo do Contato com ela. O nome sozinho não mescla Contatos;
   * e-mail, telefone ou LinkedIn de outro Contato do Workspace são recusados. Sem este método, não há cadastro.
   */
  salvarContato?(novo: NovoContato): Promise<Contato>

  /** Abre um Vínculo do Contato com outra Conta-alvo, mantendo os que ele já tem. */
  vincularContato?(contatoId: string, contaId: string): Promise<void>

  /** Encerra o Vínculo do Contato com a Conta-alvo; as Interações ficam na Conta onde aconteceram. */
  encerrarVinculo?(contatoId: string, contaId: string): Promise<void>

  /**
   * Busca a foto pública do Contato pelo LinkedIn dele, por uma ação da pessoa (nunca ao listar). Resolve quando a
   * busca terminou, ache ela a foto ou não, e a foto aparece na próxima leitura do Contato; rejeita com a razão em
   * palavras do produto (limite, permissão, provedor fora). Sem este método, a fonte não oferece a busca.
   */
  consultarFotoDoContato?(contatoId: string): Promise<void>

  /** Lista todos os Sinais disparados até a data de hoje. */
  sinais(): Promise<Sinal[]>

  /** Lista os Sinais de uma Conta-alvo, do mais recente ao mais antigo (mesmo expirados). */
  sinaisDaConta(contaId: string): Promise<Sinal[]>

  /** Registra/adiciona um novo Sinal, deduplicando acontecimentos na Conta-alvo. */
  adicionarSinal(sinal: NovoSinal): Promise<Sinal>

  /** Lista as Interações de uma Conta-alvo, da mais recente à mais antiga. */
  interacoesDaConta(contaId: string): Promise<Interacao[]>

  /** Registra uma nova Interação na Conta-alvo. */
  registrarInteracao(nova: NovaInteracao): Promise<Interacao>

  /** Cadastra ou atualiza os destinos reais (e-mail, WhatsApp normalizado e LinkedIn) de um Contato. */
  atualizarDestinosContato(
    contatoId: string,
    destinos: DestinosReaisContato,
  ): Promise<Contato>

  /** As Contas-alvo arquivadas, para restaurar ou apagar. As listas padrão não as trazem. Sem este método, não há arquivo. */
  contasArquivadas?(): Promise<ContaAlvo[]>

  /** Arquiva a Conta-alvo: sai das listas padrão, a Sequência em andamento é pausada e o histórico fica. */
  arquivarConta?(contaId: string): Promise<ResultadoDoArquivamentoDaConta>

  /** Restaura a Conta-alvo arquivada. A Sequência pausada só é destravada: retomar continua sendo do responsável. */
  restaurarConta?(contaId: string): Promise<ResultadoDaRestauracaoDaConta>

  /**
   * Apaga a Conta-alvo definitivamente, com o nome dela digitado como confirmação: some o que era da empresa e das
   * Sequências dela, ficam os eventos comerciais sem nome. Rejeita, sem apagar nada, se a confirmação não conferir.
   */
  apagarConta?(contaId: string, confirmacao: string): Promise<ResultadoDoApagamentoDaConta>

  /** Os Contatos arquivados, para restaurar ou apagar. */
  contatosArquivados?(): Promise<ContatoArquivado[]>

  /** Arquiva o Contato: os Vínculos ativos são encerrados e voltam se ele for restaurado. */
  arquivarContato?(contatoId: string): Promise<void>

  /** Restaura o Contato arquivado, reabrindo os Vínculos que o arquivamento encerrou. */
  restaurarContato?(contatoId: string): Promise<void>

  /** Apaga o Contato definitivamente, com o nome dele digitado como confirmação. */
  apagarContato?(contatoId: string, confirmacao: string): Promise<void>
}
