// Adapter da rota de e-mail da Unipile v1. Não mistura contratos da v2 beta.
// Aceitação do provedor não é entrega nem leitura. Quando não dá para saber se o provedor aceitou, o resultado é
// incerto e a Althius reconcilia antes de qualquer reenvio: a idempotência da Unipile tem retenção limitada.

export interface UnipileConfig {
  apiOrigin: string
  apiKey: string
}

export type SendResult =
  | { kind: 'accepted'; trackingId: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'uncertain'; reason: string }

export type FindSentResult =
  | { found: true; trackingId?: string; emailId?: string; messageId?: string }
  | { found: false }
  | { found: 'unknown' }

export interface EmailToSend {
  accountId: string
  to: { email: string; name?: string }
  subject: string
  body: string
  idempotencyKey: string
}

export interface SentEmailSearch {
  accountId: string
  to: string
  subject: string
  since: Date
}

export interface UnipileEmail {
  send(email: EmailToSend): Promise<SendResult>
  findSent(search: SentEmailSearch): Promise<FindSentResult>
}

/** O DSN e a chave vêm só dos segredos do backend. Devolve null quando a instância não está configurada. */
export function readUnipileConfig(env: (name: string) => string | undefined): UnipileConfig | null {
  const rawDsn = env('UNIPILE_DSN')
  const apiKey = env('UNIPILE_API_KEY')
  if (!rawDsn || !apiKey) return null
  try {
    const dsn = new URL(rawDsn.includes('://') ? rawDsn : `https://${rawDsn}`)
    if (dsn.protocol !== 'https:' || !dsn.hostname.endsWith('.unipile.com')) return null
    return { apiOrigin: dsn.origin, apiKey }
  } catch {
    return null
  }
}

/** O corpo do passo é texto: vai como HTML escapado, preservando as quebras de linha. */
function htmlFromText(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replace(/\r?\n/g, '<br>')
}

export function createUnipileEmail(
  config: UnipileConfig,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 20_000,
): UnipileEmail {
  const endpoint = `${config.apiOrigin}/api/v1/emails`

  return {
    async send(email) {
      const form = new FormData()
      form.append('account_id', email.accountId)
      form.append('to', JSON.stringify([{
        ...(email.to.name ? { display_name: email.to.name } : {}),
        identifier: email.to.email,
      }]))
      form.append('subject', email.subject)
      form.append('body', htmlFromText(email.body))

      let response: Response
      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'X-API-KEY': config.apiKey,
            accept: 'application/json',
            'Idempotency-Key': email.idempotencyKey,
          },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
        return { kind: 'uncertain', reason: timedOut ? 'timeout' : 'network_error' }
      }

      // 4xx: o provedor recusou o pedido, nada saiu. 5xx: pode ter saído.
      if (response.status >= 400 && response.status < 500) {
        await response.body?.cancel()
        return { kind: 'rejected', reason: `http_${response.status}` }
      }
      if (!response.ok) {
        await response.body?.cancel()
        return { kind: 'uncertain', reason: `http_${response.status}` }
      }
      try {
        const result = await response.json()
        if (result?.object === 'EmailSent' && typeof result.tracking_id === 'string' && result.tracking_id) {
          return { kind: 'accepted', trackingId: result.tracking_id }
        }
      } catch {
        // Uma resposta 2xx ilegível não prova que o e-mail não saiu.
      }
      return { kind: 'uncertain', reason: 'invalid_response' }
    },

    async findSent(search) {
      const url = new URL(endpoint)
      url.searchParams.set('account_id', search.accountId)
      url.searchParams.set('role', 'sent')
      url.searchParams.set('to', search.to)
      // Margem para a diferença de relógio entre a Althius e o provedor.
      url.searchParams.set('after', new Date(search.since.getTime() - 5 * 60_000).toISOString())
      url.searchParams.set('limit', '50')
      try {
        const response = await fetchFn(url, {
          headers: { 'X-API-KEY': config.apiKey, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) {
          await response.body?.cancel()
          return { found: 'unknown' }
        }
        const result = await response.json()
        if (!Array.isArray(result?.items)) return { found: 'unknown' }
        const match = result.items.find((item: Record<string, unknown>) =>
          typeof item?.subject === 'string' && item.subject.trim() === search.subject.trim())
        if (!match) return { found: false }
        return {
          found: true,
          ...(typeof match.tracking_id === 'string' ? { trackingId: match.tracking_id } : {}),
          ...(typeof match.id === 'string' ? { emailId: match.id } : {}),
          ...(typeof match.message_id === 'string' ? { messageId: match.message_id } : {}),
        }
      } catch {
        return { found: 'unknown' }
      }
    },
  }
}
