import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { FonteDeAgentes } from './tipos'

const ContextoDaFonte = createContext<FonteDeAgentes | null>(null)

export function FonteProvider({ fonte, children }: { fonte: FonteDeAgentes; children: ReactNode }) {
  return <ContextoDaFonte.Provider value={fonte}>{children}</ContextoDaFonte.Provider>
}

export function useFonte(): FonteDeAgentes {
  const fonte = useContext(ContextoDaFonte)
  if (!fonte) throw new Error('useFonte precisa de um FonteProvider')
  return fonte
}

/**
 * Carrega dados da fonte e recarrega sempre que ela avisa uma mudança.
 * Devolve `undefined` enquanto a primeira carga não termina.
 */
export function useDados<T>(carregar: (fonte: FonteDeAgentes) => Promise<T>, dependencias: unknown[]): T | undefined {
  const fonte = useFonte()
  const [dados, setDados] = useState<{ chave: string; valor: T }>()
  const [versao, setVersao] = useState(0)
  const chave = JSON.stringify(dependencias)

  useEffect(() => fonte.observar(() => setVersao((v) => v + 1)), [fonte])

  useEffect(() => {
    let ativo = true
    carregar(fonte).then((valor) => {
      if (ativo) setDados({ chave, valor })
    })
    return () => {
      ativo = false
    }
    // `carregar` muda a cada render; as dependências declaradas controlam a recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte, versao, chave])

  // Ao trocar as dependências, não mostra os dados antigos de outro Agente.
  return dados?.chave === chave ? dados.valor : undefined
}
