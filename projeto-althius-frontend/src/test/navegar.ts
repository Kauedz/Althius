import { act } from '@testing-library/react'

/**
 * Vai a uma rota no app aberto sobre o histórico do navegador (`renderizarAppNoNavegador`, ou `noNavegador`), como quem
 * digita o endereço sem recarregar: a Fonte e o estado da sessão continuam. Serve às páginas sem link na interface, como
 * as dos Agentes antigos, que saíram da barra lateral no Sinais first 10.
 */
export function navegarPara(rota: string) {
  act(() => {
    window.history.pushState(null, '', rota)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}
