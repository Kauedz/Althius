import { useEffect, useState } from 'react'
import type { AgendaDoSinal } from '@/fonte/agenda-do-sinal'
import { useFonteDeSinais } from '@/fonte/contexto'
import type { EstimativaDoSinal } from '@/fonte/preco-por-rodada'

export interface EstadoDaEstimativa {
  /** Se a Fonte calcula a estimativa. A que não calcula não mostra nada disto. */
  suportada: boolean
  /** A estimativa da Agenda pedida. Indefinida enquanto carrega (ou quando não se pediu); nula quando o cálculo falhou. */
  estimativa: EstimativaDoSinal | null | undefined
}

const chaveDaAgenda = (agenda: AgendaDoSinal | undefined) => (agenda ? `${agenda.horarios.join(',')}|${agenda.dias.join(',')}` : 'gravada')

/**
 * A estimativa em créditos de um Monitoramento (agente-de-sinal 04): para a Agenda que a tela propõe, ou para a gravada quando
 * `agenda` é ausente. Só calcula com `ativo` (por exemplo, enquanto a Agenda proposta vale ou a confirmação está aberta). Uma
 * resposta velha nunca aparece no lugar da nova: o resultado leva a chave do que foi pedido. `versao` refaz o cálculo (por exemplo,
 * depois de liberar a automação).
 */
export function useEstimativa(monitoramentoId: string, agenda: AgendaDoSinal | undefined, ativo = true, versao = 0): EstadoDaEstimativa {
  const fonte = useFonteDeSinais()
  const suportada = !!fonte.estimarAgenda
  const chave = `${monitoramentoId}|${chaveDaAgenda(agenda)}|${versao}`
  const [resultado, setResultado] = useState<{ chave: string; estimativa: EstimativaDoSinal | null } | null>(null)

  useEffect(() => {
    if (!ativo || !fonte.estimarAgenda) {
      setResultado(null)
      return
    }
    let vivo = true
    fonte
      .estimarAgenda(monitoramentoId, agenda)
      .then((estimativa) => vivo && setResultado({ chave, estimativa }))
      .catch(() => vivo && setResultado({ chave, estimativa: null }))
    return () => {
      vivo = false
    }
    // A Agenda entra pela chave: o mesmo conteúdo não refaz o cálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte, monitoramentoId, chave, ativo])

  return { suportada, estimativa: ativo && resultado?.chave === chave ? resultado.estimativa : undefined }
}
