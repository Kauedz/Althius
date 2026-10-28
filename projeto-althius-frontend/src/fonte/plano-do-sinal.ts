// O Plano do Sinal como a tela o vê (agente-de-sinal 01): a configuração estruturada que a Edge Function `signal-plan`
// monta a partir do Briefing e que `save_signal_plan` grava como rascunho do Monitoramento. O formato é o v1 de
// `supabase/functions/_shared/plano-do-sinal/` (a fonte única, conferida de novo no banco); aqui ficam só os tipos e os
// limites que a tela mostra. Os critérios têm o mesmo formato dos de um Monitoramento.
import type { Criterios } from './sinais-tipos'

export type OrigemDoPlano = 'briefing' | 'modelo' | 'formulario'

export interface EscopoDoPlanoContas {
  tipo: 'contas'
  contaIds: string[]
}

/** O mercado endereçável do ICP, sem Contas escolhidas. Só os tipos de `TIPOS_NO_MERCADO` rodam assim. */
export interface EscopoDoPlanoMercado {
  tipo: 'mercado'
}

/** Os tipos que procuram no mercado endereçável (o servidor confere o mesmo): hoje só Abertura de vagas. */
export const TIPOS_NO_MERCADO: readonly string[] = ['vaga_linkedin']

export interface PlanoDoSinal {
  versao: 1
  origem: OrigemDoPlano
  escopo: EscopoDoPlanoContas | EscopoDoPlanoMercado
  /** Por enquanto exatamente um Sinal; o array já existe para o Sinal com vários tipos. */
  sinais: { tipo: string; criterios: Criterios }[]
  explicacao: string
  maxEmpresasPorRodada: number
  modeloId?: string
}

/**
 * Os limites que a tela mostra (o servidor os confere: `_shared/plano-do-sinal/limites.ts`). Decidido pelo Kauê em 24/10/2026:
 * até 500 Contas escolhidas, em rotação; cada Rodada leva um lote de 1 a 100 empresas, e o padrão é 25.
 */
export const LIMITES_DO_PLANO = {
  briefingMax: 1000,
  contasEscolhidasMax: 500,
  empresasPorRodadaMin: 1,
  empresasPorRodadaMax: 100,
  empresasPorRodadaPadrao: 25,
} as const

/**
 * O lote da Rodada: quantas Contas ela verifica no máximo (`maxEmpresasPorRodada` do Plano, ou o padrão sem Plano), dentro da
 * faixa. É a mesma conta de `private.signal_round_batch`; a lista de Contas gira de lote em lote.
 */
export function loteDaRodada(plano?: Pick<PlanoDoSinal, 'maxEmpresasPorRodada'> | null): number {
  const { empresasPorRodadaMin: min, empresasPorRodadaMax: max, empresasPorRodadaPadrao: padrao } = LIMITES_DO_PLANO
  const valor = plano && Number.isFinite(plano.maxEmpresasPorRodada) ? Math.trunc(plano.maxEmpresasPorRodada) : padrao
  return Math.min(Math.max(valor, min), max)
}

/** Quantas Contas uma Rodada verifica: as do Sinal, no máximo o lote. */
export function contasDaRodada(totalDeContas: number, plano?: Pick<PlanoDoSinal, 'maxEmpresasPorRodada'> | null): number {
  return Math.min(totalDeContas, loteDaRodada(plano))
}

export interface PedidoDePlano {
  briefing: string
  escopo?: EscopoDoPlanoContas | EscopoDoPlanoMercado
  contaIds?: string[]
}

export interface PlanoMontado {
  plano: PlanoDoSinal
  /** Avisos neutros para a pessoa (ex.: "Montamos um plano inicial. Revise os critérios."). */
  avisos: string[]
}

export interface PlanoParaSalvar {
  /** O Monitoramento que já existe, quando a pessoa edita o Plano dele. */
  id?: string
  nome: string
  briefing: string
  plano: PlanoDoSinal
  /** Origem do fluxo que criou o Monitoramento, para rastreabilidade. */
  criadoVia?: 'sinais_novo' | 'composer' | 'modelo'
}

export type CodigoDoErroDoPlano = 'limite_diario' | 'sem_tipos' | 'falha'

/** Por que o Plano não saiu, com a mensagem que a pessoa lê. */
export class ErroDoPlano extends Error {
  readonly codigo: CodigoDoErroDoPlano
  constructor(codigo: CodigoDoErroDoPlano, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDoPlano'
    this.codigo = codigo
  }
}

export const MENSAGEM_DA_FALHA_DO_PLANO = 'Não deu para montar o plano agora. Tente de novo.'
