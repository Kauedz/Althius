// O modelo de linguagem de UMA execução da cascata: leva o Workspace do pedido (o caminho hermes enfileira por Workspace) e
// protege o prazo da função (150 s). Um passo que classifica em lotes (até 3 lotes de 40) não pode esperar o prazo inteiro
// do modelo a cada lote: depois da primeira falha as chamadas seguintes falham na hora (o passo usa a regra), e o tempo
// somado de modelo da execução tem orçamento. Quem chama trata a falha caindo na regra de palavra-chave.
import type { Llm } from './tipos.ts'

/** O tempo somado de modelo que uma execução aceita gastar (a função inteira dura 150 s, e há actors e a Receita nela). */
export const ORCAMENTO_DO_MODELO_POR_EXECUCAO_MS = 60_000

export const MENSAGEM_MODELO_INDISPONIVEL = 'A classificação está indisponível nesta execução'

export function modeloDaExecucao(
  llm: Llm,
  { workspaceId, agora, orcamentoMs = ORCAMENTO_DO_MODELO_POR_EXECUCAO_MS }: { workspaceId: string; agora: () => number; orcamentoMs?: number },
): Llm {
  let gasto = 0
  let falhou = false
  return {
    async json(a) {
      if (falhou || gasto >= orcamentoMs) throw new Error(MENSAGEM_MODELO_INDISPONIVEL)
      const inicio = agora()
      try {
        return await llm.json({ workspaceId, ...a })
      } catch (e) {
        falhou = true
        throw e
      } finally {
        gasto += Math.max(agora() - inicio, 0)
      }
    },
  }
}
