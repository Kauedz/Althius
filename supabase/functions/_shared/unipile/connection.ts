// A conexão Unipile ativa (canais-16, ADR-0024): onde está a API, em que versão fala, a chave e o segredo do webhook.
// O endereço e a versão vêm do banco (private.unipile_connections, do canais-15); a chave e o segredo, do Vault, lidos
// pela função `get_active_unipile_connection`, que só o service_role chama. Nada disso é escrito no código: trocar de
// conta Unipile é cadastrar e ativar outra conexão, e a próxima leitura (até 30 s depois) já vale.
//
// Este é o ÚNICO arquivo que conhece o endereço padrão da v2 e as variáveis de função UNIPILE_*, que valem como reserva:
//  - enquanto a migration da conexão ativa não foi aplicada (a função não existe), vale a configuração de hoje;
//  - se a conexão ativa não tem a chave no Vault, a variável só vale para a conexão padrão (v2, endereço padrão):
//    a chave de uma conta nunca vai para o endereço de outra.
// Sem conexão ativa ou sem chave, o canal fica desligado: nada é enviado, nunca um envio simulado.
import { createBridge, type UnipileApiVersion, type UnipileBridge } from './bridge.ts'
import { type ConnectionConfig, parseConnectionConfig } from './config.ts'
import { UnipileConfigMissingError } from './errors.ts'

/** O endereço da v2. É a conexão "padrão" do canais-15 e a configuração de antes da conexão ativa. */
export const DEFAULT_V2_BASE_URL = 'https://api.unipile.com'

/** O tempo que uma leitura vale: uma troca de conta chega às funções em até isto. */
export const CONNECTION_TTL_MS = 30_000

export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface EnvReader {
  get(name: string): string | undefined
}

export interface ActiveConnection {
  /** Null na configuração de hoje (sem a conexão ativa no banco). */
  id: string | null
  name: string
  version: UnipileApiVersion
  baseUrl: string
  apiKey: string
  /** O segredo do webhook; nulo quando nem o Vault nem a reserva o têm. */
  webhookSecret: string | null
  /** De onde veio a chave: do banco e do Vault, ou da variável de função (reserva). */
  source: 'database' | 'environment'
}

/** O que `get_active_unipile_connection` devolve. */
interface ConnectionRow {
  connection_id?: unknown
  name?: unknown
  base_url?: unknown
  api_version?: unknown
  api_key_secret_name?: unknown
  webhook_secret_name?: unknown
  api_key?: unknown
  webhook_secret?: unknown
}

const FUNCTION_MISSING_CODES = new Set(['PGRST202', '42883'])

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null

export interface ActiveConnectionLoaderOptions {
  rpc: RpcClient
  env: EnvReader
  ttlMs?: number
  now?: () => number
}

export interface ActiveConnectionLoader {
  get(): Promise<ActiveConnection>
  invalidate(): void
}

export function createActiveConnectionLoader(options: ActiveConnectionLoaderOptions): ActiveConnectionLoader {
  const ttlMs = options.ttlMs ?? CONNECTION_TTL_MS
  const now = options.now ?? Date.now
  let cached: { connection: ActiveConnection; at: number } | null = null

  function fromEnvironment(): ActiveConnection {
    const apiKey = text(options.env.get('UNIPILE_API_KEY'))
    if (!apiKey) throw new UnipileConfigMissingError(['api_key'])
    return {
      id: null,
      name: 'variáveis de função',
      version: 'v2',
      baseUrl: DEFAULT_V2_BASE_URL,
      apiKey,
      webhookSecret: text(options.env.get('UNIPILE_WEBHOOK_SECRET')),
      source: 'environment',
    }
  }

  function fromRow(row: ConnectionRow): ActiveConnection {
    const config: ConnectionConfig = parseConnectionConfig({
      base_url: row.base_url,
      api_version: row.api_version,
      api_key_secret_name: row.api_key_secret_name,
      webhook_secret_name: row.webhook_secret_name,
    })
    const isStandard = config.api_version === 'v2' && config.base_url === DEFAULT_V2_BASE_URL
    const vaultKey = text(row.api_key)
    const apiKey = vaultKey ?? (isStandard ? text(options.env.get('UNIPILE_API_KEY')) : null)
    if (!apiKey) throw new UnipileConfigMissingError(['api_key'])
    const vaultSecret = text(row.webhook_secret)
    const webhookSecret = vaultSecret ?? (isStandard ? text(options.env.get('UNIPILE_WEBHOOK_SECRET')) : null)
    return {
      id: text(row.connection_id),
      name: text(row.name) ?? 'conexão ativa',
      version: config.api_version,
      baseUrl: config.base_url,
      apiKey,
      webhookSecret,
      source: vaultKey ? 'database' : 'environment',
    }
  }

  async function load(): Promise<ActiveConnection> {
    const { data, error } = await options.rpc.rpc('get_active_unipile_connection', {})
    if (error) {
      const code = (error as { code?: unknown }).code
      // A migration ainda não foi aplicada: segue a configuração de hoje. Qualquer outro erro desliga o canal.
      if (typeof code === 'string' && FUNCTION_MISSING_CODES.has(code)) return fromEnvironment()
      throw new UnipileConfigMissingError(['active_connection'])
    }
    const row = (Array.isArray(data) ? data[0] : data) as ConnectionRow | null | undefined
    if (!row || typeof row !== 'object') throw new UnipileConfigMissingError(['active_connection'])
    return fromRow(row)
  }

  return {
    async get() {
      if (cached && now() - cached.at < ttlMs) return cached.connection
      // Só leitura bem-sucedida fica em cache: uma falha não desliga o canal por 30 s depois de o banco voltar.
      const connection = await load()
      cached = { connection, at: now() }
      return connection
    },
    invalidate() {
      cached = null
    },
  }
}

export interface UnipileRuntime {
  /** A conexão ativa, ou nulo se o canal está desligado (sem conexão ativa ou sem chave). */
  connection(): Promise<ActiveConnection | null>
  /** A ponte da versão da conexão ativa, ou nulo se o canal está desligado. */
  bridge(): Promise<UnipileBridge | null>
}

export interface UnipileRuntimeOptions extends ActiveConnectionLoaderOptions {
  fetch?: typeof fetch
}

/**
 * O que as Edge Functions usam: a cada pedido, a conexão ativa (em cache por 30 s) e a ponte dela. Sem conexão, devolve
 * nulo e a função responde que o canal está indisponível, em vez de enviar por uma conta errada ou simular o envio.
 */
export function createUnipileRuntime(options: UnipileRuntimeOptions): UnipileRuntime {
  const loader = createActiveConnectionLoader(options)
  let last: { connection: ActiveConnection; bridge: UnipileBridge } | null = null

  async function connection(): Promise<ActiveConnection | null> {
    try {
      return await loader.get()
    } catch (error) {
      if (!(error instanceof UnipileConfigMissingError)) throw error
      // Só nomes de campo: nunca a chave nem o valor de uma configuração.
      console.error('unipile: conexão ativa indisponível, o canal fica desligado', error.fields)
      return null
    }
  }

  return {
    connection,
    async bridge() {
      const current = await connection()
      if (!current) return null
      if (last?.connection !== current) {
        last = { connection: current, bridge: createBridge(current, { fetch: options.fetch }) }
      }
      return last.bridge
    },
  }
}

/** A resposta de uma função quando o canal está desligado (sem conexão ativa ou sem chave): nada foi enviado nem tocado. */
export function unipileUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'O canal de mensagens está indisponível: a conexão Unipile ativa não está configurada.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}
