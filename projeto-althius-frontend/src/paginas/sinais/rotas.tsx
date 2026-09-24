import { Outlet } from 'react-router-dom'

export { ContaComSinais } from './conta-com-sinais'
export { RotaDoEditor } from './editor'
export { PaginaDoTipo } from './pagina-do-tipo'
export { PaginaSinais } from './pagina-sinais'

/** Todas as páginas de Sinais compartilham os Monitoramentos salvos durante a sessão. */
export function LayoutSinais() {
  return <Outlet />
}
