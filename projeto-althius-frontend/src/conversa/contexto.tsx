import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useFonte } from '@/fonte/contexto'
import type { AgenteId, PassoDaConversa } from '@/fonte/tipos'

export type ItemDaConversa =
  | { id: number; tipo: 'usuario'; texto: string }
  | ({ id: number } & PassoDaConversa)

interface EstadoDasConversas {
  itens: Partial<Record<AgenteId, ItemDaConversa[]>>
  respondendo: Partial<Record<AgenteId, boolean>>
}

interface Conversas {
  itens(agenteId: AgenteId): ItemDaConversa[]
  respondendo(agenteId: AgenteId): boolean
  enviar(agenteId: AgenteId, mensagem: { texto: string; sugestaoId?: string }): void
  animarDigitacao: boolean
}

const ContextoDasConversas = createContext<Conversas | null>(null)

/** Tempo de digitação por caractere, para o próximo passo esperar o texto terminar de aparecer. */
export const MS_POR_CARACTERE = 6

let proximoId = 1

/** Guarda as Conversas de cada Agente durante a sessão, mesmo trocando de tela. */
export function ConversasProvider({ children, animarDigitacao }: { children: ReactNode; animarDigitacao: boolean }) {
  const fonte = useFonte()
  const [estado, setEstado] = useState<EstadoDasConversas>({ itens: {}, respondendo: {} })

  const adicionar = useCallback((agenteId: AgenteId, item: ItemDaConversa) => {
    setEstado((atual) => ({
      ...atual,
      itens: { ...atual.itens, [agenteId]: [...(atual.itens[agenteId] ?? []), item] },
    }))
  }, [])

  const definirRespondendo = useCallback((agenteId: AgenteId, valor: boolean) => {
    setEstado((atual) => ({ ...atual, respondendo: { ...atual.respondendo, [agenteId]: valor } }))
  }, [])

  const enviar = useCallback(
    async (agenteId: AgenteId, mensagem: { texto: string; sugestaoId?: string }) => {
      adicionar(agenteId, { id: proximoId++, tipo: 'usuario', texto: mensagem.texto })
      definirRespondendo(agenteId, true)
      try {
        for await (const passo of fonte.conversar(agenteId, mensagem)) {
          adicionar(agenteId, { id: proximoId++, ...passo })
          if (animarDigitacao && passo.tipo === 'texto') {
            await new Promise((resolver) => setTimeout(resolver, passo.texto.length * MS_POR_CARACTERE))
          }
        }
      } finally {
        definirRespondendo(agenteId, false)
      }
    },
    [fonte, adicionar, definirRespondendo, animarDigitacao],
  )

  const valor = useMemo<Conversas>(
    () => ({
      itens: (agenteId) => estado.itens[agenteId] ?? [],
      respondendo: (agenteId) => estado.respondendo[agenteId] ?? false,
      enviar: (agenteId, mensagem) => void enviar(agenteId, mensagem),
      animarDigitacao,
    }),
    [estado, enviar, animarDigitacao],
  )

  return <ContextoDasConversas.Provider value={valor}>{children}</ContextoDasConversas.Provider>
}

export function useConversas(): Conversas {
  const conversas = useContext(ContextoDasConversas)
  if (!conversas) throw new Error('useConversas precisa de um ConversasProvider')
  return conversas
}
