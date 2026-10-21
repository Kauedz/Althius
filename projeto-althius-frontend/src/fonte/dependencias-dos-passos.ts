import type { LiberacaoDoPasso, StepSequencia } from './sequencias-tipos'

const LIBERACOES: readonly LiberacaoDoPasso[] = ['ativacao', 'predecessor', 'manual']

export function ehLiberacaoDoPasso(valor: unknown): valor is LiberacaoDoPasso {
  return typeof valor === 'string' && (LIBERACOES as readonly string[]).includes(valor)
}

/** Documento legado: nenhum passo declara liberação explícita. A ordem visual ainda manda na execução serial. */
export function documentoComLiberacaoExplicita(
  steps: readonly Pick<StepSequencia, 'id' | 'liberacao' | 'predecessorId'>[],
): boolean {
  return steps.some((step) => step.liberacao != null || (step.predecessorId != null && step.predecessorId !== ''))
}

/**
 * Valida as condições de liberação do documento (ADR-0031 / ticket 01).
 * Passos sem `liberacao` e sem `predecessorId` são legados e não entram no grafo.
 * Rejeita autorreferência, predecessor ausente, ciclo e liberação inconsistente.
 */
export function validarDependenciasDosPassos(
  steps: readonly Pick<StepSequencia, 'id' | 'liberacao' | 'predecessorId'>[],
): void {
  const ids = new Set<string>()
  for (const step of steps) {
    if (!step.id || typeof step.id !== 'string') {
      throw new Error('Cada passo precisa de um id estável.')
    }
    if (ids.has(step.id)) {
      throw new Error(`Há dois passos com o id "${step.id}".`)
    }
    ids.add(step.id)
  }

  const edges = new Map<string, string>()

  for (const step of steps) {
    const liberacao = step.liberacao
    const predecessorId = step.predecessorId?.trim() ? step.predecessorId.trim() : undefined

    if (liberacao != null && !ehLiberacaoDoPasso(liberacao)) {
      throw new Error('Liberação inválida: use ativacao, predecessor ou manual.')
    }

    if (liberacao === 'predecessor' || (liberacao == null && predecessorId)) {
      if (!predecessorId) {
        throw new Error('Passo com liberação por predecessor precisa de predecessorId.')
      }
      if (predecessorId === step.id) {
        throw new Error('Um passo não pode depender de si mesmo.')
      }
      if (!ids.has(predecessorId)) {
        throw new Error('O predecessor precisa existir na mesma Sequência.')
      }
      edges.set(step.id, predecessorId)
      continue
    }

    if (predecessorId) {
      throw new Error('predecessorId só é permitido com liberação predecessor.')
    }
  }

  detectarCiclos(edges)
}

function detectarCiclos(edges: Map<string, string>): void {
  const estado = new Map<string, 'visitando' | 'feito'>()

  function visitar(id: string): void {
    const atual = estado.get(id)
    if (atual === 'feito') return
    if (atual === 'visitando') {
      throw new Error('Há um ciclo de dependência entre os passos.')
    }
    estado.set(id, 'visitando')
    const pred = edges.get(id)
    if (pred) visitar(pred)
    estado.set(id, 'feito')
  }

  for (const id of edges.keys()) {
    visitar(id)
  }
}
