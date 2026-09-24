import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { MONITORAMENTOS_INICIAIS, type EstadoDoMonitoramento, type Monitoramento } from './dados-mock'

/** Estados ilustrativos da página principal, escolhidos à mão para revisar o mockup. */
export type EstadoDaTela = 'normal' | 'carregando' | 'falha' | 'sem-monitoramentos' | 'sem-resultados'

export const ROTULO_DO_ESTADO_DA_TELA: Record<EstadoDaTela, string> = {
  normal: 'Com dados',
  carregando: 'Carregando',
  falha: 'Falha recuperável',
  'sem-monitoramentos': 'Sem Monitoramentos',
  'sem-resultados': 'Sem Sinais encontrados',
}

interface SinaisDoMockup {
  monitoramentos: Monitoramento[]
  estadoDaTela: EstadoDaTela
  mudarEstadoDaTela: (estado: EstadoDaTela) => void
  salvar: (monitoramento: Monitoramento) => void
  mudarEstado: (id: string, estado: EstadoDoMonitoramento) => void
}

const Contexto = createContext<SinaisDoMockup | null>(null)

/** Guarda em memória os Monitoramentos do mockup enquanto a pessoa navega; recarregar a página recomeça. */
export function SinaisDoMockupProvider({ children }: { children: ReactNode }) {
  const [monitoramentos, setMonitoramentos] = useState(MONITORAMENTOS_INICIAIS)
  const [estadoDaTela, mudarEstadoDaTela] = useState<EstadoDaTela>('normal')

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
    () => ({ monitoramentos, estadoDaTela, mudarEstadoDaTela, salvar, mudarEstado }),
    [monitoramentos, estadoDaTela, salvar, mudarEstado],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSinaisDoMockup(): SinaisDoMockup {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useSinaisDoMockup precisa de um SinaisDoMockupProvider')
  return valor
}

/** Os Monitoramentos visíveis: o estado "Sem Monitoramentos" esconde todos, para revisar a tela vazia. */
export function useMonitoramentos(tipoId?: string): Monitoramento[] {
  const { monitoramentos, estadoDaTela } = useSinaisDoMockup()
  if (estadoDaTela === 'sem-monitoramentos') return []
  return tipoId ? monitoramentos.filter((m) => m.tipoId === tipoId) : monitoramentos
}
