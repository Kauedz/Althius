// A autenticação do webhook da Unipile v1 (canais-17). Na v1 o segredo é o que o cliente escolhe ao cadastrar o webhook:
// a Unipile devolve o cabeçalho `Unipile-Auth` com esse valor em cada entrega. O aviso do link de conexão (notify_url) não
// aceita cabeçalho, então o endereço leva uma chave `?k=` derivada do segredo e do pedido, que só vale para ele.
// A conferência é feita ANTES de interpretar o evento; a v2 (HMAC do corpo) segue no handler.

const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Comparação que não para no primeiro byte diferente. Comprimentos diferentes já são diferença. */
function sameText(a: string, b: string): boolean {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** A chave que vai no endereço de aviso do link de conexão: HMAC-SHA256 do id do pedido com o segredo da conexão. */
export function connectionNoticeKey(secret: string, attemptId: string): Promise<string> {
  return hmacHex(secret, `conexao:${attemptId}`)
}

/** O endereço de aviso com a chave do pedido em `?k=`. O segredo nunca vai no endereço, só o HMAC. */
export async function withConnectionNoticeKey(notifyUrl: string, secret: string, attemptId: string): Promise<string> {
  const url = new URL(notifyUrl)
  url.searchParams.set('k', await connectionNoticeKey(secret, attemptId))
  return url.toString()
}

export interface V1AuthInput {
  rawBody: string
  /** O cabeçalho `Unipile-Auth`. */
  header: string | null
  /** O parâmetro `k` do endereço. */
  key: string | null
  /** O segredo da conexão ativa. Vazio recusa tudo. */
  secret: string
}

/**
 * `header` quando o cabeçalho é igual ao segredo; `key` quando a chave do endereço bate com o pedido citado em `name` no
 * corpo (quem usa só pode aceitar `key` para o evento de conexão); `null` caso contrário. O corpo é lido aqui só para
 * achar o `name` do aviso, sem interpretá-lo, e um corpo que não é JSON não autentica.
 */
export async function authenticateV1Webhook(input: V1AuthInput): Promise<'header' | 'key' | null> {
  if (!input.secret) return null
  if (input.header && sameText(input.header, input.secret)) return 'header'
  if (input.key) {
    let name = ''
    try {
      const body: unknown = JSON.parse(input.rawBody)
      const value = body && typeof body === 'object' && !Array.isArray(body) ? (body as { name?: unknown }).name : undefined
      name = typeof value === 'string' ? value.trim() : ''
    } catch {
      return null
    }
    if (name && sameText(input.key, await connectionNoticeKey(input.secret, name))) return 'key'
  }
  return null
}

