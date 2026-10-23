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

/** Previsto no esquema; a tela ainda não oferece. */
export interface EscopoDoPlanoMercado {
  tipo: 'mercado'
}

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

/** Os limites que a tela mostra (o servidor os confere: `_shared/plano-do-sinal/limites.ts`). */
export const LIMITES_DO_PLANO = {
  briefingMax: 1000,
  contasEscolhidasMax: 50,
} as const

export interface PedidoDePlano {
  briefing: string
  contaIds: string[]
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
