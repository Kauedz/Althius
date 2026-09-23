import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { FonteDeAgentes, FonteDeContas, FonteObservavel } from './tipos'

const ContextoDaFonte = createContext<FonteDeAgentes | null>(null)

export function FonteProvider({ fonte, children }: { fonte: FonteDeAgentes; children: ReactNode }) {
  return <ContextoDaFonte.Provider value={fonte}>{children}</ContextoDaFonte.Provider>
}

export function useFonte(): FonteDeAgentes {
  const fonte = useContext(ContextoDaFonte)
  if (!fonte) throw new Error('useFonte precisa de um FonteProvider')
  return fonte
}

const ContextoDaFonteDeContas = createContext<FonteDeContas | null>(null)

export function FonteDeContasProvider({ fonte, children }: { fonte: FonteDeContas; children: ReactNode }) {
  return <ContextoDaFonteDeContas.Provider value={fonte}>{children}</ContextoDaFonteDeContas.Provider>
}

export function useFonteDeContas(): FonteDeContas {
  const fonte = useContext(ContextoDaFonteDeContas)
  if (!fonte) throw new Error('useFonteDeContas precisa de um FonteDeContasProvider')
  return fonte
}

export interface EstadoDoCarregamento<T> {
  dados: T | undefined
  carregando: boolean
  erro: Error | null
  recarregar: () => void
}

/**
 * Carrega dados de qualquer fonte observável e recarrega sempre que ela avisa uma mudança.
 */
export function useCarregamento<F extends FonteObservavel, T>(
  fonte: F,
  carregar: (fonte: F) => Promise<T>,
  dependencias: unknown[],
): EstadoDoCarregamento<T> {
  const [dados, setDados] = useState<{ chave: string; valor: T }>()
  const [erro, setErro] = useState<{ chave: string; erro: Error } | null>(null)
  const [versao, setVersao] = useState(0)
  const chave = JSON.stringify(dependencias)

  const recarregar = useCallback(() => {
    setVersao((v) => v + 1)
  }, [])

  useEffect(() => fonte.observar(recarregar), [fonte, recarregar])

  useEffect(() => {
    let ativo = true
    setErro(null)
    carregar(fonte)
      .then((valor) => {
        if (ativo) {
          setDados({ chave, valor })
          setErro(null)
        }
      })
      .catch((err) => {
        if (ativo) {
          setErro({ chave, erro: err instanceof Error ? err : new Error(String(err)) })
        }
      })
    return () => {
      ativo = false
    }
    // `carregar` muda a cada render; as dependências declaradas controlam a recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte, versao, chave])

  const dadosAtuais = dados?.chave === chave ? dados.valor : undefined
  const erroAtual = erro?.chave === chave ? erro.erro : null
  const carregando = dadosAtuais === undefined && erroAtual === null

  return {
    dados: dadosAtuais,
    carregando,
    erro: erroAtual,
    recarregar,
  }
}

/**
 * Carrega dados da fonte e recarrega sempre que ela avisa uma mudança.
 * Devolve `undefined` enquanto a primeira carga não termina.
 *
 * Pode ser chamado usando a fonte padrão de Agentes do contexto:
 *   `useDados((fonte) => fonte.agentes(), [])`
 * Ou passando explicitamente qualquer fonte observável:
 *   `useDados(fonte, (f) => f.itens(), [])`
 */
export function useDados<T>(carregar: (fonte: FonteDeAgentes) => Promise<T>, dependencias: unknown[]): T | undefined
export function useDados<F extends FonteObservavel, T>(
  fonte: F,
  carregar: (fonte: F) => Promise<T>,
  dependencias: unknown[],
): T | undefined
export function useDados<T>(
  carregarOuFonte: ((fonte: FonteDeAgentes) => Promise<T>) | FonteObservavel,
  dependenciasOuCarregar: unknown[] | ((fonte: any) => Promise<T>),
  dependenciasSeFonte?: unknown[],
): T | undefined {
  const fontePadrao = useContext(ContextoDaFonte)

  const ehFonteExplicita =
    typeof carregarOuFonte === 'object' && carregarOuFonte !== null && 'observar' in carregarOuFonte

  const fonte = ehFonteExplicita ? (carregarOuFonte as FonteObservavel) : fontePadrao
  const carregar = (ehFonteExplicita ? dependenciasOuCarregar : carregarOuFonte) as (
    fonte: FonteObservavel,
  ) => Promise<T>
  const dependencias = (ehFonteExplicita ? dependenciasSeFonte : dependenciasOuCarregar) as unknown[]

  if (!fonte) {
    throw new Error('useDados precisa de um FonteProvider ou de uma fonte passada explicitamente')
  }

  const { dados } = useCarregamento(fonte, carregar, dependencias)
  return dados
}

/**
 * Carrega dados da FonteDeContas do contexto com estado completo de carregamento (dados, carregando, erro e recarregar).
 */
export function useDadosDeContas<T>(
  carregar: (fonte: FonteDeContas) => Promise<T>,
  dependencias: unknown[] = [],
): EstadoDoCarregamento<T> {
  const fonte = useFonteDeContas()
  return useCarregamento(fonte, carregar, dependencias)
}
