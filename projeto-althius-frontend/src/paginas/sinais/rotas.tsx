import { Outlet } from 'react-router-dom'

export { ContaComSinais } from './conta-com-sinais'
export { RotaDoEditor } from './editor'
export { RotaDoEditorDeCascata } from './editor-de-cascata'
export { PaginaDoTipo } from './pagina-do-tipo'
export { PaginaSinais } from './pagina-sinais'
export { PaginaDePedidoDeSinal } from './pedido-de-sinal'
export { PaginaDeSinaisDeMercado, PaginaIndiceDeMercado } from './sinais-de-mercado'

/** Todas as páginas de Sinais compartilham os Monitoramentos salvos durante a sessão. */
export function LayoutSinais() {
  return <Outlet />
}
