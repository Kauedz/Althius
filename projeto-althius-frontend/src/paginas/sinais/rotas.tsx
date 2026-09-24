import { Outlet } from 'react-router-dom'
import { SinaisDoMockupProvider } from './estado'

export { ContaComSinais } from './conta-com-sinais'
export { RotaDoEditor } from './editor'
export { PaginaDoTipo } from './pagina-do-tipo'
export { PaginaSinais } from './pagina-sinais'

/** Todas as páginas de Sinais compartilham os Monitoramentos do mockup enquanto a pessoa navega por elas. */
export function LayoutSinais() {
  return (
    <SinaisDoMockupProvider>
      <Outlet />
    </SinaisDoMockupProvider>
  )
}
