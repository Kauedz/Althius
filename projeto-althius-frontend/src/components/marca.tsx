import { Eye, Feather, Target, UserRound, type LucideIcon } from 'lucide-react'
import type { EspecialidadeId, EstadoAgente } from '@/fonte/tipos'
import { cn, iniciais } from '@/lib/utils'

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
// Cada Especialidade tem um ícone, e todos os Agentes dela usam o mesmo.
const ICONES: Record<EspecialidadeId, LucideIcon> = {
  scopus: Target,
  ethos: UserRound,
  rhetor: Feather,
  oraculum: Eye,
}

/** O ícone da Especialidade, solto (sidebar, composer). */
export function IconeDaEspecialidade({ especialidade, className }: { especialidade: EspecialidadeId; className?: string }) {
  const Icone = ICONES[especialidade]
  return <Icone strokeWidth={1.8} className={cn('size-4 shrink-0', className)} aria-hidden />
}

/** O ícone da Especialidade num quadro: a identidade de um Agente, sem avatar de personagem. */
export function IconeAgente({ especialidade, tamanho = 'md' }: { especialidade: EspecialidadeId; tamanho?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-al-line bg-al-bg text-al-ink',
        { sm: 'size-6', md: 'size-7', lg: 'size-12' }[tamanho],
      )}
    >
      <IconeDaEspecialidade especialidade={especialidade} className={cn(tamanho === 'sm' && 'size-3.5', tamanho === 'lg' && 'size-6')} />
    </span>
  )
}

const TAMANHOS_DO_AVATAR = { sm: 'size-6.5 text-[0.6875rem]', md: 'size-8 text-xs', lg: 'size-16 text-lg' } as const

/** A foto de uma pessoa num círculo, ou as iniciais do nome quando não há foto. */
export function AvatarDePessoa({
  nome,
  foto,
  tamanho = 'md',
  className,
}: {
  nome: string
  foto?: string
  tamanho?: keyof typeof TAMANHOS_DO_AVATAR
  className?: string
}) {
  const circulo = cn('shrink-0 rounded-full', TAMANHOS_DO_AVATAR[tamanho], className)
  if (foto) {
    return <img src={foto} alt={nome} title={nome} className={cn(circulo, 'object-cover')} />
  }
  return (
    <span
      role="img"
      aria-label={nome}
      title={nome}
      className={cn(circulo, 'grid place-items-center bg-al-line font-normal text-al-ink')}
    >
      {nome ? iniciais(nome) : null}
    </span>
  )
}

export const ROTULO_DO_ESTADO: Record<EstadoAgente, string> = {
  ocioso: 'Disponível',
  trabalhando: 'Trabalhando',
  detectou: 'Detectou algo',
}

/** O pulso quando o Agente trabalha e o ponto rosa quando detectou algo; nada quando está disponível. */
export function IndicadorDeEstado({ estado, className }: { estado: EstadoAgente; className?: string }) {
  if (estado === 'ocioso') return null
  return (
    <span className={cn('relative inline-flex size-2 shrink-0 items-center justify-center', className)} aria-hidden>
      {estado === 'trabalhando' && <span className="pulso-anel absolute -inset-1 rounded-full border border-al-accent" />}
      <span className="size-1.5 rounded-full bg-al-accent" />
    </span>
  )
}

/** Selo de estado de um Agente: o indicador e o rótulo. */
export function SeloDeEstado({ estado }: { estado: EstadoAgente }) {
  return (
    <span className="selo">
      <IndicadorDeEstado estado={estado} />
      {ROTULO_DO_ESTADO[estado]}
    </span>
  )
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
