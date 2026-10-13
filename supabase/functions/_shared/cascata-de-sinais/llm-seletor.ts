// A escolha do modelo de linguagem dos passos de IA dos Sinais, por SIGNALS_LLM_PROVIDER:
//   hermes  o passo enfileira a classificação e o worker do Hermes (que já tem a OpenAI) a responde
//   openai  plano B: a API da OpenAI direto (OPENAI_API_KEY e OPENAI_MODEL)
//   regra   sem modelo: os passos usam a regra de palavra-chave
// O padrão é `regra`: sem configuração, com configuração incompleta ou com valor desconhecido, nada de modelo (devolve
// `undefined`). Nenhum fornecedor é padrão, e a Anthropic não é opção. O log leva só o nome do que falta, nunca um valor.
import { type FilaDeIa, filaDeIaPorRpc, llmDoHermes } from './llm-hermes.ts'
import { prazoDoAmbiente, precoDoAmbiente } from './llm-comum.ts'
import { llmDaOpenai } from './llm-openai.ts'
import type { Llm } from './tipos.ts'

export type ProvedorDoModelo = 'hermes' | 'openai' | 'regra'

export function escolherLlmDosSinais(
  { env, admin, fetchFn, log = () => {}, fila }: {
    env: (nome: string) => string | undefined
    admin: { rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }
    fetchFn?: typeof fetch
    log?: (campos: Record<string, unknown>) => void
    /** Só para teste: a fila do caminho hermes. */
    fila?: FilaDeIa
  },
): Llm | undefined {
  const pedido = (env('SIGNALS_LLM_PROVIDER') ?? '').trim().toLowerCase()
  if (pedido === '' || pedido === 'regra') return undefined
  const preco = precoDoAmbiente(env)
  const prazoMs = prazoDoAmbiente(env)

  if (pedido === 'hermes') return llmDoHermes({ fila: fila ?? filaDeIaPorRpc(admin), preco, prazoMs })

  if (pedido === 'openai') {
    const apiKey = env('OPENAI_API_KEY')
    const modelo = env('OPENAI_MODEL')
    if (!apiKey || !modelo) {
      log({ type: 'signals_llm', outcome: 'configuracao_incompleta', provedor: 'openai', falta: [!apiKey && 'OPENAI_API_KEY', !modelo && 'OPENAI_MODEL'].filter(Boolean) })
      return undefined
    }
    return llmDaOpenai({ apiKey, modelo, preco, prazoMs, fetchFn })
  }

  log({ type: 'signals_llm', outcome: 'provedor_desconhecido' })
  return undefined
}
