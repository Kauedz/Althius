import type { CanaisDoContato, EmailDoContato, TelefoneDoContato } from './canais-do-contato'
import type { EstagioDeProspeccao } from './estagios-de-prospeccao'
import type { FonteDeImportacaoDeContas } from './importacao-tipos'
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

export interface ParticipanteParaTransferir {
  id: string
  nome: string
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
  /**
   * O responsável pela Conta já não é Participante ativo do Workspace, e quem está na sessão (Administrador) pode
   * transferi-la (CRM-06). Sem valor, a fonte não informa.
   */
  responsavelAusente?: boolean
  /** O Estágio de prospecção, a coluna do kanban. Sem valor, a fonte não informa (e a Conta fica em Descoberta). */
  estagio?: EstagioDeProspeccao
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
  /** O e-mail principal (o primeiro de `emails`). */
  email?: string
  /** O telefone principal, que sempre foi o WhatsApp do Contato (o primeiro de `telefones`). */
  whatsapp?: string
  linkedin?: string
  /**
   * Os e-mails do Contato, o principal primeiro, até três, com o rótulo de cada um. Só o Workspace operacional informa:
   * sem isto, o Contato tem só o principal e a tela não oferece as listas.
   */
  emails?: EmailDoContato[]
  /** Os telefones do Contato, o principal primeiro, até três, com o tipo e a marca de WhatsApp de cada um. */
  telefones?: TelefoneDoContato[]
  ehReal?: boolean
  /**
   * Quem está na sessão pode editar os dados do Contato: um Administrador ou o Vendedor responsável por todas as Contas
   * onde ele tem Vínculo ativo. Vincular um Contato a uma Conta sua não concede edição.
   */
  podeEditar?: boolean
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

/**
 * A edição dos dados de um Contato que já existe. O nome é obrigatório. Nos outros campos, texto vazio apaga o valor
 * e campo ausente o mantém.
 */
export interface EdicaoDoContato {
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
 * O que "Buscar Sinais de novo" mostra na Conta antes de rodar (reativação de Sinais): quantos Monitoramentos ativos
 * varreriam a Conta, quantos créditos custa, o saldo do Workspace, se já há uma busca em andamento e como terminou a
 * última.
 */
export interface CustoDaBusca {
  monitoramentos: number
  creditos: number
  saldo: number
  emAndamento: boolean
  /** ISO 8601 de quando a última busca terminou; nulo se nunca houve. */
  terminouEm: string | null
  /** Por que a última busca não varreu tudo, em palavras do produto. */
  motivo: string | null
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
   * Move a Conta para outro Estágio de prospecção, à mão. Só o Vendedor responsável move; a recusa vem em palavras do
   * produto. Sem este método, a fonte não oferece o kanban.
   */
  moverEstagio?(contaId: string, estagio: EstagioDeProspeccao): Promise<void>

  /**
   * O custo de "Buscar Sinais de novo" numa Conta, antes de a pessoa pedir. Sem este método (e o seguinte), a fonte não
   * oferece o botão.
   */
  custoDeBuscarSinais?(contaId: string): Promise<CustoDaBusca>

  /**
   * Pede a busca: a Conta é varrida de novo com os Monitoramentos ativos do Workspace, e cada varredura gasta 1 crédito.
   * Resolve quando o pedido entrou na fila; rejeita com o motivo em palavras do produto (sem Monitoramento ativo, sem
   * saldo, no limite mensal).
   */
  buscarSinaisDeNovo?(contaId: string): Promise<void>

  /**
   * Cadastra uma Conta-alvo, sob a responsabilidade de quem a cria, ou atualiza a que tem a mesma URL da empresa.
   * Sem este método, a fonte não aceita cadastro manual.
   */
  salvarConta?(nova: NovaContaAlvo): Promise<ContaAlvo>

  /**
   * A importação de Contas e Contatos por CSV. Só o Workspace operacional tem backend para ela: sem este membro, a
   * fonte não oferece "Importar CSV" e nenhum resultado é simulado.
   */
  importacao?: FonteDeImportacaoDeContas

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

  /**
   * Edita o nome, o cargo e os canais do Contato, em todas as Contas onde ele atua. E-mail, telefone ou LinkedIn de outro
   * Contato do Workspace são recusados; só um Administrador ou o Vendedor responsável por todas as Contas dele edita.
   * Sem este método, não há edição.
   */
  editarContato?(contatoId: string, campos: EdicaoDoContato): Promise<Contato>

  /**
   * Troca de uma vez as listas de e-mails e de telefones do Contato (o primeiro item de cada uma é o principal, até
   * três). O valor que pertence a outro Contato do Workspace é recusado e nada muda; a permissão é a da edição. Sem
   * este método, a fonte não oferece as listas e o Contato tem só o principal.
   */
  salvarCanaisDoContato?(contatoId: string, canais: CanaisDoContato): Promise<Contato>

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

  /** Os Participantes ativos que podem receber a responsabilidade de uma Conta (CRM-06). */
  participantesParaTransferir?(): Promise<ParticipanteParaTransferir[]>

  /**
   * Transfere a responsabilidade da Conta, depois da saída do responsável, para um Participante ativo, com o motivo.
   * Só o Administrador; ação excepcional, auditada no banco.
   */
  transferirResponsabilidade?(contaId: string, novoResponsavelId: string, motivo: string): Promise<void>

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
