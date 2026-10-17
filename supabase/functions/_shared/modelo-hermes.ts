// O modelo da Althius pelo Hermes (ADR-0018, emenda de 2026-10-14: toda IA passa pelo Hermes, sem chave de API nas
// Edge Functions). O Hermes roda fora do Supabase, só na rede interna: a função ENFILEIRA o pedido (sistema + texto) na
// fila de IA do banco, o worker `_hermes-worker` o responde pelo Hermes e esta função lê a resposta até o prazo. Para
// quem chama, parece a Messages API: um texto, sem ferramentas. Falha do worker é passageira (model_unreachable) e o
// prazo é model_timeout: o trabalho volta à fila do próprio runner. O pedido que a fila recusa por ser inválido (grande
// demais, por exemplo) é model_invalid_request, que NÃO passa sozinho: tentar de novo daria o mesmo erro para sempre.
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { ErroDoModelo } from './orquestracao.ts'
import type { Modelo } from '../agent-conversation/runner.ts'

export interface FilaDoHermes {
  enfileirar(p: { sistema: string; usuario: string; maxTokens: number }): Promise<string>
  ler(id: string): Promise<{
    status: 'queued' | 'running' | 'done' | 'failed'
    texto?: string | null
    entrada?: number | null
    saida?: number | null
  }>
}

type Params = Parameters<Modelo['criar']>[0]

/** Os tetos da fila (private.signal_llm_requests): o sistema leva o Playbook inteiro mais as instruções. */
export const MAX_CARACTERES_DO_SISTEMA_NA_FILA = 40_000
export const MAX_CARACTERES_DO_PEDIDO_NA_FILA = 60_000

/** O código do Postgres quando a fila recusa: classe 22 (dado inválido) e 23 (check) não passam sozinhas. */
function codigoDaRecusa(e: unknown): string {
  const code = (e as { code?: unknown })?.code
  if (typeof code === 'string' && /^2[23]/.test(code)) return 'model_invalid_request'
  if (code === '53400') return 'model_rate_limited'
  return 'model_unreachable'
}

function textoDe(conteudo: unknown): string {
  if (typeof conteudo === 'string') return conteudo
  if (!Array.isArray(conteudo)) return ''
  return conteudo.flatMap((b) => (b && typeof b === 'object' && (b as { type?: string }).type === 'text'
    ? [String((b as { text?: unknown }).text ?? '')] : [])).join('\n')
}

export function modeloDoHermes({
  fila,
  prazoMs = 120_000,
  intervaloMs = 1500,
  esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  relogio = () => Date.now(),
}: {
  fila: FilaDoHermes
  prazoMs?: number
  intervaloMs?: number
  esperar?: (ms: number) => Promise<void>
  relogio?: () => number
}): Modelo {
  return {
    // O modelo é configuração do Hermes (ADR-0018): nenhuma Edge Function o nomeia.
    nome: 'hermes',
    async criar(params: Params) {
      const sistema = textoDe(params.system)
      const usuario = (params.messages ?? []).map((m) => textoDe(m.content)).filter(Boolean).join('\n\n')
      if (
        !sistema || !usuario || sistema.length > MAX_CARACTERES_DO_SISTEMA_NA_FILA ||
        usuario.length > MAX_CARACTERES_DO_PEDIDO_NA_FILA
      ) {
        throw new ErroDoModelo('model_invalid_request', `sistema ${sistema.length}, pedido ${usuario.length} caracteres`)
      }
      const limite = relogio() + prazoMs
      let id: string
      try {
        id = await fila.enfileirar({ sistema, usuario, maxTokens: params.max_tokens })
      } catch (e) {
        throw new ErroDoModelo(codigoDaRecusa(e), e instanceof Error ? e.message : 'erro')
      }
      for (;;) {
        const r = await fila.ler(id)
        if (r.status === 'done') {
          return {
            id,
            type: 'message',
            role: 'assistant',
            model: 'hermes',
            content: [{ type: 'text', text: r.texto ?? '', citations: null }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: r.entrada ?? 0, output_tokens: r.saida ?? 0 },
          } as unknown as Anthropic.Beta.Messages.BetaMessage
        }
        if (r.status === 'failed') throw new ErroDoModelo('model_unreachable', 'o worker do Hermes não respondeu')
        if (relogio() >= limite) throw new ErroDoModelo('model_timeout', 'prazo da fila do Hermes')
        await esperar(intervaloMs)
      }
    },
  }
}

type ClienteRpc = { rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }

/** A fila de uma Proposta de resposta: o banco tira o Workspace da Proposta reservada (job + token), nunca do chamador. */
export function filaDaPropostaPorRpc(admin: ClienteRpc, job: { job_id: string; claim_token: string }): FilaDoHermes {
  async function chamar(nome: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(nome, args)
    if (error) throw Object.assign(new Error(`${nome}: ${error.code ?? ''}`.trim()), { code: error.code })
    return data
  }
  return {
    async enfileirar(p) {
      const id = await chamar('enqueue_reply_proposal_llm_request', {
        p_job_id: job.job_id, p_claim_token: job.claim_token, p_system: p.sistema, p_user: p.usuario, p_max_tokens: p.maxTokens,
      })
      if (typeof id !== 'string') throw new Error('enqueue_reply_proposal_llm_request: sem id')
      return id
    },
    async ler(id) {
      const linhas = await chamar('get_signal_llm_request', { p_id: id }) as {
        status: 'queued' | 'running' | 'done' | 'failed'; result_text: string | null; input_tokens: number | null; output_tokens: number | null
      }[] | null
      const l = linhas?.[0]
      if (!l) throw new Error('get_signal_llm_request: pedido não encontrado')
      return { status: l.status, texto: l.result_text, entrada: l.input_tokens, saida: l.output_tokens }
    },
  }
}
