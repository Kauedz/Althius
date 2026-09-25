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
  persona?: string
  foto?: string
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
  contatoId: string
  tipo: TipoDeInteracao
  data: string
  participanteCliente?: string
  origem?: string
}

export interface NovaInteracao {
  contaId: string
  contatoId: string
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

  /** Busca uma Conta-alvo pelo identificador. Rejeita se não existir. */
  conta(id: string): Promise<ContaAlvo>

  /** Lista todos os Contatos de todas as Contas-alvo. */
  contatos(): Promise<Contato[]>

  /** Lista os Contatos de uma Conta-alvo específica. */
  contatosDaConta(contaId: string): Promise<Contato[]>

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
}
