import { Eye, Feather, Target, UserRound, type LucideIcon } from 'lucide-react'
import type { AgenteId, EstadoAgente } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

/**
 * Logo provisório, reconstruído pela malha do manual (x = espessura da haste):
 * Λ com 6x de altura e 5,1x de largura, ponto de 1,5x, folga de 4x até a palavra.
 * Será trocado pelo arquivo-mestre do site.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 6.6" role="img" aria-label="Althius" className={cn('h-6 w-auto', className)}>
      <path d="M2 0.6h1.1l2 6H4l-1.5-4.6L1 6.6H0z" fill="var(--al-ink)" />
      <circle cx="5.9" cy="0.95" r="0.75" fill="var(--al-accent)" />
      <text
        x="9.1"
        y="6.1"
        fill="var(--al-ink)"
        fontFamily="Oswald, 'Arial Narrow', sans-serif"
        fontWeight={600}
        fontSize="4.6"
        letterSpacing="0.2"
      >
        ALTHIUS
      </text>
    </svg>
  )
}

// Lucide é provisório: os ícones desenhados à mão do manual entram quando chegarem os vetores.
const ICONES: Record<AgenteId, LucideIcon> = {
  scopus: Target,
  ethos: UserRound,
  rhetor: Feather,
  oraculum: Eye,
}

export function IconeAgente({
  id,
  estado = 'ocioso',
  tamanho = 'md',
}: {
  id: AgenteId
  estado?: EstadoAgente
  tamanho?: 'md' | 'lg'
}) {
  const Icone = ICONES[id]
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', tamanho === 'lg' ? 'size-12' : 'size-8')}>
      {estado === 'trabalhando' && <Pulso className="absolute inset-0" />}
      <Icone strokeWidth={1.8} className={tamanho === 'lg' ? 'size-8' : 'size-5'} aria-hidden />
      {estado === 'detectou' && (
        <span className="absolute top-0 right-0 size-2 rounded-full bg-al-accent" aria-hidden />
      )}
    </span>
  )
}

export const ROTULO_DO_ESTADO: Record<EstadoAgente, string> = {
  ocioso: 'Disponível',
  trabalhando: 'Trabalhando',
  detectou: 'Detectou algo',
}

/** O pulso do manual: anéis que saem do ponto. Substitui o spinner genérico. */
export function Pulso({ className }: { className?: string }) {
  return (
    <span className={cn('pointer-events-none flex items-center justify-center', className)} aria-hidden>
      <span className="pulso-anel absolute size-full rounded-full border border-al-accent" />
      <span className="size-1.5 rounded-full bg-al-accent" />
    </span>
  )
}

/** Estado de carregamento: pulso no lugar de spinner. */
export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return (
    <div role="status" className="flex items-center gap-4 py-10 text-al-muted">
      <span className="relative size-6">
        <Pulso className="absolute inset-0" />
      </span>
      <span className="rotulo">{rotulo}</span>
    </div>
  )
}
