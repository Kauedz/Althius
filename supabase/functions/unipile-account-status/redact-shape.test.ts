import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1'
import { redactShape } from './redact-shape.ts'

// Um evento message.new inventado, cheio de dados pessoais em todo lugar onde eles podem aparecer.
const PESSOAL = {
  id: 'evt_9f8e7d6c5b',
  type: 'message.new',
  created_at: '2026-09-29T15:00:00Z',
  account_id: 'acc_conta_secreta_123',
  payload: {
    id: 'msg_abc123def456',
    chat_id: '5511987654321@s.whatsapp.net',
    provider: 'whatsapp',
    direction: 'inbound',
    status: 'received',
    kind: 'text',
    text: 'Oi Maria, meu CPF é 123.456.789-00, ligue para 11 98765-4321 ou mande e-mail para joao.silva@empresa.com.br',
    sender: {
      id: '5511987654321@s.whatsapp.net',
      name: 'João da Silva Pereira',
      phone: '+55 11 98765-4321',
      role: 'contact',
    },
    is_own: false,
    quoted: null,
    timestamp: 1759158000000,
    seconds: 1759158000,
    size: 20480,
    ratio: 0.75,
    phone_number: 5511987654321,
    long_id: 987654321012345678,
    attachments: [
      { content_type: 'image/jpeg', name: 'foto-do-joao.jpg', url: 'https://cdn.exemplo.com/a?token=segredo' },
      { content_type: 'application/pdf', name: 'contrato-maria.pdf', url: 'https://cdn.exemplo.com/b?token=segredo' },
      { content_type: 'video/mp4', name: 'video-joao.mp4', url: 'https://cdn.exemplo.com/c?token=segredo' },
      { content_type: 'audio/ogg', name: 'audio-quarto-item.ogg', url: 'https://cdn.exemplo.com/d?token=segredo' },
      { content_type: 'image/png', name: 'quinto-item.png', url: 'https://cdn.exemplo.com/e?token=segredo' },
    ],
    reactions: { '5511987654321@s.whatsapp.net': '👍' },
    participantes: ['5511987654321@s.whatsapp.net', '5511912345678@s.whatsapp.net'],
  },
}

const TRECHOS_PESSOAIS = [
  'evt_9f8e7d6c5b',
  'acc_conta_secreta_123',
  'msg_abc123def456',
  '5511987654321',
  '5511912345678',
  's.whatsapp.net',
  'whatsapp.net',
  'Maria',
  'João',
  'Silva',
  'Pereira',
  'CPF',
  '123.456.789',
  '98765',
  'joao.silva',
  'empresa.com.br',
  '@',
  'foto-do-joao',
  'contrato-maria',
  'video-joao',
  'audio-quarto',
  'quinto-item',
  'https://',
  'cdn.exemplo.com',
  'segredo',
  '👍',
  '987654321012345678',
  '2026-09-29',
]

Deno.test('o formato não guarda nada pessoal: nomes, telefones, ids, texto, endereços e anexos', () => {
  const guardado = JSON.stringify(redactShape(PESSOAL))
  for (const trecho of TRECHOS_PESSOAIS) {
    assertFalse(guardado.includes(trecho), `"${trecho}" sobrou no formato: ${guardado}`)
  }
})

Deno.test('o esqueleto fica: chaves, aninhamento, tokens de enumeração, booleanos, nulos e números de formato', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.type, 'message.new')
  assertEquals(shape.payload.provider, 'whatsapp')
  assertEquals(shape.payload.direction, 'inbound')
  assertEquals(shape.payload.status, 'received')
  assertEquals(shape.payload.kind, 'text')
  assertEquals(shape.payload.sender.role, 'contact')
  assertEquals(shape.payload.is_own, false)
  assertEquals(shape.payload.quoted, null)
  assertEquals(shape.payload.timestamp, 1759158000000)
  assertEquals(shape.payload.seconds, 1759158000)
  assertEquals(shape.payload.size, 20480)
  assertEquals(shape.payload.ratio, 0.75)
  assertEquals(Object.keys(shape.payload.sender).sort(), ['id', 'name', 'phone', 'role'])
  assertEquals(Object.keys(shape).sort(), ['account_id', 'created_at', 'id', 'payload', 'type'])
})

Deno.test('toda string vira o tamanho dela, menos o valor de uma chave de enumeração em forma de token', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.id, `<string:${PESSOAL.id.length}>`)
  assertEquals(shape.account_id, `<string:${PESSOAL.account_id.length}>`)
  assertEquals(shape.created_at, `<string:${PESSOAL.created_at.length}>`)
  assertEquals(shape.payload.text, `<string:${PESSOAL.payload.text.length}>`)
  assertEquals(shape.payload.sender.name, `<string:${PESSOAL.payload.sender.name.length}>`)
  assertEquals(shape.payload.chat_id, `<string:${PESSOAL.payload.chat_id.length}>`)
  // content_type é chave de enumeração, mas "image/jpeg" não tem a forma de token (tem barra): vira tamanho.
  assertEquals(shape.payload.attachments[0].content_type, '<string:10>')
})

Deno.test('listas guardam só os 3 primeiros itens', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.payload.attachments.length, 3)
  assertEquals(shape.payload.participantes.length, 2)
  assertEquals(Object.keys(shape.payload.attachments[0]).sort(), ['content_type', 'name', 'url'])
  assertEquals(redactShape({ itens: [1, 2, 3, 4, 5, 6] }), { itens: [1, 2, 3] })
})

Deno.test('um inteiro que pode ser telefone ou id não passa; datas e contagens passam', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.payload.phone_number, '<number:13>')
  assertEquals(shape.payload.long_id, '<number:18>')
  assertEquals(
    redactShape({ a: 9_999_999_999, b: 10_000_000_000, c: 1_759_158_000_000, d: 5_511_987_654_321, e: -3 }),
    {
      a: 9_999_999_999,
      b: '<number:11>',
      c: 1_759_158_000_000,
      d: '<number:13>',
      e: -3,
    },
  )
})

Deno.test('uma chave que é dado pessoal (um telefone como chave) também é censurada', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(Object.keys(shape.payload.reactions).length, 1)
  const [chave] = Object.keys(shape.payload.reactions)
  assertStringIncludes(chave, '<key:')
  assertFalse(chave.includes('5511987654321'))
  assertEquals(Object.keys(redactShape({ 'a b': 1, 'joao@x.com': 2, 'id5511987654': 3, campo_ok: 4 })), [
    '<key:3#0>',
    '<key:10#1>',
    '<key:12#2>',
    'campo_ok',
  ])
})

Deno.test('o valor de uma chave de enumeração que não tem forma de token continua censurado', () => {
  const shape = redactShape({
    type: 'Mensagem Nova',
    status: 'recebida em 15/09',
    role: 'João',
    provider: 'whatsapp-business',
    kind: 'x'.repeat(41),
    direction: 'in bound',
    event: 'message.new',
    source: 'api',
  }) as Record<string, any>
  assertEquals(shape.type, '<string:13>')
  assertEquals(shape.status, '<string:17>')
  assertEquals(shape.role, '<string:4>')
  assertEquals(shape.provider, 'whatsapp-business')
  assertEquals(shape.kind, '<string:41>')
  assertEquals(shape.direction, '<string:8>')
  assertEquals(shape.event, 'message.new')
  assertEquals(shape.source, 'api')
})

Deno.test('só a chave dita vale: o mesmo token em outra chave, ou dentro de uma lista, é censurado', () => {
  const shape = redactShape({ nome: 'joao', tags: ['joao', 'maria'], type: ['joao'] }) as Record<string, any>
  assertEquals(shape.nome, '<string:4>')
  assertEquals(shape.tags, ['<string:4>', '<string:5>'])
  assertEquals(shape.type, ['<string:4>'])
})

Deno.test('uma chave __proto__ não mexe no protótipo e o corpo que não é objeto também vira formato', () => {
  const corpo = JSON.parse('{"__proto__": {"admin": "sim"}, "a": 1}')
  const shape = redactShape(corpo)
  assertEquals(Object.getPrototypeOf(shape), Object.prototype)
  assertEquals((shape as Record<string, unknown>).admin, undefined)
  assertEquals(Object.keys(shape).sort(), ['__proto__', 'a'])
  assertEquals(redactShape('texto qualquer'), { shape: '<string:14>' })
  assertEquals(redactShape([{ a: 'b' }]), { shape: [{ a: '<string:1>' }] })
  assertEquals(redactShape(null), { shape: null })
})

Deno.test('um aninhamento fundo demais é cortado', () => {
  let fundo: unknown = 'segredo'
  for (let i = 0; i < 30; i++) fundo = { n: fundo }
  const guardado = JSON.stringify(redactShape(fundo))
  assert(guardado.includes('<depth-limit>'))
  assertFalse(guardado.includes('segredo'))
})
