import type { FonteObservavel } from './tipos'

/**
 * Aderência ao perfil de cliente ideal (ICP), avaliada pelo Scopus.
 * Quente implica Fit. Sem valor, a Conta-alvo importada ainda não foi avaliada.
 */
export type Aderencia = 'quente' | 'fit' | 'nao-fit'

export type OrigemDaConta =
  | { tipo: 'recomendada' }
  | { tipo: 'importada'; importadaPor: string; importadaEm: string }

export interface PreviaContato {
  nome: string
  foto?: string
}

export interface ContaAlvo {
  id: string
  nome: string
  dominio?: string
  siteUrl?: string
  linkedinUrl?: string
  /** Endereço da imagem do logo. Sem logo, a tela mostra as iniciais do nome. */
  logo?: string
  segmento?: string
  aderencia?: Aderencia
  origem?: OrigemDaConta
  /** Total de contatos da conta (calculado pela fonte). */
  totalContatos: number
  /** Até três pré-visualizações de contato para os avatares (calculado pela fonte). */
  previaContatos?: PreviaContato[]
  /** O sinal mais recente detectado na conta (calculado pela fonte). */
  ultimoSinal?: Sinal
  /** Data da interação mais recente com qualquer contato (calculada pela fonte, ou undefined para 'Nunca'). */
  ultimoContatoEm?: string
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
}

export interface Sinal {
  id: string
  contaId: string
  frase: string
  data: string
  fonte?: string
  evidencia?: string
  detectadoPor?: string
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

/**
 * A fronteira de dados do módulo Contas e Contatos.
 * Só de leitura, com operações assíncronas e observador de mudanças.
 */
export interface FonteDeContas extends FonteObservavel {
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todas as Contas-alvo. */
  contas(): Promise<ContaAlvo[]>

  /** Busca uma Conta-alvo pelo identificador. Rejeita se não existir. */
  conta(id: string): Promise<ContaAlvo>

  /** Lista todos os Contatos de todas as Contas-alvo. */
  contatos(): Promise<Contato[]>

  /** Lista os Contatos de uma Conta-alvo específica. */
  contatosDaConta(contaId: string): Promise<Contato[]>

  /** Lista os Sinais de uma Conta-alvo, do mais recente ao mais antigo. */
  sinaisDaConta(contaId: string): Promise<Sinal[]>

  /** Lista as Interações de uma Conta-alvo, da mais recente à mais antiga. */
  interacoesDaConta(contaId: string): Promise<Interacao[]>
}
