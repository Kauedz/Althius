import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { connectionConfigSchema, parseConnectionConfig } from './config.ts'
import { UnipileConfigMissingError } from './errors.ts'

const valid = {
  base_url: 'https://api.unipile.com',
  api_version: 'v2',
  api_key_secret_name: 'UNIPILE_API_KEY',
  webhook_secret_name: 'UNIPILE_WEBHOOK_SECRET',
}

Deno.test('configuração v2 válida', () => {
  assertEquals(parseConnectionConfig(valid), valid)
})

Deno.test('configuração v1 com o endereço próprio do cliente (DSN), sem barra no fim', () => {
  const config = parseConnectionConfig({ ...valid, base_url: 'https://api68.unipile.com:19840/', api_version: 'v1' })
  assertEquals(config.base_url, 'https://api68.unipile.com:19840')
  assertEquals(config.api_version, 'v1')
})

Deno.test('configuração inválida: versão, endereço sem https e nome de segredo', () => {
  assertEquals(connectionConfigSchema.safeParse({ ...valid, api_version: 'v3' }).success, false)
  assertEquals(connectionConfigSchema.safeParse({ ...valid, base_url: 'http://api.unipile.com' }).success, false)
  assertEquals(connectionConfigSchema.safeParse({ ...valid, base_url: 'api.unipile.com' }).success, false)
  assertEquals(connectionConfigSchema.safeParse({ ...valid, api_key_secret_name: '' }).success, false)
  assertEquals(connectionConfigSchema.safeParse({ ...valid, webhook_secret_name: 'tem espaço' }).success, false)
})

Deno.test('campo ausente vira configuração ausente, listando só os campos', () => {
  const error = assertThrows(() => parseConnectionConfig({ base_url: valid.base_url }), UnipileConfigMissingError)
  assertEquals(error.fields.sort(), ['api_key_secret_name', 'api_version', 'webhook_secret_name'])
  assertThrows(() => parseConnectionConfig(undefined), UnipileConfigMissingError)
})

Deno.test('a chave em si não faz parte do schema e nunca aparece na mensagem', () => {
  const secret = 'sk-live-ABC123-nao-pode-vazar'
  const error = assertThrows(
    () => parseConnectionConfig({ ...valid, api_key: secret, webhook_secret: secret }),
    UnipileConfigMissingError,
  )
  assertEquals(error.message.includes(secret), false)
  assertEquals(JSON.stringify(error.fields).includes(secret), false)
  assertEquals(connectionConfigSchema.safeParse({ ...valid, api_key: secret }).success, false)
  assertEquals('api_key' in connectionConfigSchema.shape, false)
})
