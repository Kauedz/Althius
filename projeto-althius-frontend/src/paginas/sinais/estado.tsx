import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFonteDeSinais } from '@/fonte/contexto'
import type { FonteDeSinais } from '@/fonte/sinais-tipos'
import { MONITORAMENTOS_INICIAIS, type EstadoDoMonitoramento, type Monitoramento } from './dados-mock'

interface SinaisDoMockup {
  monitoramentos: Monitoramento[]
  salvar: (monitoramento: Monitoramento) => void
  mudarEstado: (id: string, estado: EstadoDoMonitoramento) => void
}

const Contexto = createContext<SinaisDoMockup | null>(null)

/** Guarda em memória os Monitoramentos da sessão enquanto a pessoa navega, sincronizado com a FonteDeSinais. */
export function SinaisDoMockupProvider({ children }: { children: ReactNode }) {
  let fonte: FonteDeSinais | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    fonte = useFonteDeSinais()
  } catch {
    // Permite uso sem FonteDeSinaisProvider se algum teste isolado renderizar diretamente
  }

  const [monitoramentos, setMonitoramentos] = useState<Monitoramento[]>(() => {
    return MONITORAMENTOS_INICIAIS
  })

  useEffect(() => {
    if (!fonte) return
    let ativo = true
    fonte
      .monitoramentos()
      .then((dados) => {
        if (ativo) setMonitoramentos(dados)
      })
      .catch(() => {})

    return fonte.observar(() => {
      if (!fonte) return
      fonte
        .monitoramentos()
        .then((dados) => {
          if (ativo) setMonitoramentos(dados)
        })
        .catch(() => {})
    })
  }, [fonte])

  const salvar = useCallback(
    (monitoramento: Monitoramento) => {
      setMonitoramentos((atuais) =>
        atuais.some((m) => m.id === monitoramento.id)
          ? atuais.map((m) => (m.id === monitoramento.id ? monitoramento : m))
          : [...atuais, monitoramento],
      )
      if (fonte) {
        fonte.salvarMonitoramento(monitoramento).catch((err) => console.error(err))
      }
    },
    [fonte],
  )

  const mudarEstado = useCallback(
    (id: string, estado: EstadoDoMonitoramento) => {
      setMonitoramentos((atuais) => atuais.map((m) => (m.id === id ? { ...m, estado } : m)))
      if (fonte) {
        fonte.mudarEstado(id, estado).catch((err) => console.error(err))
      }
    },
    [fonte],
  )

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
