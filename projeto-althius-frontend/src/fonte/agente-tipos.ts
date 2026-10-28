// O agente único (Fase 3): uma conversa em `/` com turnos, passos visíveis e cartões. O contrato vem de
// `agente_ler_conversa` e da Edge Function `agente`; a Demonstração tem a versão simulada.

export type EstadoDoPasso = 'rodando' | 'ok' | 'erro' | 'aguardando_confirmacao' | 'cancelado'
export type StatusDoTurno = 'fila' | 'rodando' | 'aguardando' | 'concluido' | 'falhou'
export type NivelDeAderencia = 'alto' | 'medio' | 'baixo' | 'sem_dado'

export interface EmpresaDoCartao {
  id: string
  nome: string
  dominio?: string | null
  site?: string | null
  setor?: string | null
  porte?: string | null
  local?: string | null
  nivel: NivelDeAderencia
  porques: { texto: string; atende: boolean | null }[]
  /** O estado na Caixa de Descobertas: nova, aceita ou descartada. */
  estado?: 'nova' | 'aceita' | 'descartada'
  contaId?: string | null
}

export interface PessoaDoCartao {
  nome: string
  cargo?: string | null
  persona?: string | null
  linkedinUrl?: string | null
  jaEncontrada?: boolean
}

export type CartaoDoAgente =
  | { tipo: 'empresas'; empresas: EmpresaDoCartao[] }
  | { tipo: 'pessoas'; contaId: string; conta: string; pessoas: PessoaDoCartao[] }
  | {
      tipo: 'receita'
      contaId?: string
      cnpj: string
      razaoSocial: string
      nomeFantasia?: string | null
      situacao?: string | null
      porte?: string | null
      cnae?: string | null
      local?: string | null
      socios?: string[]
    }
  | {
      tipo: 'icp'
      versao: number | null
      setor?: string
      porte?: string
      geografia?: string
      cargos?: string[]
      oQueVende?: string
      miniIcp?: string
      porQueCompram?: string
    }
  | { tipo: 'criterios'; icpVersion: number | null; criterios: Record<string, unknown> }
  | { tipo: 'confirmacao'; titulo: string; custo: number; motivo: 'teto' | 'prospect'; gastos: number; teto: number; texto: string }
  | { tipo: 'aviso'; texto: string; contaId?: string; descobertaId?: string }
  | { tipo: 'sinal' | 'sequencia'; [campo: string]: unknown }

export interface PassoDoAgente {
  id: string
  seq: number
  ferramenta: string
  titulo: string
  estado: EstadoDoPasso
  motivoConfirmacao: 'teto' | 'prospect' | null
  cartoes: CartaoDoAgente[]
  custo: number
  erro: string | null
  /** A tarefa longa segue em segundo plano (a busca de empresas): a tela pede a atualização dela. */
  pendente: boolean
}

export interface TurnoDoAgente {
  id: string
  pedido: string
  status: StatusDoTurno
  resposta: string | null
  errorCode: string | null
  criadoEm: string
  passos: PassoDoAgente[]
}

export interface ConversaDoAgente {
  id: string
  titulo: string
  gastos: number
  teto: number
  turnos: TurnoDoAgente[]
}

export interface ResumoDaConversaDoAgente {
  id: string
  titulo: string
  atualizadaEm: string
  ultimoStatus: StatusDoTurno | null
}

export type EscolhaDoCartao = 'aceitar' | 'descartar' | 'enriquecer'

export interface FonteDoAgente {
  /** O motor de IA deu sinal de vida: sem ele, a tela avisa e não envia. */
  disponivel(): Promise<boolean>
  conversas(): Promise<ResumoDaConversaDoAgente[]>
  conversa(id: string): Promise<ConversaDoAgente>
  enviar(texto: string, conversaId: string | null): Promise<{ conversaId: string; turnoId: string }>
  confirmar(passoId: string): Promise<void>
  cancelar(passoId: string): Promise<void>
  escolher(passoId: string, escolha: EscolhaDoCartao, alvoId: string, motivo?: string): Promise<void>
  /** Confere uma tarefa longa; devolve se ela ainda está em andamento. */
  atualizar(passoId: string): Promise<boolean>
}

/** O turno ainda pode mudar sozinho: a tela relê a conversa. */
export function turnoEmAndamento(t: TurnoDoAgente): boolean {
  return t.status === 'fila' || t.status === 'rodando' || t.passos.some((p) => p.pendente)
}

/** Erros que a tela mostra como estão: a Edge Function já os escreve para a pessoa. */
export class ErroDoAgente extends Error {
  readonly codigo: string

  constructor(mensagem: string, codigo = 'erro') {
    super(mensagem)
    this.name = 'ErroDoAgente'
    this.codigo = codigo
  }
}
