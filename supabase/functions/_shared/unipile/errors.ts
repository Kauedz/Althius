// Os erros tipados da Unipile e a regra de reenvio. O tipo diz o que se pode concluir de uma falha:
//  - recusa definitiva (4xx, exceto 408 e 429): a Unipile recusou, nada saiu;
//  - resultado incerto (5xx, 408, 429, rede, resposta ilegível): o envio pode ter saído;
//  - configuração ausente: nem se chamou a Unipile.
// Incerto nunca reenvia sozinho: fica para uma pessoa (ou a conferência da conversa) decidir.

export type UnipileFailureKind = 'definite_refusal' | 'uncertain' | 'config_missing'

/**
 * Nenhum tipo de falha reenvia sozinho. O `false` é o tipo: trocar um deles por `true` não compila.
 * (Esperar o Retry-After e tentar de novo uma recusa que a Unipile diz que não processou é decisão do núcleo de envio,
 * que hoje trata 429 e 503 assim em send-chat-step.ts; o tipo daqui só diz o que a falha pode ter feito.)
 */
export const AUTO_RESEND_ALLOWED = {
  definite_refusal: false,
  uncertain: false,
  config_missing: false,
} as const satisfies Record<UnipileFailureKind, false>

/** O tipo de uma resposta HTTP fora de 2xx. */
export function classifyHttpFailure(status: number): 'definite_refusal' | 'uncertain' {
  return status >= 400 && status < 500 && status !== 408 && status !== 429 ? 'definite_refusal' : 'uncertain'
}

/** A Unipile respondeu, mas fora de 2xx. */
export class UnipileRequestError extends Error {
  constructor(readonly status: number, readonly retryAfterSeconds: number | null = null) {
    super(`Unipile respondeu HTTP ${status}`)
    this.name = 'UnipileRequestError'
  }

  get kind(): 'definite_refusal' | 'uncertain' {
    return classifyHttpFailure(this.status)
  }
}

/**
 * A Unipile recusou (HTTP fora de 2xx) e o corpo da recusa disse o motivo, quando disse. Todo erro HTTP do cliente único
 * (client.ts) é desta classe: o `reason` só vem numa recusa definitiva (4xx), e o núcleo do e-mail ignora o motivo.
 */
export class UnipileChatRequestError extends UnipileRequestError {
  constructor(status: number, retryAfterSeconds: number | null, readonly reason: string | null) {
    super(status, retryAfterSeconds)
    this.name = 'UnipileChatRequestError'
  }
}

/** O motivo que a tela mostra quando a versão da conexão ativa não faz a operação pedida. */
export const UNSUPPORTED_ON_PROVIDER_VERSION = 'unsupported_on_provider_version'

/**
 * A operação existe na Althius, mas o adaptador da versão da conexão ativa ainda não a faz (ex.: anexo e resposta em
 * conversa de e-mail na v1). Nada foi chamado na Unipile, então a recusa é definitiva e nada saiu. O status 422 só marca
 * "recusada por nós" para o núcleo do envio, que já trata 4xx como impedimento.
 */
export class UnipileUnsupportedOperationError extends UnipileChatRequestError {
  constructor(readonly operation: string, readonly version: 'v1' | 'v2') {
    super(422, null, UNSUPPORTED_ON_PROVIDER_VERSION)
    this.name = 'UnipileUnsupportedOperationError'
    this.message = `A API ${version} da Unipile não faz "${operation}" nesta versão da Althius`
  }
}

/**
 * A Unipile respondeu 2xx, mas a resposta não bate com o schema (em geral, sem o id do envio): o envio provavelmente
 * saiu, então fica incerto. `issues` diz onde a resposta falhou (caminhos), nunca o valor.
 */
export class UnipileUnreadableResponse extends Error {
  readonly kind = 'uncertain' as const

  constructor(readonly issues: string[] = []) {
    super(
      'Unipile respondeu 2xx sem o id do e-mail enviado' + (issues.length ? ` (${issues.join(', ')})` : ''),
    )
    this.name = 'UnipileUnreadableResponse'
  }
}

/** Faltou (ou veio inválido) algo da configuração da conexão. `fields` são os nomes dos campos, nunca valores. */
export class UnipileConfigMissingError extends Error {
  readonly kind = 'config_missing' as const

  constructor(readonly fields: string[]) {
    super(`Configuração da Unipile ausente ou inválida: ${fields.join(', ')}`)
    this.name = 'UnipileConfigMissingError'
  }
}

/** O tipo de qualquer erro de uma chamada: rede, timeout e o que não conhecemos são incertos. */
export function failureKind(error: unknown): UnipileFailureKind {
  const kind = (error as { kind?: unknown } | null)?.kind
  return kind === 'definite_refusal' || kind === 'uncertain' || kind === 'config_missing' ? kind : 'uncertain'
}

/**
 * O motivo de uma recusa da Unipile, em um código que o Vendedor responsável entende. Quem decide é o texto da
 * resposta (tipo, código, título ou detalhe), em minúsculas; o status só ajuda. Sem pista, vira `http_<status>`.
 * não confirmado: o formato dos erros da Unipile v2; as pistas abaixo são palavras que a busca encontrou.
 */
export function classifyProviderError(status: number, bodyText: string): string {
  const text = bodyText.toLowerCase()
  if (/credit/.test(text) || status === 402) return 'insufficient_credits'
  if (/(already|pending).*(invit|connect|relation)|(invit|connect|relation).*(already|pending)|already_?invited/.test(text)) {
    return 'invite_already_pending'
  }
  if (/(too.?long|max.*(length|char)|exceed|character.?limit|note.*limit)/.test(text)) return 'invite_note_too_long'
  if (/(subscription|premium|sales.?navigator|recruiter|upgrade|not.?entitled|plan)/.test(text)) return 'subscription_required'
  if (/(not.?connected|not.?a.?connection|no.?relation|cannot.?message|first.?degree|not.?allowed.*messag|messag.*not.?allowed)/.test(text)) {
    return 'not_connected'
  }
  if (/(invalid|unknown|not.?found).*(user|recipient|profile|number|phone)|(user|recipient|profile|number|phone).*(invalid|not.?found|not exist)/.test(text)) {
    return 'recipient_not_found'
  }
  if (/(limit|quota|restrict)/.test(text)) return 'provider_limit_reached'
  return `http_${status}`
}
