import { useCallback, useEffect } from 'react'
import { useDadosDeSinais } from '@/fonte/contexto'
import { INTERVALO_DA_CONFERENCIA_EM_MS, type HistoricoDeRodadas, type PreviaDaRodada } from '@/fonte/rodadas-do-sinal'

export interface EstadoDasRodadas {
  /** Se a Fonte oferece Rodar agora e o histórico das Rodadas. A Fonte que não oferece não mostra nada disto. */
  suportado: boolean
  /** A prévia do Rodar agora. Indefinida enquanto carrega; nula quando a Fonte não a oferece. */
  previa: PreviaDaRodada | null | undefined
  /** O histórico e os pedidos abertos. Indefinido enquanto carrega; nulo quando a Fonte não o oferece. */
  historico: HistoricoDeRodadas | null | undefined
  erroDoHistorico: Error | null
  erroDaPrevia: Error | null
  /** Há um pedido na fila ou uma Rodada rodando. */
  emAndamento: boolean
  recarregar: () => void
}

/**
 * As Rodadas de um Monitoramento, lidas uma vez para a página toda (o botão "Rodar agora" e a lista de Rodadas dividem o
 * mesmo estado). Enquanto há um pedido na fila ou uma Rodada rodando, a tela confere a cada 30 segundos; fora disso, não
 * consulta sem parar.
 */
export function useRodadas(monitoramentoId: string | undefined): EstadoDasRodadas {
  const { dados: previa, erro: erroDaPrevia, recarregar: recarregarPrevia } = useDadosDeSinais(
    (f) => (monitoramentoId && f.previaDaRodada ? f.previaDaRodada(monitoramentoId) : Promise.resolve(null)),
    [monitoramentoId],
  )
  const { dados: historico, erro: erroDoHistorico, recarregar: recarregarHistorico } = useDadosDeSinais(
    (f) => (monitoramentoId && f.rodadas ? f.rodadas(monitoramentoId) : Promise.resolve(null)),
    [monitoramentoId],
  )
  const emAndamento = !!historico && (historico.pedidos.length > 0 || historico.rodadas.some((r) => r.estado === 'rodando'))
  const recarregar = useCallback(() => {
    recarregarPrevia()
    recarregarHistorico()
  }, [recarregarPrevia, recarregarHistorico])

  useEffect(() => {
    if (!emAndamento) return
    const conferencia = setInterval(recarregar, INTERVALO_DA_CONFERENCIA_EM_MS)
    return () => clearInterval(conferencia)
  }, [emAndamento, recarregar])

  return {
    suportado: previa !== null && historico !== null,
    previa,
    historico,
    erroDoHistorico,
    erroDaPrevia,
    emAndamento,
    recarregar,
  }
}
