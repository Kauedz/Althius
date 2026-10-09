// O cliente HTTP único da Unipile (canais-16): quem fala com a API passa por aqui, nas duas versões. Ele cuida do que é
// igual em toda chamada: o endereço da conexão ativa, a chave no cabeçalho, JSON ou multipart, o tempo limite e a
// classificação do erro (recusa definitiva com motivo, ou incerto). Não conhece rota, versão nem regra de envio: isso é
// de cada adaptador (bridge-v1.ts, bridge-v2.ts). A chave nunca vai para log nem para mensagem de erro.
import {
  classifyHttpFailure,
  classifyProviderError,
  UnipileChatRequestError,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from './errors.ts'
import { readResponse } from './common.ts'
import type { ZodTypeAny, z } from './zod.ts'

/** O tempo que uma chamada espera antes de abortar, quando quem chama não põe o próprio limite. */
export const DEFAULT_TIMEOUT_MS = 30_000

/** Retry-After em segundos, ou numa data HTTP; ausente ou ilegível, null. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  if (/^\d+$/.test(value.trim())) return Number(value.trim())
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000))
}

export interface UnipileClientOptions {
  /** O endereço da conexão ativa: `https://api.unipile.com` na v2, o DSN do cliente na v1. */
  baseUrl: string
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  /** Corpo em JSON. */
  json?: unknown
  /** Corpo em multipart (os chats da v1): os campos do formulário. O fetch põe o content-type com o limite sozinho. */
  form?: Record<string, string>
  query?: Record<string, string | number | undefined>
  headers?: Record<string, string>
  /** O sinal de quem chama; vale junto com o tempo limite do cliente. */
  signal?: AbortSignal
  /** O que se aceita de volta (anexos baixam qualquer tipo). */
  accept?: string
}

export interface UnipileClient {
  readonly baseUrl: string
  /** Uma resposta 2xx, ou um erro tipado. */
  request(path: string, options?: RequestOptions): Promise<Response>
  /** O corpo JSON de uma resposta 2xx, lido pelo schema (ou o corpo cru, sem schema). Ilegível é incerto. */
  json(path: string, options?: RequestOptions): Promise<unknown>
  json<S extends ZodTypeAny>(path: string, options: RequestOptions | undefined, schema: S): Promise<z.output<S>>
  /**
   * Baixa um arquivo, por caminho da API ou por URL inteira. A chave só vai quando o endereço é o da conexão: uma URL de
   * outra origem (que veio num evento) é baixada sem ela, para a chave nunca sair para um endereço que não é da Unipile.
   */
  bytes(target: string, options?: { signal?: AbortSignal }): Promise<{ bytes: Uint8Array; contentType: string | null }>
}

export function createUnipileClient(options: UnipileClientOptions): UnipileClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
    const query = Object.entries(opts.query ?? {}).filter(([, value]) => value !== undefined)
    const url = baseUrl + path + (query.length ? `?${new URLSearchParams(query.map(([k, v]) => [k, String(v)]))}` : '')
    const headers: Record<string, string> = {
      'X-API-KEY': options.apiKey,
      accept: opts.accept ?? 'application/json',
      ...(opts.json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    }
    let body: BodyInit | undefined
    if (opts.json !== undefined) body = JSON.stringify(opts.json)
    else if (opts.form) {
      const form = new FormData()
      for (const [name, value] of Object.entries(opts.form)) form.append(name, value)
      body = form
    }
    const timeout = AbortSignal.timeout(timeoutMs)
    const upstream = await fetchImpl(url, {
      method: opts.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    })
    if (upstream.ok) return upstream
    // O corpo da recusa só serve para achar o motivo; nada dele vai para log nem para o banco além do código.
    const definite = classifyHttpFailure(upstream.status) === 'definite_refusal'
    const text = definite ? await upstream.text().catch(() => '') : ''
    throw new UnipileChatRequestError(
      upstream.status,
      retryAfterSeconds(upstream.headers.get('retry-after')),
      definite ? classifyProviderError(upstream.status, text.slice(0, 2000)) : null,
    )
  }

  async function json(path: string, opts?: RequestOptions, schema?: ZodTypeAny): Promise<unknown> {
    const upstream = await request(path, opts)
    const data = await upstream.json().catch(() => {
      throw new UnipileUnreadableResponse()
    })
    return schema ? readResponse(schema, data) : data
  }

  async function bytes(target: string, opts: { signal?: AbortSignal } = {}) {
    const absolute = /^https?:\/\//i.test(target)
    const url = absolute ? new URL(target) : null
    const sameOrigin = !url || url.origin === new URL(baseUrl).origin
    let upstream: Response
    if (sameOrigin) {
      upstream = await request(url ? url.pathname + url.search : target, { accept: '*/*', signal: opts.signal })
    } else {
      const timeout = AbortSignal.timeout(timeoutMs)
      upstream = await fetchImpl(target, {
        headers: { accept: '*/*' },
        signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
      })
      if (!upstream.ok) throw new UnipileRequestError(upstream.status, retryAfterSeconds(upstream.headers.get('retry-after')))
    }
    return { bytes: new Uint8Array(await upstream.arrayBuffer()), contentType: upstream.headers.get('content-type') }
  }

  return { baseUrl, request, json, bytes } as UnipileClient
}
