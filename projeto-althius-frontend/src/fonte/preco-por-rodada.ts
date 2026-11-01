// Preço por rodada, estimativa por dia e por mês, e limites ao ativar o Sinal (agente-de-sinal 04 e 05). As regras valem no
// servidor (`public.quote_signal_schedule`, `public.save_signal_daily_cap`, `public.finish_signal_monitor_run`); aqui estão a
// mesma conta, para a Demonstração, que não tem servidor, e as frases do produto. O preço de uma Rodada é o do LOTE: as Contas do
// Sinal, no máximo `maxEmpresasPorRodada` (`loteDaRodada`). O cliente vê só créditos: nunca US$, custo de fornecedor, nome de
// actor nem valor de Teto. A única exceção é o limite mensal SUGERIDO ao liberar a automação ao ativar (o custo estimado do mês mais
// 20%, em créditos): nunca o limite que o Workspace já tem. Um teste confere estes números contra a migration.

import { type AgendaDoSinal, rodadasPorSemana } from './agenda-do-sinal'
import type { Monitoramento } from './sinais-tipos'

/**
 * Os limites e o padrão. Decidido pelo Kauê em 24/10/2026: pausa depois de 3 Rodadas seguidas puladas por falta de créditos, aviso
 * de repetição acima de 2 Rodadas por dia e Teto mensal sugerido de 20% acima do custo estimado do mês. Ficam aqui e em
 * `private.signal_price_limit`.
 */
export const LIMITES_DO_PRECO = {
  rodadasPorDiaParaOAviso: 2,
  rodadasPuladasParaPausar: 3,
  margemDoTetoMensalEmPercentual: 20,
} as const

/** O Teto mensal sugerido: o custo estimado do mês mais a margem, em créditos inteiros e para cima (`suggest_signal_monthly_cap`). */
export function tetoMensalSugerido(porMesAprox: number, limiteDaFaixa?: number): number {
  const sugerido = Math.ceil((porMesAprox * (100 + LIMITES_DO_PRECO.margemDoTetoMensalEmPercentual)) / 100)
  return Math.max(limiteDaFaixa === undefined ? sugerido : Math.min(sugerido, limiteDaFaixa), 1)
}

/** Por que o Sinal ainda não pode ser ativado (ou nulo): o código estável de `quote_signal_schedule`. */
export type BloqueioDaAtivacao = 'contrato_inativo' | 'sem_teto_automacao' | 'sem_creditos'

export const BLOQUEIOS_DA_ATIVACAO: readonly BloqueioDaAtivacao[] = ['contrato_inativo', 'sem_teto_automacao', 'sem_creditos']

/** A estimativa antes de ativar. Todos os números são créditos; nada de Teto, de US$ nem de fornecedor. */
export interface EstimativaDoSinal {
  /** O máximo de uma Rodada. */
  porRodada: number
  rodadasPorSemana: number
  /** O máximo no dia com mais Rodadas. */
  porDia: number
  /** Rodadas por semana × 52 / 12 × preço da Rodada, arredondado para cima. */
  porMesAprox: number
  saldo: number
  /** A Equipe Althius não tem saldo contado. */
  ilimitado: boolean
  /** Quantos dias o saldo aguenta no ritmo médio da semana (para baixo); nulo sem custo ou sem saldo contado. */
  diasDeSaldo: number | null
  /** Mais de 2 Rodadas por dia costuma repetir resultados. */
  avisoDeRepeticao: boolean
  /** O custo máximo de um dia: o teto do limite por dia, que a pessoa só baixa. */
  limiteSugeridoPorDia: number
  bloqueio: BloqueioDaAtivacao | null
}

const plural = (n: number, singular: string, pluralizado: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralizado}`
export const creditos = (n: number) => plural(n, 'crédito', 'créditos')
const numero = (n: number) => n.toLocaleString('pt-BR')

export const AVISO_DE_REPETICAO = 'Rodar várias vezes por dia costuma repetir resultados.'

/**
 * "Até 24 créditos por rodada · até 48 por dia · cerca de 1.040 por mês. Seu saldo dura cerca de 3 dias nesse ritmo." O saldo só
 * entra quando há custo e o saldo é contado.
 */
export function textoDaEstimativa(e: EstimativaDoSinal): string {
  const custo = `Até ${creditos(e.porRodada)} por rodada · até ${numero(e.porDia)} por dia · cerca de ${numero(e.porMesAprox)} por mês.`
  if (e.ilimitado || e.diasDeSaldo === null) return custo
  const saldo = e.diasDeSaldo === 0
    ? 'Seu saldo dura menos de 1 dia nesse ritmo.'
    : `Seu saldo dura cerca de ${plural(e.diasDeSaldo, 'dia', 'dias')} nesse ritmo.`
  return `${custo} ${saldo}`
}

/**
 * A mesma conta do servidor, para a Demonstração: `porRodada` é o preço de uma Rodada; a Agenda diz quantas por dia e por semana.
 * Sem Agenda, o ritmo é o de uma Rodada por dia, todos os dias.
 */
export function estimativaLocal(
  entrada: { porRodada: number; agenda?: AgendaDoSinal; saldo: number; ilimitado?: boolean; bloqueio?: BloqueioDaAtivacao | null },
): EstimativaDoSinal {
  const { porRodada, agenda, saldo } = entrada
  const rodadasPorDia = agenda ? agenda.horarios.length : 1
  const porSemana = agenda ? rodadasPorSemana(agenda) : 7
  const ilimitado = entrada.ilimitado === true
  const mediaPorDia = (porSemana * porRodada) / 7
  return {
    porRodada,
    rodadasPorSemana: porSemana,
    porDia: porRodada * rodadasPorDia,
    porMesAprox: Math.ceil((porSemana * 52 * porRodada) / 12),
    saldo,
    ilimitado,
    diasDeSaldo: ilimitado || porRodada === 0 || porSemana === 0 ? null : Math.floor(Math.max(saldo, 0) / mediaPorDia),
    avisoDeRepeticao: rodadasPorDia > LIMITES_DO_PRECO.rodadasPorDiaParaOAviso,
    limiteSugeridoPorDia: porRodada * rodadasPorDia,
    bloqueio: entrada.bloqueio ?? null,
  }
}

// ---- A confirmação "Ativar Sinal" ----

export const TITULO_DA_ATIVACAO = 'Ativar Sinal'

/** O que acontece sem créditos (decidido pelo Kauê em 24/10/2026). */
export const TEXTO_DO_SEM_CREDITOS =
  `Se os créditos acabarem, a rodada é pulada sem cobrança. Depois de ${LIMITES_DO_PRECO.rodadasPuladasParaPausar} rodadas puladas, o Sinal pausa e avisamos aqui.`

/** Para quem não pode configurar a automação: o pedido ao responsável, sem valor de Teto. */
export const PEDIDO_DE_AUTOMACAO = 'Peça ao responsável pelo plano para liberar a automação.'

/** Para quem pode (Administrador): o que falta, sem valor de Teto, antes do caminho para configurar. */
export const AUTOMACAO_NAO_LIBERADA = 'A automação ainda não está liberada neste Workspace, e o Sinal não roda sozinho sem ela.'

// ---- Liberar a automação ao ativar (o limite mensal já vem preenchido) ----

export const ROTULO_DO_LIMITE_MENSAL = 'Limite mensal da automação (créditos)'
export const AJUDA_DO_LIMITE_MENSAL =
  `Já preenchido com o custo estimado do mês mais ${LIMITES_DO_PRECO.margemDoTetoMensalEmPercentual}%. Você pode mudar.`
export const BOTAO_LIBERAR_E_ATIVAR = 'Liberar e ativar'

export type CodigoDeErroDaAutomacao = 'nao_administrador' | 'limite_invalido' | 'acima_da_faixa' | 'contrato_inativo'

export const CODIGOS_DE_ERRO_DA_AUTOMACAO: readonly CodigoDeErroDaAutomacao[] = [
  'nao_administrador', 'limite_invalido', 'acima_da_faixa', 'contrato_inativo',
]

/** A frase de cada recusa de liberar a automação. Só créditos: nunca o valor do limite que o Workspace tem. */
export const TEXTO_DO_ERRO_DA_AUTOMACAO: Readonly<Record<CodigoDeErroDaAutomacao, string>> = {
  nao_administrador: 'Só um Administrador libera a automação.',
  limite_invalido: 'Use um número inteiro de créditos, de 1 em diante.',
  acima_da_faixa: 'O limite não pode passar dos créditos do plano. Escolha um valor menor ou fale com a equipe Althius.',
  contrato_inativo: 'Contrato inativo. Fale com a equipe Althius para reativar.',
}

export const MENSAGEM_DA_FALHA_DA_AUTOMACAO = 'Não foi possível liberar a automação. Tente de novo.'

/** A recusa de liberar a automação, com o código para a tela agir. */
export class ErroDaAutomacao extends Error {
  readonly codigo: CodigoDeErroDaAutomacao
  constructor(codigo: CodigoDeErroDaAutomacao) {
    super(TEXTO_DO_ERRO_DA_AUTOMACAO[codigo])
    this.name = 'ErroDaAutomacao'
    this.codigo = codigo
  }
}

/** O código que o banco recusou (`signal automation invalid: <código>`), ou nada. */
export function codigoDoErroDaAutomacao(mensagem: string): CodigoDeErroDaAutomacao | null {
  const achado = /signal automation invalid: ([a-z_]+)/.exec(mensagem)?.[1]
  return CODIGOS_DE_ERRO_DA_AUTOMACAO.find((c) => c === achado) ?? null
}

/** O limite digitado: inteiro de 1 em diante. A faixa do contrato quem confere é o servidor. */
export function validarLimiteMensal(texto: string): 'limite_invalido' | null {
  const limpo = texto.trim()
  return /^\d{1,9}$/.test(limpo) && Number(limpo) >= 1 ? null : 'limite_invalido'
}

// ---- A 1ª Rodada pulada por falta de créditos ----

/** O Sinal ativo cuja última Rodada foi pulada por falta de créditos: a tela já avisa na primeira (agente-de-sinal 05). */
export function sinalComRodadaPulada(monitoramento: Pick<Monitoramento, 'estado' | 'rodadasPuladas'>): boolean {
  return monitoramento.estado === 'ativo' && (monitoramento.rodadasPuladas ?? 0) >= 1
}

export const TITULO_DA_RODADA_PULADA = 'Rodada pulada por falta de créditos'
/** O aviso do Sinal ativo cuja última Rodada foi pulada: o número da pausa vem do limite, não do texto. */
export const TEXTO_DA_RODADA_PULADA =
  `A última rodada foi pulada porque os créditos acabaram. Depois de ${LIMITES_DO_PRECO.rodadasPuladasParaPausar} rodadas puladas seguidas, o Sinal pausa.`

// ---- Pausado por falta de créditos ----

export const TITULO_DA_PAUSA_POR_CREDITOS = 'Pausado por falta de créditos'
export const TEXTO_DA_PAUSA_POR_CREDITOS =
  `${LIMITES_DO_PRECO.rodadasPuladasParaPausar} rodadas seguidas foram puladas porque os créditos acabaram. Veja o saldo e reative o Sinal quando houver créditos.`

// ---- O limite por dia ----

export type CodigoDeErroDoLimite = 'tipo_sem_limite' | 'sem_estimativa' | 'limite_invalido' | 'acima_do_sugerido'

export const CODIGOS_DE_ERRO_DO_LIMITE: readonly CodigoDeErroDoLimite[] = [
  'tipo_sem_limite', 'sem_estimativa', 'limite_invalido', 'acima_do_sugerido',
]

/** A frase de cada recusa do limite por dia. `sugerido` completa a de "acima do sugerido". */
export function textoDoErroDoLimite(codigo: CodigoDeErroDoLimite, sugerido?: number): string {
  switch (codigo) {
    case 'limite_invalido':
      return 'Use um número inteiro de créditos, de 1 em diante.'
    case 'acima_do_sugerido':
      return sugerido === undefined
        ? 'O limite não pode passar do máximo de um dia da agenda.'
        : `O limite não pode passar de ${creditos(sugerido)} por dia, o máximo da agenda.`
    case 'sem_estimativa':
      return 'Escolha ao menos uma Conta-alvo para definir o limite.'
    case 'tipo_sem_limite':
      return 'Este Sinal não gasta créditos e não tem limite por dia.'
  }
}

export const MENSAGEM_DA_FALHA_DO_LIMITE = 'Não foi possível salvar o limite por dia. Tente de novo.'

/** A recusa do limite por dia, com o código para a tela agir. */
export class ErroDoLimite extends Error {
  readonly codigo: CodigoDeErroDoLimite
  constructor(codigo: CodigoDeErroDoLimite, sugerido?: number) {
    super(textoDoErroDoLimite(codigo, sugerido))
    this.name = 'ErroDoLimite'
    this.codigo = codigo
  }
}

/** O código que o banco recusou (`daily credit cap invalid: <código>`), ou nada. */
export function codigoDoErroDoLimite(mensagem: string): CodigoDeErroDoLimite | null {
  const achado = /daily credit cap invalid: ([a-z_]+)/.exec(mensagem)?.[1]
  return CODIGOS_DE_ERRO_DO_LIMITE.find((c) => c === achado) ?? null
}

/** O limite digitado, de 1 ao sugerido: a pessoa pode baixar, não subir. Devolve o primeiro problema ou nada. */
export function validarLimitePorDia(texto: string, sugerido: number): 'limite_invalido' | 'acima_do_sugerido' | null {
  const limpo = texto.trim()
  if (!/^\d{1,9}$/.test(limpo)) return 'limite_invalido'
  const valor = Number(limpo)
  if (valor < 1) return 'limite_invalido'
  return valor > sugerido ? 'acima_do_sugerido' : null
}
