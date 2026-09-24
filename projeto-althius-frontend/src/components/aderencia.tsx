import type { Aderencia } from '@/fonte/contas-tipos'

/** A Aderência de uma Conta-alvo (Fit ou Não fit) como aparece no módulo, ou "—" quando ainda não foi avaliada. */
export function SeloDeAderencia({ aderencia }: { aderencia?: Aderencia }) {
  if (!aderencia) {
    return (
      <span
        title="Aderência ainda não avaliada"
        aria-label="Aderência ainda não avaliada"
        className="text-al-muted"
      >
        —
      </span>
    )
  }

  if (aderencia === 'fit') {
    return <span className="text-al-ink">Fit</span>
  }

  return <span className="text-al-muted">Não fit</span>
}
