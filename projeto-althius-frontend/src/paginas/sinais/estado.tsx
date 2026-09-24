import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { MONITORAMENTOS_INICIAIS, type EstadoDoMonitoramento, type Monitoramento } from './dados-mock'

interface SinaisDoMockup {
  monitoramentos: Monitoramento[]
  salvar: (monitoramento: Monitoramento) => void
  mudarEstado: (id: string, estado: EstadoDoMonitoramento) => void
}

const Contexto = createContext<SinaisDoMockup | null>(null)

/** Guarda em memória os Monitoramentos do mockup enquanto a pessoa navega; recarregar a página recomeça. */
export function SinaisDoMockupProvider({ children }: { children: ReactNode }) {
  const [monitoramentos, setMonitoramentos] = useState(MONITORAMENTOS_INICIAIS)

  const salvar = useCallback((monitoramento: Monitoramento) => {
    setMonitoramentos((atuais) =>
      atuais.some((m) => m.id === monitoramento.id)
        ? atuais.map((m) => (m.id === monitoramento.id ? monitoramento : m))
        : [...atuais, monitoramento],
    )
  }, [])

  const mudarEstado = useCallback((id: string, estado: EstadoDoMonitoramento) => {
    setMonitoramentos((atuais) => atuais.map((m) => (m.id === id ? { ...m, estado } : m)))
  }, [])

  const valor = useMemo(
    () => ({ monitoramentos, salvar, mudarEstado }),
    [monitoramentos, salvar, mudarEstado],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSinaisDoMockup(): SinaisDoMockup {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useSinaisDoMockup precisa de um SinaisDoMockupProvider')
  return valor
}

/** Os Monitoramentos de um tipo, ou todos. */
export function useMonitoramentos(tipoId?: string): Monitoramento[] {
  const { monitoramentos } = useSinaisDoMockup()
  return tipoId ? monitoramentos.filter((m) => m.tipoId === tipoId) : monitoramentos
}
