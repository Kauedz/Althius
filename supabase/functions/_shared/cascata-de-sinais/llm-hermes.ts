// O modelo de linguagem dos passos de Sinais pelo Hermes (provedor padrão recomendado): o Hermes roda na VPS, só na rede
// interna, e as Edge Functions não o alcançam. Por isso o passo ENFILEIRA o pedido (`private.signal_llm_requests`), o worker
// do Hermes, que já tem a OpenAI, o responde, e esta função lê a resposta até o prazo. Passou do prazo ou falhou: lança, e o
// passo usa a regra de palavra-chave. Só o texto do pedido vai para a fila (notícia e diário oficial públicos); nenhum
// segredo, e a resposta é lida por id.
import { MENSAGEM_DO_PRAZO, PRAZO_PADRAO_DA_CLASSIFICACAO_MS, type PrecoDoModelo, respostaDoModelo } from './llm-comum.ts'
import type { Llm } from './tipos.ts'

export interface PedidoNaFila {
  workspaceId: string
  sistema: string
  usuario: string
  maxTokens: number
}

export interface RespostaDaFila {
  status: 'queued' | 'running' | 'done' | 'failed'
  texto?: string | null
  entrada?: number | null
  saida?: number | null
  erro?: string | null
}

export interface FilaDeIa {
  enfileirar(p: PedidoNaFila): Promise<string>
  ler(id: string): Promise<RespostaDaFila>
}

export function llmDoHermes(
  { fila, preco, prazoMs = PRAZO_PADRAO_DA_CLASSIFICACAO_MS, intervaloMs = 1500, esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), relogio = () => Date.now() }: {
    fila: FilaDeIa
    preco: PrecoDoModelo
    prazoMs?: number
    intervaloMs?: number
    esperar?: (ms: number) => Promise<void>
    relogio?: () => number
  },
): Llm {
  return {
    async json({ sistema, usuario, maxTokens = 800, workspaceId }) {
      if (!workspaceId) throw new Error('A classificação precisa do Workspace do pedido')
      const limite = relogio() + prazoMs
      const id = await fila.enfileirar({ workspaceId, sistema, usuario, maxTokens })
      for (;;) {
        const r = await fila.ler(id)
        if (r.status === 'done') return respostaDoModelo(r.texto ?? '', preco, r.entrada, r.saida)
        // O erro real do worker fica no banco (coluna técnica); aqui só uma mensagem neutra.
        if (r.status === 'failed') throw new Error('A classificação não pôde ser feita agora')
        if (relogio() >= limite) throw new Error(MENSAGEM_DO_PRAZO)
        await esperar(intervaloMs)
      }
    },
  }
}

type ClienteRpc = { rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }

/** A fila pelo banco: as RPCs de serviço da migração da fila de IA dos Sinais. */
export function filaDeIaPorRpc(admin: ClienteRpc): FilaDeIa {
  async function chamar(nome: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await admin.rpc(nome, args)
    if (error) throw new Error(`${nome}: ${error.code ?? ''} ${error.message}`.trim())
    return data
  }
  return {
    async enfileirar(p) {
      const id = await chamar('enqueue_signal_llm_request', {
        p_workspace_id: p.workspaceId, p_system: p.sistema, p_user: p.usuario, p_max_tokens: p.maxTokens,
      })
      if (typeof id !== 'string') throw new Error('enqueue_signal_llm_request: sem id')
      return id
    },
    async ler(id) {
      const linhas = await chamar('get_signal_llm_request', { p_id: id }) as {
        status: RespostaDaFila['status']
        result_text: string | null
        input_tokens: number | null
        output_tokens: number | null
        error: string | null
      }[] | null
      const l = linhas?.[0]
      if (!l) throw new Error('get_signal_llm_request: pedido não encontrado')
      return { status: l.status, texto: l.result_text, entrada: l.input_tokens, saida: l.output_tokens, erro: l.error }
    },
  }
}
