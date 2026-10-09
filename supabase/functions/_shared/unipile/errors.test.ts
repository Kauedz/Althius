import { assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  AUTO_RESEND_ALLOWED,
  classifyHttpFailure,
  classifyProviderError,
  failureKind,
  UnipileConfigMissingError,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from './errors.ts'

Deno.test('4xx é recusa definitiva, exceto 408 e 429; o resto é incerto', () => {
  for (const status of [400, 401, 402, 403, 404, 409, 422]) assertEquals(classifyHttpFailure(status), 'definite_refusal')
  for (const status of [408, 429, 500, 502, 503, 504]) assertEquals(classifyHttpFailure(status), 'uncertain')
})

Deno.test('cada erro carrega o tipo de falha; rede e erro desconhecido são incertos', () => {
  assertEquals(new UnipileRequestError(403).kind, 'definite_refusal')
  assertEquals(new UnipileRequestError(503, 30).kind, 'uncertain')
  assertEquals(new UnipileRequestError(429, 90).retryAfterSeconds, 90)
  assertEquals(new UnipileUnreadableResponse().kind, 'uncertain')
  assertEquals(new UnipileConfigMissingError(['base_url']).kind, 'config_missing')
  assertEquals(failureKind(new UnipileRequestError(404)), 'definite_refusal')
  assertEquals(failureKind(new TypeError('fetch failed')), 'uncertain')
  assertEquals(failureKind(new DOMException('aborted', 'AbortError')), 'uncertain')
})

Deno.test('nenhum tipo de falha reenvia sozinho: incerto só se confere', () => {
  assertEquals(Object.keys(AUTO_RESEND_ALLOWED).sort(), ['config_missing', 'definite_refusal', 'uncertain'])
  for (const allowed of Object.values(AUTO_RESEND_ALLOWED)) assertFalse(allowed)
})

Deno.test('a resposta ilegível diz onde, nunca o valor', () => {
  const error = new UnipileUnreadableResponse(['data.0.id'])
  assertStringIncludes(error.message, 'data.0.id')
  assertEquals(error.issues, ['data.0.id'])
  assertEquals(new UnipileUnreadableResponse().message, 'Unipile respondeu 2xx sem o id do e-mail enviado')
})

Deno.test('a configuração ausente lista os campos, sem valor', () => {
  const error = new UnipileConfigMissingError(['base_url', 'api_version'])
  assertStringIncludes(error.message, 'base_url, api_version')
  assertEquals(error.fields, ['base_url', 'api_version'])
})

Deno.test('o código do motivo sai do texto da recusa', () => {
  assertEquals(classifyProviderError(403, '{"detail":"You have no credits left"}'), 'insufficient_credits')
  assertEquals(classifyProviderError(402, ''), 'insufficient_credits')
  assertEquals(classifyProviderError(422, 'Weekly invitation limit reached'), 'provider_limit_reached')
  assertEquals(classifyProviderError(400, '{"title":"bad request"}'), 'http_400')
})
