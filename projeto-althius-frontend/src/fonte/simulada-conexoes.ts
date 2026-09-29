import * as demo from './dados-demo'
import type { ArmazenamentoDemonstrativo } from './simulada-participacoes'
import type { CanalId, CategoriaDeIntegracao, IntegracaoFutura, IntegracaoId, PreviaDeCanal } from './tipos'
import type { FonteDeConexoes } from './conexoes-tipos'

export interface OpcoesFonteDeConexoesSimulada {
  atrasoMs?: number
  armazenamento?: ArmazenamentoDemonstrativo | null
}

/**
 * A Fonte de Conexões da Demonstração: preserva o fluxo simulado de Canais, Integrações e prévias.
 */
export function criarFonteDeConexoesSimulada({
  atrasoMs = 0,
}: OpcoesFonteDeConexoesSimulada = {}): FonteDeConexoes {
  const ouvintes = new Set<() => void>()
  const estado = structuredClone({
    canais: demo.canais,
    integracoes: demo.integracoes,
    previas: demo.previas,
  })

  function avisar() {
    ouvintes.forEach((o) => o())
  }

  async function responder<T>(obter: () => T): Promise<T> {
    if (atrasoMs > 0) await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    return obter()
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    canais: () =>
      responder(() =>
        estado.canais.map((c) => ({
          ...c,
          estado: c.conectado ? 'conectado' : 'nao_conectado',
        })),
      ),

    integracoes: () =>
      responder(() =>
        estado.integracoes.map((i) => ({
          ...i,
          categoria: i.categoria as CategoriaDeIntegracao,
          estado: i.conectada ? 'habilitada' : 'nao_habilitada',
          habilitada: i.conectada,
        })),
      ),

    integracoesFuturas: () => responder(() => demo.integracoesFuturas as IntegracaoFutura[]),

    conectar: (conexao: CanalId | IntegracaoId) =>
      responder(() => {
        const canal = estado.canais.find((c) => c.id === conexao)
        if (canal) canal.conectado = true
        const integracao = estado.integracoes.find((i) => i.id === conexao)
        if (integracao) integracao.conectada = true
        avisar()
      }),

    habilitarIntegracao: (id: IntegracaoId) =>
      responder(() => {
        const integracao = estado.integracoes.find((i) => i.id === id)
        if (integracao) integracao.conectada = true
        avisar()
      }),

    previaDeCanal: (canalId: CanalId): Promise<PreviaDeCanal> =>
      responder(() => {
        const previa = estado.previas.find((p) => p.canalId === canalId)
        if (!previa) throw new Error(`Sem prévia para o canal: ${canalId}`)
        return previa
      }),
  }
}
