// O modelo dos Agentes: a Messages API da Anthropic, chamada só daqui, com a chave que só a função tem. Uma recusa do
// modelo principal é refeita no servidor por outro modelo (`fallbacks: "default"`), nos modelos que aceitam; o que a API
// recusar ou não responder vira ErroDoModelo, com um motivo curto para a Execução.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { ErroDoModelo, type Modelo } from './runner.ts'

/** Os modelos que aceitam o fallback de recusa no servidor. */
const COM_FALLBACK = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

export function modeloDaAnthropic({ apiKey, modelo }: { apiKey: string; modelo: string }): Modelo {
  // Um pedido longo não pode passar do prazo da Execução: 2 minutos por chamada, com 2 novas tentativas do SDK.
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })
  const fallback = COM_FALLBACK.has(modelo)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {}
  return {
    nome: modelo,
    async criar(params) {
      try {
        return await client.beta.messages.create({ ...params, ...fallback, model: modelo })
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ErroDoModelo('model_timeout')
        if (error instanceof Anthropic.APIConnectionError) throw new ErroDoModelo('model_unreachable')
        if (error instanceof Anthropic.AuthenticationError) throw new ErroDoModelo('model_auth')
        if (error instanceof Anthropic.RateLimitError) throw new ErroDoModelo('model_rate_limited')
        if (error instanceof Anthropic.APIError) throw new ErroDoModelo(`model_http_${error.status}`)
        throw error
      }
    },
  }
}
