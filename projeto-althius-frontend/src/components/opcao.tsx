import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Uma escolha em pílula quadrada, marcável: usada em opções múltiplas e em escolhas únicas. */
export function Opcao({
  marcada,
  aoClicar,
  children,
  papel = 'checkbox',
}: {
  marcada: boolean
  aoClicar: () => void
  children: ReactNode
  papel?: 'checkbox' | 'radio'
}) {
  return (
    <button
      type="button"
      role={papel}
      aria-checked={marcada}
      onClick={aoClicar}
      className={cn(
        'h-8 border px-3 text-sm font-normal transition-colors',
        marcada ? 'border-al-accent bg-al-accent/10 text-al-ink' : 'border-al-line text-al-muted hover:border-al-muted hover:text-al-ink',
      )}
    >
      {children}
    </button>
  )
}
