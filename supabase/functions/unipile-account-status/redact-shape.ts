// O FORMATO censurado do corpo de um webhook, para o canais-06 (parte 2) escrever fixtures a partir do JSON real da
// Unipile sem guardar nada de ninguém. Fica o esqueleto: chaves em snake_case, aninhamento, os 3 primeiros itens de
// cada lista, booleanos, nulos e inteiros pequenos. O resto é censurado POR LISTA DE PERMISSÃO, nunca pela forma:
//   - string: vira "<string:TAMANHO>", exceto o nome de um evento ou de um provedor que esteja na lista explícita
//     abaixo (e só nas chaves de tipo/evento/provedor). Uma string com "cara" de enumeração (um cargo, o "status" de
//     perfil do WhatsApp, um apelido) NÃO passa, porque a forma não distingue um enum de um dado pessoal.
//   - número: passa só inteiro com valor absoluto menor que 1.000.000; qualquer outro (decimal, data em epoch, inteiro
//     com cara de telefone ou de id) vira "<number:DÍGITOS>".
//   - chave: passa só se for snake_case minúsculo (`^[a-z][a-z0-9_]{0,39}$`); qualquer outra ("Maria",
//     "a-55-11-99999-9999", um telefone ou id como chave de mapa) vira "<key:TAMANHO#POSIÇÃO>".
// Texto de mensagem, nomes, telefones, ids, datas e endereços nunca passam.

/** As únicas chaves cujo valor string pode passar, e só se o valor estiver em ALLOWED_VALUES. */
const ENUM_KEYS = new Set(['type', 'event', 'provider', 'account_provider'])

/** Os únicos valores string que passam: nomes de evento da v2 já tratados no código e provedores conhecidos. */
const ALLOWED_VALUES = new Set([
  // eventos de mensagem da v2
  'message.new',
  'message.update',
  'message.delete',
  'message.delivery',
  'message.receipt.read',
  'message.reaction.new',
  // eventos de conta tratados por unipile-account-status
  'account.add',
  'account.reconnect',
  'account.initial_sync.completed',
  'account.status.running',
  'account.status.disconnected',
  'account.status.errored',
  'account.remove',
  // provedores
  'whatsapp',
  'linkedin',
  'mail',
])

/** Uma chave de campo: minúsculas, dígitos e sublinhado. */
const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/
const MAX_ITEMS = 3
const MAX_DEPTH = 12
/** Inteiros abaixo disso (contagens, tamanhos) passam; acima pode ser telefone, id ou data. */
const MAX_INTEGER_MAGNITUDE = 1_000_000

function redactNumber(value: number) {
  if (Number.isInteger(value) && Math.abs(value) < MAX_INTEGER_MAGNITUDE) return value
  return `<number:${String(Math.abs(value)).replace(/\D/g, '').length}>`
}

function redactKey(key: string, index: number) {
  // Defesa em profundidade: mesmo em snake_case, uma chave com 6 dígitos seguidos pode ser um telefone ou um id.
  return FIELD_NAME.test(key) && !/[0-9]{6,}/.test(key) ? key : `<key:${key.length}#${index}>`
}

function redact(value: unknown, key: string | null, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return redactNumber(value)
  if (typeof value === 'string') {
    return key !== null && ENUM_KEYS.has(key) && ALLOWED_VALUES.has(value) ? value : `<string:${value.length}>`
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
