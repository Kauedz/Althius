// Rodar agora e o registro da Rodada (agente-de-sinal 02): o que a Fonte de Sinais devolve da prévia, do histórico e dos achados
// de uma Rodada, e as frases do produto para cada bloqueio e motivo de parada. O cliente vê só créditos: nunca US$, custo de
// fornecedor, nome de actor nem valor de Teto.

/** Por que "Rodar agora" não pode rodar (ou nulo): o código estável do banco. */
export type BloqueioDaRodada =
  | 'sem_permissao'
  | 'sem_fonte'
  | 'sem_contas'
  | 'contrato_inativo'
  | 'ja_na_fila'
  | 'intervalo_minimo'
  | 'teto_diario'
  | 'sem_creditos'
  | 'limite_do_mes'
  | 'limite_do_participante'

export const BLOQUEIOS_DA_RODADA: readonly BloqueioDaRodada[] = [
  'sem_permissao', 'sem_fonte', 'sem_contas', 'contrato_inativo', 'ja_na_fila', 'intervalo_minimo', 'teto_diario', 'sem_creditos',
  'limite_do_mes', 'limite_do_participante',
]

/** A prévia da confirmação do "Rodar agora": Contas, preço em créditos, saldo e o bloqueio, se houver. */
export interface PreviaDaRodada {
  /** As Contas no escopo do Sinal. */
  contas: number
  /** As Contas que devem ficar de fora por falta de dado (estimativa): não são cobradas. */
  contasSemDado: number
  creditosPorConta: number
  /** O máximo de créditos da Rodada (todas as Contas). */
  ateCreditos: number
  /** O saldo disponível, o mesmo número da tela de créditos. */
  saldo: number
  /** A Equipe Althius não tem saldo contado. */
  ilimitado: boolean
  bloqueio: BloqueioDaRodada | null
  /** Quando o intervalo mínimo entre duas Rodadas manuais acaba (ISO), no bloqueio `intervalo_minimo`. */
  liberadoEm?: string
}

/** Por que uma Rodada parou, em código estável. A tela escreve a frase. */
export type MotivoDaParada = 'sem_creditos' | 'teto' | 'teto_diario' | 'contrato_inativo' | 'prazo' | 'concluida' | 'erro'

export type OrigemDaRodada = 'agenda' | 'manual'

export interface RodadaRegistrada {
  id: string
  origem: OrigemDaRodada
  estado: 'rodando' | 'concluida' | 'falhou'
  iniciadaEm: string
  terminouEm: string | null
  /** As Contas no escopo quando a Rodada começou (nulo nas Rodadas de antes do registro). */
  contasNoEscopo: number | null
  contasVerificadas: number
  contasSemDado: number
  sinaisNovos: number
  sinaisRepetidos: number
  creditos: number
  motivoDaParada: MotivoDaParada | null
  versaoDoPlano: number | null
  /** O que a Rodada tem a dizer, em palavras do produto (por exemplo, as Contas que ficaram de fora). */
  observacao: string | null
}

/** Um pedido do Rodar agora que ainda não terminou. */
export interface PedidoDeRodada {
  id: string
  estado: 'pendente' | 'rodando'
  pedidoEm: string
  ateCreditos: number
  /** A Rodada que o pedido já abriu, quando começou. */
  rodadaId: string | null
}

export interface HistoricoDeRodadas {
  rodadas: RodadaRegistrada[]
  pedidos: PedidoDeRodada[]
}

/** Um Sinal que a Rodada achou, com a Conta e o "por que apareceu". */
export interface AchadoDaRodada {
  id: string
  contaId: string
  contaNome: string
  /** O `signal_type` do banco. */
  tipo: string
  frase: string
  /** Quando o acontecimento disparou (ISO). */
  data: string
  fonte: string | null
  /** O link ou o trecho que prova o Sinal. */
  evidencia: string | null
  situacao: 'novo' | 'visto_de_novo'
  porQue: string
}

const BRASILIA = 'America/Sao_Paulo'
const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: BRASILIA,
})
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BRASILIA })

/** "23/10/2026 09:15", no horário de Brasília. */
export function dataEHoraEmBrasilia(iso: string): string {
  return DATA_E_HORA.format(new Date(iso)).replace(', ', ' ')
}

/** "09:15", no horário de Brasília. */
export function horaEmBrasilia(iso: string): string {
  return HORA.format(new Date(iso))
}

/** A frase do bloqueio, sem termo técnico. `liberadoEm` completa o intervalo mínimo. */
export function frasesDoBloqueio(bloqueio: BloqueioDaRodada, liberadoEm?: string): string {
  switch (bloqueio) {
    case 'sem_creditos':
      return 'Sem créditos suficientes. Fale com o responsável pelo plano.'
    case 'teto_diario':
      return 'Este Sinal chegou ao limite de créditos de hoje. Tente de novo amanhã.'
    case 'limite_do_mes':
      return 'Limite do mês atingido. Ele volta na renovação ou fale com a equipe Althius.'
    case 'limite_do_participante':
      return 'Você chegou ao seu limite mensal de créditos. Fale com o responsável pelo plano.'
    case 'contrato_inativo':
      return 'Contrato inativo. Fale com a equipe Althius para reativar.'
    case 'ja_na_fila':
      return 'Já tem uma rodada na fila.'
    case 'intervalo_minimo':
      return liberadoEm
        ? `Este Sinal rodou há pouco. Tente de novo depois das ${horaEmBrasilia(liberadoEm)}.`
        : 'Este Sinal rodou há pouco. Tente de novo mais tarde.'
    case 'sem_permissao':
      return 'Só quem criou o Sinal, ou um Administrador, pode rodá-lo.'
    case 'sem_fonte':
      return 'Este Sinal ainda não roda sob demanda.'
    case 'sem_contas':
      return 'Escolha ao menos uma Conta-alvo para rodar.'
  }
}

/** A recusa do pedido, com o código do bloqueio para a tela agir (por exemplo, atualizar a fila). */
export class ErroDaRodada extends Error {
  readonly bloqueio: BloqueioDaRodada
  constructor(bloqueio: BloqueioDaRodada) {
    super(frasesDoBloqueio(bloqueio))
    this.name = 'ErroDaRodada'
    this.bloqueio = bloqueio
  }
}

export const MENSAGEM_DA_FALHA_DA_RODADA = 'Não foi possível pedir a rodada. Tente de novo.'

/** O motivo da parada em texto, para a linha da Rodada. `rodando` vale enquanto a Rodada está aberta. */
export function textoDaParada(rodada: Pick<RodadaRegistrada, 'estado' | 'motivoDaParada'>): string {
  if (rodada.estado === 'rodando') return rodada.motivoDaParada === 'prazo' ? 'Rodando. Continua na próxima volta.' : 'Rodando.'
  switch (rodada.motivoDaParada) {
    case 'sem_creditos':
      return 'Parou: acabaram os créditos.'
    case 'teto':
      return 'Parou: limite do mês ou da automação.'
    case 'teto_diario':
      return 'Parou: limite de créditos por dia.'
    case 'contrato_inativo':
      return 'Parou: contrato inativo.'
    case 'prazo':
      return 'Parou: o tempo da rodada acabou.'
    case 'erro':
      return 'Terminou com erro.'
    default:
      return rodada.estado === 'falhou' ? 'Terminou com erro.' : 'Concluída.'
  }
}

/** De quanto em quanto tempo a tela confere uma Rodada na fila ou rodando, sem consultar sem parar. */
export const INTERVALO_DA_CONFERENCIA_EM_MS = 30_000

const plural = (n: number, singular: string, pluralizado: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralizado}`
const creditos = (n: number) => plural(n, 'crédito', 'créditos')

/** O texto da confirmação: o que a Rodada pode custar, antes de a pessoa clicar. Só créditos. */
export function textoDaPrevia(previa: PreviaDaRodada): string {
  const saldo = previa.ilimitado ? 'Ilimitado' : creditos(previa.saldo)
  return [
    `Vai verificar até ${plural(previa.contas, 'Conta', 'Contas')}.`,
    `Até ${creditos(previa.ateCreditos)} (${previa.creditosPorConta.toLocaleString('pt-BR')} por Conta).`,
    `Seu saldo: ${saldo}.`,
    'Contas sem dado suficiente não são cobradas.',
  ].join(' ')
}
