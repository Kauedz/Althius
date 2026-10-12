import { useCallback, useLayoutEffect, useRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** O tamanho máximo, em px, do esmaecido de cada borda. */
const ESMAECIDO = 24

/**
 * Uma área que rola sem mostrar barra de rolagem: a rolagem continua nativa (roda do mouse, toque, teclado), e só as
 * bordas com conteúdo escondido ficam esmaecidas, na medida do que falta ver. A técnica é a do Scroll Area do UIarc,
 * do catálogo do Shoogle, sem as barras sobrepostas. Usada no menu lateral, onde a barra do navegador fica feia.
 */
export function RolagemDiscreta({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const area = useRef<HTMLDivElement>(null)

  const sincronizar = useCallback(() => {
    const no = area.current
    if (!no) return
    const falta = Math.max(0, no.scrollHeight - no.clientHeight)
    no.style.setProperty('--esmaecer-topo', `${Math.min(ESMAECIDO, no.scrollTop)}px`)
    no.style.setProperty('--esmaecer-base', `${Math.min(ESMAECIDO, falta - no.scrollTop)}px`)
  }, [])

  useLayoutEffect(() => {
    const no = area.current
    if (!no) return
    sincronizar()
    const observador = new ResizeObserver(sincronizar)
    observador.observe(no)
    Array.from(no.children).forEach((filho) => observador.observe(filho))
    return () => observador.disconnect()
  }, [sincronizar])

  return (
    <div ref={area} onScroll={sincronizar} className={cn('rolagem-discreta', className)} {...props}>
      {children}
    </div>
  )
}
