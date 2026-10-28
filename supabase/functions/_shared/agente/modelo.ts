// O modelo do agente único pela fila do Hermes (ADR-0018: nenhuma chave de IA nas Edge Functions). A função enfileira
// (sistema + pedido) em `enqueue_signal_llm_request`, o worker do Hermes responde e a função lê até o prazo. Só texto:
// as ferramentas vão no protocolo JSON do orquestrador, não na API do modelo.

export class ErroDoAgente extends Error {
  constructor(readonly code: string, mensagem?: string) {
    super(mensagem ?? code)
  }
}

export interface ModeloDoAgente {
  responder(sistema: string, usuario: string): Promise<string>
}

export interface FilaDoModelo {
  enfileirar(p: { sistema: string; usuario: string; maxTokens: number }): Promise<string>
  ler(id: string): Promise<{ status: 'queued' | 'running' | 'done' | 'failed'; texto: string | null }>
}

export const MAX_SISTEMA = 18_000
export const MAX_PEDIDO = 50_000

export function modeloPelaFila({
  fila,
  maxTokens = 2000,
  prazoMs = 90_000,
  intervaloMs = 1200,
  esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  relogio = () => Date.now(),
}: {
  fila: FilaDoModelo
  maxTokens?: number
  prazoMs?: number
  intervaloMs?: number
  esperar?: (ms: number) => Promise<void>
  relogio?: () => number
}): ModeloDoAgente {
  return {
    async responder(sistema, usuario) {
      if (!sistema || !usuario || sistema.length > MAX_SISTEMA || usuario.length > MAX_PEDIDO) {
        throw new ErroDoAgente('model_invalid_request', `sistema ${sistema.length}, pedido ${usuario.length}`)
      }
      let id: string
      try {
        id = await fila.enfileirar({ sistema, usuario, maxTokens })
      } catch (e) {
        const code = (e as { code?: unknown })?.code
        if (code === '53400') throw new ErroDoAgente('model_rate_limited')
        if (typeof code === 'string' && /^2[23]/.test(code)) throw new ErroDoAgente('model_invalid_request')
        throw new ErroDoAgente('model_unreachable')
      }
      const limite = relogio() + prazoMs
      for (;;) {
        const r = await fila.ler(id)
        if (r.status === 'done') return r.texto ?? ''
        if (r.status === 'failed') throw new ErroDoAgente('model_unreachable', 'o worker do Hermes não respondeu')
        if (relogio() >= limite) throw new ErroDoAgente('model_timeout')
        await esperar(intervaloMs)
      }
    },
  }
}
