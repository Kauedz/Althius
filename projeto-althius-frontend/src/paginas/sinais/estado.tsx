import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFonteDeSinais } from '@/fonte/contexto'
import type { FonteDeSinais, NovoMonitoramento, ParametrosSimulacaoDisparo, SinalEncontrado } from '@/fonte/sinais-tipos'
import type { EstadoDoMonitoramento, Monitoramento } from './dados-mock'

interface SinaisDoMockup {
  monitoramentos: Monitoramento[]
  salvar: (monitoramento: Monitoramento | NovoMonitoramento) => Promise<Monitoramento>
  mudarEstado: (id: string, estado: EstadoDoMonitoramento) => Promise<Monitoramento>
  simularDisparo: (parametros: ParametrosSimulacaoDisparo) => Promise<SinalEncontrado>
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

  // Os Monitoramentos vêm só da fonte do ambiente: a da Demonstração traz os de exemplo; um Workspace real, os seus.
  const [monitoramentos, setMonitoramentos] = useState<Monitoramento[]>([])

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
    async (monitoramento: Monitoramento | NovoMonitoramento): Promise<Monitoramento> => {
      if (fonte) {
        const salvo = await fonte.salvarMonitoramento(monitoramento)
        setMonitoramentos((atuais) => {
          const index = atuais.findIndex((m) => m.id === monitoramento.id || m.id === salvo.id)
          if (index >= 0) {
            const copia = [...atuais]
            copia[index] = salvo
            return copia
          }
          return [...atuais, salvo]
        })
        return salvo
      }
      // Sem fonte o rascunho fica só na sessão. O operacional sempre tem fonte e não passa por aqui.
      const gravado = monitoramento as Monitoramento
      setMonitoramentos((atuais) =>
        atuais.some((m) => m.id === gravado.id)
          ? atuais.map((m) => (m.id === gravado.id ? gravado : m))
          : [...atuais, gravado],
      )
      return gravado
    },
    [fonte],
  )

  const mudarEstado = useCallback(
    async (id: string, estado: EstadoDoMonitoramento): Promise<Monitoramento> => {
      if (fonte) {
        const atualizado = await fonte.mudarEstado(id, estado)
        setMonitoramentos((atuais) =>
          atuais.map((m) => (m.id === id ? atualizado : m)),
        )
        return atualizado
      }
      setMonitoramentos((atuais) =>
        atuais.map((m) => (m.id === id ? { ...m, estado } : m)),
      )
      const enc = monitoramentos.find((m) => m.id === id)
      return enc ? { ...enc, estado } : ({ id, estado } as Monitoramento)
    },
    [fonte, monitoramentos],
  )

  const simularDisparo = useCallback(
    async (parametros: ParametrosSimulacaoDisparo): Promise<SinalEncontrado> => {
      if (fonte) {
        return fonte.simularDisparo(parametros)
      }
      throw new Error('Fonte de sinais não disponível')
    },
    [fonte],
  )

  const valor = useMemo(
    () => ({ monitoramentos, salvar, mudarEstado, simularDisparo }),
    [monitoramentos, salvar, mudarEstado, simularDisparo],
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
