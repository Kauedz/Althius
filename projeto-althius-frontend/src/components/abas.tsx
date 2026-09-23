import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface ItemDeAba {
  rotulo: ReactNode
  para: string
  end?: boolean
}

export interface AbasSublinhadasProps {
  rotuloAcessivel: string
  abas: ItemDeAba[]
  className?: string
}

/**
 * Navegação por abas sublinhadas compartilhada pelo app.
 * A aba ativa recebe o traço inferior na cor de destaque (--al-accent) e texto com tinta forte (--al-ink).
 */
export function AbasSublinhadas({ rotuloAcessivel, abas, className }: AbasSublinhadasProps) {
  return (
    <nav aria-label={rotuloAcessivel} className={cn('border-b border-al-line', className)}>
      <ul className="flex gap-6">
        {abas.map(({ rotulo, para, end }) => (
          <li key={para}>
            <NavLink
              to={para}
              end={end}
              className={({ isActive }) =>
                cn(
                  '-mb-px block border-b-2 py-4 text-sm font-normal tracking-rotulo uppercase',
                  isActive ? 'border-al-accent text-al-ink' : 'border-transparent text-al-muted hover:text-al-ink',
                )
              }
            >
              {rotulo}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
