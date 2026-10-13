// A fachada da cascata de Sinais: monta o motor com o banco (Supabase), as contas de coleta (APIFY_TOKEN_1..5 e o legado) e os
// passos do servidor. As duas portas de entrada usam esta mesma fachada: o Monitoramento (`signal-runner`) e a conversa do
// Hermes (`signal-cascade`).
import { type ContaDeColeta, type MemoriaDasContas } from '../apify-ambiente.ts'
import { type ClienteRpc, criarDbDaCascata } from './db.ts'
import { clienteAssincronoDoApify } from './fonte-apify.ts'
import { rodarCascata } from './motor.ts'
import { registroDePassos } from './passos/index.ts'
import type { Llm, PedidoDeCascata, ResultadoDaCascata } from './tipos.ts'

export type { ClienteRpc } from './db.ts'
export { MENSAGENS } from './motor.ts'
export { escolherLlmDosSinais } from './llm-seletor.ts'
export type * from './tipos.ts'

export interface MotorDeCascata {
  /** Se o tipo de Sinal é uma cascata (e não um actor do registro). */
  ehCascata(signalType: string): Promise<boolean>
  rodar(pedido: PedidoDeCascata): Promise<ResultadoDaCascata>
  /** O catálogo de cascatas, sem nada técnico. */
  catalogo(): Promise<EntradaDoCatalogo[]>
  /**
   * O plano de um Monitoramento de tipo genérico: as cascatas que atendem o tipo e estão disponíveis, e entre elas as que
   * estão no prazo da cadência (a cascata mensal não roda todo dia). Vazio quando o tipo não é atendido por cascatas.
   */
  planoDoMonitor(monitorId: string): Promise<PlanoDoMonitor>
}

export interface PlanoDoMonitor {
  /** Os `signal_type` das cascatas disponíveis que atendem o tipo do Monitoramento, na ordem do banco. */
  disponiveis: string[]
  /** As disponíveis que estão no prazo da cadência, ainda sem execução dentro dela. */
  devidas: string[]
}

export interface EntradaDoCatalogo {
  signalType: string
  icp: string
  name: string
  state: string
  scope: string
  semFonteMotivo: string | null
  cadenceHours: number
}

export function criarMotorDeCascata(
  { admin, tokens, contas, memoria, fetchFn, log, llm }: {
    admin: ClienteRpc
    tokens: string[]
    contas?: ContaDeColeta[]
    memoria?: MemoriaDasContas
    fetchFn?: typeof fetch
    /** O modelo de linguagem dos passos que classificam texto; sem ele, usam a regra simples. */
    llm?: Llm
    log?: (campos: Record<string, unknown>) => void
  },
): MotorDeCascata {
  const db = criarDbDaCascata(admin)
  const fonte = clienteAssincronoDoApify({ tokens, contas, memoria, fetchFn, log })
  const registro = registroDePassos(fetchFn)
  return {
    async ehCascata(signalType) {
      return (await db.definicao(signalType)) !== null
    },
    rodar: (pedido) => rodarCascata({ db, fonte, registro, llm, log }, pedido),
    async planoDoMonitor(monitorId) {
      const { data, error } = await admin.rpc('signal_type_cascade_plan', { p_monitor_id: monitorId })
      if (error) throw new Error(`signal_type_cascade_plan: ${error.code ?? ''} ${error.message}`.trim())
      const linhas = ((data ?? []) as { cascade_signal_type: string; state: string; due: boolean }[]).filter((l) => l.state === 'available')
      return { disponiveis: linhas.map((l) => l.cascade_signal_type), devidas: linhas.filter((l) => l.due).map((l) => l.cascade_signal_type) }
    },
    async catalogo() {
      const { data, error } = await admin.rpc('signal_cascade_catalog')
      if (error) throw new Error(`signal_cascade_catalog: ${error.code ?? ''} ${error.message}`.trim())
      return ((data ?? []) as {
        signal_type: string
        icp: string
        name: string
        state: string
        scope: string
        sem_fonte_motivo: string | null
        cadence_hours: number
      }[]).map((l) => ({
        signalType: l.signal_type, icp: l.icp, name: l.name, state: l.state, scope: l.scope,
        semFonteMotivo: l.sem_fonte_motivo, cadenceHours: l.cadence_hours,
      }))
    },
  }
}
