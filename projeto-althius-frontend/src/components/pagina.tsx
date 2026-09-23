import { ArrowLeft, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface Props {
  titulo: string
  /** Ícone ao lado do título, nas páginas de primeiro nível. */
  icone?: LucideIcon
  /** Caminho de volta, nas páginas de dentro de outra (ex.: "Agentes / Scopus"). */
  voltar?: { para: string; rotulo: string }
  /** Ações à direita da barra de topo. */
  acoes?: ReactNode
  /** O conteúdo ocupa a janela abaixo da barra de topo, e quem rola é um quadro dentro dele (ex.: uma tabela). */
  ocupaAJanela?: boolean
  className?: string
  children: ReactNode
}

/** Uma página da casca: barra de topo fixa com o título e, abaixo, o conteúdo. */
export function Pagina({ titulo, icone: Icone, voltar, acoes, ocupaAJanela, className, children }: Props) {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-al-line bg-al-bg px-10">
        <div className="flex min-w-0 items-center gap-2">
          {voltar && (
            <>
              <Link to={voltar.para} className="rotulo inline-flex items-center gap-1.5 hover:text-al-ink">
                <ArrowLeft strokeWidth={1.8} className="size-3.5" aria-hidden />
                {voltar.rotulo}
              </Link>
              <span className="rotulo" aria-hidden>
                /
              </span>
            </>
          )}
          {Icone && <Icone strokeWidth={1.8} className="size-[18px] text-al-muted" aria-hidden />}
          <h1 className="titulo-display truncate text-2xl">{titulo}</h1>
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </header>
      <div
        className={cn(
          'flex flex-col gap-6 px-10 pt-6 pb-16',
          // A altura da janela menos a da barra de topo (h-16).
          ocupaAJanela && 'h-[calc(100vh-4rem)] pb-0',
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}
