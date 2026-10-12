import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ScrollProgress, type ScrollProgressSection } from '@/components/ui/scroll-progress'

/** Mais seções que isso deixam a pílula alta demais; as primeiras bastam para saltar pela página. */
const MAXIMO_DE_SECOES = 8
/** A página só ganha o indicador quando rola de verdade: sobra ao menos ~160px de página abaixo da tela. */
const FOLGA_MINIMA_DE_ROLAGEM = 160

/** Os títulos de seção (h2) visíveis da página, com um id estável para a pílula saltar até eles. */
function lerSecoes(): ScrollProgressSection[] {
  const principal = document.querySelector('main')
  if (!principal) return []
  const titulos = Array.from(principal.querySelectorAll<HTMLElement>('h2')).filter(
    (titulo) => titulo.offsetParent !== null && !titulo.closest('[role="dialog"]'),
  )
  return titulos.slice(0, MAXIMO_DE_SECOES).flatMap((titulo, i) => {
    const rotulo = titulo.textContent?.trim().replace(/\s+/g, ' ')
    if (!rotulo) return []
    if (!titulo.id) titulo.id = `secao-${i}`
    return [{ id: titulo.id, label: rotulo.length > 36 ? `${rotulo.slice(0, 35)}…` : rotulo }]
  })
}

function mesmasSecoes(a: ScrollProgressSection[], b: ScrollProgressSection[]) {
  return a.length === b.length && a.every((secao, i) => secao.id === b[i].id && secao.label === b[i].label)
}

/**
 * O indicador de leitura da página (Scroll Progress, rareui.com): uma pílula fixa embaixo que mostra quanto da página
 * já foi lida e a seção atual, e abre num menu para saltar entre as seções. As seções são os títulos h2 de cada
 * página, lidos depois que a página desenha; sem rolagem ou com menos de duas seções, ele não aparece.
 */
export function IndicadorDeSecoes() {
  const { pathname } = useLocation()
  const [secoes, setSecoes] = useState<ScrollProgressSection[]>([])
  const [rola, setRola] = useState(false)

  useEffect(() => {
    let quadro = 0
    const atualizar = () => {
      quadro = 0
      const proximas = lerSecoes()
      setSecoes((atuais) => (mesmasSecoes(atuais, proximas) ? atuais : proximas))
      const folga = document.documentElement.scrollHeight - window.innerHeight
      // A Conversa tem o composer fixo embaixo, no lugar da pílula.
      setRola(folga > FOLGA_MINIMA_DE_ROLAGEM && !document.querySelector('.rodape-da-conversa'))
    }
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(atualizar)
    }
    agendar()
    const principal = document.querySelector('main')
    const observador = new MutationObserver(agendar)
    if (principal) observador.observe(principal, { childList: true, subtree: true })
    window.addEventListener('resize', agendar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
      window.removeEventListener('resize', agendar)
    }
  }, [pathname])

  if (!rola || secoes.length < 2) return null
  return (
    <ScrollProgress
      // O mesmo conjunto de seções mantém a pílula; outra página começa do zero.
      key={pathname}
      sections={secoes}
      className="left-[calc(50%+var(--barra-lateral)/2)]"
    />
  )
}
