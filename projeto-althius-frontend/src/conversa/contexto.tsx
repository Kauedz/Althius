import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFonte } from '@/fonte/contexto'
import type { AgenteId, Mensagem, PassoDaConversa, PassoDaCoordenacao } from '@/fonte/tipos'

export type ItemDaConversa =
  | { id: number; tipo: 'usuario'; texto: string }
  | ({ id: number } & PassoDaConversa)

export type ItemDaCoordenacao =
  | { id: number; tipo: 'pedido'; texto: string }
  | ({ id: number } & PassoDaCoordenacao)

interface EstadoDasConversas {
  itens: Partial<Record<AgenteId, ItemDaConversa[]>>
  respondendo: Partial<Record<AgenteId, boolean>>
  /** A Conversa coordenada do composer, que vale até recarregar a página. */
  coordenada: { itens: ItemDaCoordenacao[]; respondendo: boolean }
}

interface Conversas {
  itens(agenteId: AgenteId): ItemDaConversa[]
  respondendo(agenteId: AgenteId): boolean
  enviar(agenteId: AgenteId, mensagem: Mensagem): void
  coordenada: EstadoDasConversas['coordenada']
  /** Um pedido no composer da página de Agentes: começa uma nova Conversa coordenada. */
  coordenar(pedido: Mensagem): void
  /** Um pedido seguinte no composer da Conversa: continua a Conversa coordenada a partir do que já foi feito. */
  continuar(pedido: Mensagem): void
  /** Abre uma Conversa coordenada salva no lugar da atual: o pedido seguinte a continua. Sem efeito onde não há Conversas salvas. */
  abrir(id: string): Promise<void>
  animarDigitacao: boolean
}

const ContextoDasConversas = createContext<Conversas | null>(null)

/** Tempo de digitação por caractere, para o próximo passo esperar o texto terminar de aparecer. */
export const MS_POR_CARACTERE = 6

let proximoId = 1

/** Guarda as Conversas de cada Agente e a Conversa coordenada do composer durante a sessão, mesmo trocando de tela. */
export function ConversasProvider({ children, animarDigitacao }: { children: ReactNode; animarDigitacao: boolean }) {
  const fonte = useFonte()
  const [estado, setEstado] = useState<EstadoDasConversas>({
    itens: {},
    respondendo: {},
    coordenada: { itens: [], respondendo: false },
  })

  const esperarDigitacao = useCallback(
    (texto: string) =>
      animarDigitacao ? new Promise((resolver) => setTimeout(resolver, texto.length * MS_POR_CARACTERE)) : undefined,
    [animarDigitacao],
  )

  const adicionar = useCallback((agenteId: AgenteId, item: ItemDaConversa) => {
    setEstado((atual) => ({
      ...atual,
      itens: { ...atual.itens, [agenteId]: [...(atual.itens[agenteId] ?? []), item] },
    }))
  }, [])

  const definirRespondendo = useCallback((agenteId: AgenteId, valor: boolean) => {
    setEstado((atual) => ({ ...atual, respondendo: { ...atual.respondendo, [agenteId]: valor } }))
  }, [])

  // Onde a sessão já pediu algo desde que a página abriu: a Conversa salva não sobrepõe esse lugar.
  const pedidosDaSessao = useRef(new Set<AgenteId | 'coordenada'>())

  const enviar = useCallback(
    async (agenteId: AgenteId, mensagem: { texto: string; sugestaoId?: string }) => {
      pedidosDaSessao.current.add(agenteId)
      adicionar(agenteId, { id: proximoId++, tipo: 'usuario', texto: mensagem.texto })
      definirRespondendo(agenteId, true)
      try {
        for await (const passo of fonte.conversar(agenteId, mensagem)) {
          adicionar(agenteId, { id: proximoId++, ...passo })
          if (passo.tipo === 'texto') await esperarDigitacao(passo.texto)
        }
      } finally {
        definirRespondendo(agenteId, false)
      }
    },
    [fonte, adicionar, definirRespondendo, esperarDigitacao],
  )

  const mudarCoordenada = useCallback((mudanca: (atual: EstadoDasConversas['coordenada']) => EstadoDasConversas['coordenada']) => {
    setEstado((atual) => ({ ...atual, coordenada: mudanca(atual.coordenada) }))
  }, [])

  // Os pedidos da Conversa coordenada, que a Coordenação recebe para continuar a partir do que já foi feito.
  const pedidosDaConversa = useRef<Mensagem[]>([])

  // No Workspace operacional, as Conversas estão no banco: voltam depois de recarregar a página, e o pedido que ainda
  // roda continua de onde a leitura parou, sem ser enviado de novo. Um pedido feito antes disso chegar tem prioridade.
  useEffect(() => {
    if (!fonte.retomarConversas) return
    let ativo = true
    const seguir = async <P,>(passos: AsyncIterable<P>, adicionarPasso: (passo: P) => void, parar: () => void) => {
      try {
        for await (const passo of passos) {
          if (!ativo) return
          adicionarPasso(passo)
        }
      } finally {
        if (ativo) parar()
      }
    }
    fonte.retomarConversas().then(
      (retomadas) => {
        if (!ativo) return
        const { coordenada } = retomadas
        if (coordenada && coordenada.turnos.length > 0 && !pedidosDaSessao.current.has('coordenada')) {
          pedidosDaConversa.current = coordenada.turnos.map((turno) => ({ texto: turno.pedido }))
          mudarCoordenada(() => ({
            itens: coordenada.turnos.flatMap((turno): ItemDaCoordenacao[] => [
              { id: proximoId++, tipo: 'pedido', texto: turno.pedido },
              ...turno.passos.map((passo) => ({ id: proximoId++, ...passo })),
            ]),
            respondendo: Boolean(coordenada.emAndamento),
          }))
          if (coordenada.emAndamento) {
            void seguir(
              coordenada.emAndamento,
              (passo) => mudarCoordenada((atual) => ({ ...atual, itens: [...atual.itens, { id: proximoId++, ...passo }] })),
              () => mudarCoordenada((atual) => ({ ...atual, respondendo: false })),
            )
          }
        }
        for (const [agenteId, conversa] of Object.entries(retomadas.porAgente)) {
          if (!conversa || conversa.turnos.length === 0 || pedidosDaSessao.current.has(agenteId)) continue
          const itens = conversa.turnos.flatMap((turno): ItemDaConversa[] => [
            { id: proximoId++, tipo: 'usuario', texto: turno.pedido },
            ...turno.passos.map((passo) => ({ id: proximoId++, ...passo })),
          ])
          setEstado((atual) => ({
            ...atual,
            itens: { ...atual.itens, [agenteId]: itens },
            respondendo: { ...atual.respondendo, [agenteId]: Boolean(conversa.emAndamento) },
          }))
          if (conversa.emAndamento) {
            void seguir(
              conversa.emAndamento,
              (passo) => adicionar(agenteId, { id: proximoId++, ...passo }),
              () => definirRespondendo(agenteId, false),
            )
          }
        }
      },
      // Sem as Conversas salvas, a tela começa vazia, como numa Conversa nova.
      () => {},
    )
    return () => {
      ativo = false
    }
  }, [fonte, mudarCoordenada, adicionar, definirRespondendo])

  // Qual abertura de Conversa vale: abrir outra, ou pedir algo novo, faz a leitura da anterior parar de escrever na tela.
  const aberturaAtual = useRef(0)

  const abrir = useCallback(
    async (id: string) => {
      if (!fonte.abrirConversa) return
      const abertura = ++aberturaAtual.current
      const conversa = await fonte.abrirConversa(id)
      if (abertura !== aberturaAtual.current) return
      pedidosDaSessao.current.add('coordenada')
      pedidosDaConversa.current = conversa.turnos.map((turno) => ({ texto: turno.pedido }))
      mudarCoordenada(() => ({
        itens: conversa.turnos.flatMap((turno): ItemDaCoordenacao[] => [
          { id: proximoId++, tipo: 'pedido', texto: turno.pedido },
          ...turno.passos.map((passo) => ({ id: proximoId++, ...passo })),
        ]),
        respondendo: Boolean(conversa.emAndamento),
      }))
      const emAndamento = conversa.emAndamento
      if (!emAndamento) return
      void (async () => {
        try {
          for await (const passo of emAndamento) {
            if (abertura !== aberturaAtual.current) return
            mudarCoordenada((atual) => ({ ...atual, itens: [...atual.itens, { id: proximoId++, ...passo }] }))
          }
        } finally {
          if (abertura === aberturaAtual.current) mudarCoordenada((atual) => ({ ...atual, respondendo: false }))
        }
      })()
    },
    [fonte, mudarCoordenada],
  )

  /** Envia um pedido à Coordenação: numa Conversa nova, ou continuando a atual. */
  const pedirACoordenacao = useCallback(
    async (pedido: Mensagem, continuando: boolean) => {
      pedidosDaSessao.current.add('coordenada')
      aberturaAtual.current++
      const anteriores = continuando ? pedidosDaConversa.current : []
      pedidosDaConversa.current = [...anteriores, pedido]
      const item: ItemDaCoordenacao = { id: proximoId++, tipo: 'pedido', texto: pedido.texto }
      mudarCoordenada((atual) => ({ itens: continuando ? [...atual.itens, item] : [item], respondendo: true }))
      try {
        for await (const passo of fonte.conversarCoordenado(pedido, anteriores)) {
          mudarCoordenada((atual) => ({ ...atual, itens: [...atual.itens, { id: proximoId++, ...passo }] }))
          if (passo.tipo === 'resposta') await esperarDigitacao(passo.texto)
        }
      } finally {
        mudarCoordenada((atual) => ({ ...atual, respondendo: false }))
      }
    },
    [fonte, mudarCoordenada, esperarDigitacao],
  )

  const valor = useMemo<Conversas>(
    () => ({
      itens: (agenteId) => estado.itens[agenteId] ?? [],
      respondendo: (agenteId) => estado.respondendo[agenteId] ?? false,
      enviar: (agenteId, mensagem) => void enviar(agenteId, mensagem),
      coordenada: estado.coordenada,
      coordenar: (pedido) => void pedirACoordenacao(pedido, false),
      continuar: (pedido) => void pedirACoordenacao(pedido, true),
      abrir,
      animarDigitacao,
    }),
    [estado, enviar, pedirACoordenacao, abrir, animarDigitacao],
  )

  return <ContextoDasConversas.Provider value={valor}>{children}</ContextoDasConversas.Provider>
}

export function useConversas(): Conversas {
  const conversas = useContext(ContextoDasConversas)
  if (!conversas) throw new Error('useConversas precisa de um ConversasProvider')
  return conversas
}
