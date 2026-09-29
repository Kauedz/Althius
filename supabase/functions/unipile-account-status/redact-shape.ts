// O FORMATO censurado do corpo de um webhook, para o canais-06 (parte 2) escrever fixtures a partir do JSON real da
// Unipile sem guardar nada de ninguém. Fica o esqueleto: chaves, aninhamento, os 3 primeiros itens de cada lista,
// booleanos, nulos e números que não parecem telefone ou id. Toda string vira "<string:TAMANHO>", exceto o valor de uma
// chave de enumeração (type, event, provider, source, kind, direction, status, content_type, role) que tenha a forma
// de um token (minúsculas, dígitos, _ . -). Texto de mensagem, nomes, telefones, ids e endereços nunca passam.

const ENUM_KEYS = new Set([
  'type',
  'event',
  'provider',
  'source',
  'kind',
  'direction',
  'status',
  'content_type',
  'role',
])
const ENUM_TOKEN = /^[a-z][a-z0-9_.-]{0,39}$/
/** Uma chave com cara de nome de campo. Qualquer outra (um id, um número de telefone como chave) é censurada. */
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,59}$/
const MAX_ITEMS = 3
const MAX_DEPTH = 12

/**
 * Números que servem para entender o formato (contagens, tamanhos, datas em segundos ou em milissegundos) passam;
 * um inteiro grande demais para ser data e comprido demais para ser contagem pode ser um telefone ou um id.
 */
function safeNumber(value: number) {
  if (!Number.isInteger(value)) return true
  const magnitude = Math.abs(value)
  return magnitude < 1e10 || (magnitude >= 1e12 && magnitude < 4.2e12)
}

function redactKey(key: string, index: number) {
  return FIELD_NAME.test(key) && !/[0-9]{6,}/.test(key) ? key : `<key:${key.length}#${index}>`
}

function redact(value: unknown, key: string | null, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return safeNumber(value) ? value : `<number:${String(Math.abs(value)).length}>`
  if (typeof value === 'string') {
    return key !== null && ENUM_KEYS.has(key) && ENUM_TOKEN.test(value) ? value : `<string:${value.length}>`
  }
  if (depth >= MAX_DEPTH) return '<depth-limit>'
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => redact(item, null, depth + 1))
  if (typeof value === 'object') {
    // fromEntries define cada chave como propriedade própria (uma chave `__proto__` não mexe no protótipo).
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v], i) => [redactKey(k, i), redact(v, k, depth + 1)]),
    )
  }
  // undefined, função, símbolo: não existem em JSON.
  return null
}

export function redactShape(body: unknown): Record<string, unknown> {
  const shape = redact(body, null, 0)
  return shape && typeof shape === 'object' && !Array.isArray(shape) ? shape as Record<string, unknown> : { shape }
}
