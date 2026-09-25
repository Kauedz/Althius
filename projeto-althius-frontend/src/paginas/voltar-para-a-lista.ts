import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** A lista de onde o detalhe foi aberto: o endereço com o recorte e o rótulo da migalha. */
export interface ListaDeOrigem {
  para: string
  rotulo: string
}

/** O estado da navegação: indo da lista ao detalhe leva a lista; voltando pela migalha, avisa a lista. */
export interface EstadoDaNavegacao {
  lista?: ListaDeOrigem
  voltandoParaALista?: boolean
}

/** O estado dos links da lista para o detalhe, para a migalha do detalhe voltar a esta lista, com o recorte. */
export function useEstadoParaODetalhe(rotulo: string): EstadoDaNavegacao {
  const { pathname, search } = useLocation()
  return { lista: { para: pathname + search, rotulo } }
}

/** A migalha do detalhe: a lista de onde ele foi aberto ou, aberto direto pelo endereço, a `padrao`. */
export function useMigalhaParaALista(padrao: ListaDeOrigem): ListaDeOrigem & { estado?: EstadoDaNavegacao } {
  const { state } = useLocation()
  const lista = (state as EstadoDaNavegacao | null)?.lista
  const valida = typeof lista?.para === 'string' && lista.para.startsWith('/') && typeof lista.rotulo === 'string'
  if (!valida) return padrao
  const estado: EstadoDaNavegacao = { voltandoParaALista: true }
  return { para: lista.para, rotulo: lista.rotulo, estado }
}

type PosicoesDasListas = Map<string, { topo: number; esquerda: number }>

/**
 * A posição do quadro de cada lista, pelo endereço com o recorte, enquanto o app está aberto. Cada app montado, um
 * por ambiente, tem as suas: outro ambiente não herda a rolagem do anterior.
 */
export const ContextoDasPosicoesDasListas = createContext<PosicoesDasListas | null>(null)

export const criarPosicoesDasListas = (): PosicoesDasListas => new Map()

/**
 * A rolagem do quadro da lista: guardada ao sair e restaurada ao voltar, pelo voltar do navegador ou pela migalha
 * do detalhe, quando a lista termina de carregar. Entrando por outro caminho (a sidebar, as abas), começa no topo.
 */
export function useRolagemDaLista(pronta: boolean) {
  const posicoes = useContext(ContextoDasPosicoesDasListas)
  if (!posicoes) throw new Error('useRolagemDaLista precisa de um ContextoDasPosicoesDasListas')
  const { pathname, search, key, state } = useLocation()
  const tipoDeNavegacao = useNavigationType()
  const quadro = useRef<HTMLDivElement>(null)
  const navegacaoJaRestaurada = useRef<string | null>(null)
  const endereco = pathname + search
  const voltando = tipoDeNavegacao === 'POP' || !!(state as EstadoDaNavegacao | null)?.voltandoParaALista

  useLayoutEffect(() => {
    const elemento = quadro.current
    if (!pronta || !elemento) return
    if (navegacaoJaRestaurada.current !== key) {
      navegacaoJaRestaurada.current = key
      const posicao = voltando ? posicoes.get(endereco) : undefined
      if (posicao) {
        elemento.scrollTop = posicao.topo
        elemento.scrollLeft = posicao.esquerda
      }
    }
    // Guarda ao sair da lista, e também quando a busca ou um filtro trocam o endereço. Um quadro que o React já
    // tirou da página (a busca esvaziou a tabela) lê 0 e não guarda nada.
    return () => {
      if (elemento.isConnected) posicoes.set(endereco, { topo: elemento.scrollTop, esquerda: elemento.scrollLeft })
    }
  }, [posicoes, pronta, key, endereco, voltando])

  return quadro
}
