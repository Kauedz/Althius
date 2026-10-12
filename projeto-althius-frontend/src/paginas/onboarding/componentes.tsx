// Peças que os passos do onboarding, o checklist e a troca de ramo da demonstração compartilham.
import type { ReactNode } from 'react'
import type { EstadoDeOnboarding, FonteDeOnboarding } from '@/fonte/onboarding-tipos'
import { cn } from '@/lib/utils'

export const BOTAO_PRIMARIO =
  'rounded-md inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-al-accent bg-al-accent px-4 text-sm font-normal tracking-[0.04em] text-al-on-accent transition-colors hover:border-al-accent-2 hover:bg-al-accent-2 disabled:pointer-events-none disabled:opacity-50'
export const BOTAO_SECUNDARIO =
  'rounded-md inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-al-line bg-al-bg px-4 text-sm font-normal tracking-[0.04em] text-al-ink transition-colors hover:border-al-muted hover:bg-al-surface disabled:pointer-events-none disabled:opacity-50'

/** No protótipo, este parâmetro no endereço simula a chegada por um link de convite. */
export const PARAMETRO_DE_CONVITE = 'convite'

export interface PropsDaEtapa {
  estado: EstadoDeOnboarding
  fonte: FonteDeOnboarding
}

export function EscolhaUnica<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string
  opcoes: readonly T[]
  valor: T | null
  aoEscolher: (valor: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((opcao) => {
        const ativa = valor === opcao
        return (
          <button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={ativa}
            onClick={() => aoEscolher(opcao)}
            className={cn('rounded-lg border px-3 py-2 text-sm', ativa ? 'border-al-ink bg-al-ink text-al-bg' : 'border-al-line bg-al-surface')}
          >
            {opcao}
          </button>
        )
      })}
    </div>
  )
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="rotulo">{rotulo}</span>
      {children}
    </label>
  )
}
