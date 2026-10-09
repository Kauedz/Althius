// A configuração de uma conexão Unipile (ADR-0024): onde está a API, em que versão fala e COMO SE CHAMAM os segredos da
// chave e do webhook. A chave e o segredo em si ficam no Vault e nunca fazem parte deste schema: `.strict()` recusa
// qualquer campo a mais, e a mensagem de erro lista só nomes de campo, nunca valores.
import { UnipileConfigMissingError } from './errors.ts'
import { z } from './zod.ts'

const secretName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, 'nome de segredo')

export const connectionConfigSchema = z.object({
  /** v2: https://api.unipile.com. v1: o endereço próprio do cliente (DSN), com porta, ex.: https://api68.unipile.com:19840. */
  base_url: z.string().url().startsWith('https://').transform((value) => value.replace(/\/+$/, '')),
  api_version: z.enum(['v1', 'v2']),
  /** O NOME do segredo que guarda a chave da API (ex.: UNIPILE_API_KEY). */
  api_key_secret_name: secretName,
  /** O NOME do segredo que guarda o segredo do webhook. */
  webhook_secret_name: secretName,
}).strict()

export type ConnectionConfig = z.infer<typeof connectionConfigSchema>

export function parseConnectionConfig(input: unknown): ConnectionConfig {
  const parsed = connectionConfigSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const fields = [...new Set(parsed.error.issues.flatMap((issue) => {
    // Campo a mais (ex.: alguém pôs a chave aqui): só o nome do campo, nunca o valor.
    if (issue.code === 'unrecognized_keys') return issue.keys.map((key) => `campo não permitido: ${key}`)
    return [issue.path.join('.') || 'config']
  }))]
  throw new UnipileConfigMissingError(fields)
}
