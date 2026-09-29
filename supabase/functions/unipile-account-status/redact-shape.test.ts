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

Deno.test('o esqueleto fica: chaves, aninhamento, provedor e evento da lista, booleanos, nulos e inteiros pequenos', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.type, 'message.new')
  assertEquals(shape.payload.provider, 'whatsapp')
  assertEquals(shape.payload.is_own, false)
  assertEquals(shape.payload.quoted, null)
  assertEquals(shape.payload.size, 20480)
  assertEquals(Object.keys(shape.payload.sender).sort(), ['id', 'name', 'phone', 'role'])
  assertEquals(Object.keys(shape).sort(), ['account_id', 'created_at', 'id', 'payload', 'type'])
})

Deno.test('toda string vira o tamanho dela, menos o evento ou o provedor da lista explícita', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.id, `<string:${PESSOAL.id.length}>`)
  assertEquals(shape.account_id, `<string:${PESSOAL.account_id.length}>`)
  assertEquals(shape.created_at, `<string:${PESSOAL.created_at.length}>`)
  assertEquals(shape.payload.text, `<string:${PESSOAL.payload.text.length}>`)
  assertEquals(shape.payload.sender.name, `<string:${PESSOAL.payload.sender.name.length}>`)
  assertEquals(shape.payload.chat_id, `<string:${PESSOAL.payload.chat_id.length}>`)
  // "inbound", "received", "text" e "contact" têm cara de enum, mas não estão na lista: a forma não decide.
  assertEquals(shape.payload.direction, '<string:7>')
  assertEquals(shape.payload.status, '<string:8>')
  assertEquals(shape.payload.kind, '<string:4>')
  assertEquals(shape.payload.sender.role, '<string:7>')
  assertEquals(shape.payload.attachments[0].content_type, '<string:10>')
})

Deno.test('listas guardam só os 3 primeiros itens', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.payload.attachments.length, 3)
  assertEquals(shape.payload.participantes.length, 2)
  assertEquals(Object.keys(shape.payload.attachments[0]).sort(), ['content_type', 'name', 'url'])
  assertEquals(redactShape({ itens: [1, 2, 3, 4, 5, 6] }), { itens: [1, 2, 3] })
})

Deno.test('só inteiro abaixo de 1.000.000 passa; decimal, data e inteiro com cara de telefone ou id viram contagem de dígitos', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(shape.payload.phone_number, '<number:13>')
  assertEquals(shape.payload.long_id, '<number:18>')
  assertEquals(shape.payload.timestamp, '<number:13>')
  assertEquals(shape.payload.seconds, '<number:10>')
  assertEquals(shape.payload.ratio, '<number:3>')
  assertEquals(
    redactShape({
      a: 999_999,
      b: 1_000_000,
      c: -999_999,
      d: -1_000_000,
      e: 1_133_334_444, // telefone fixo de 10 dígitos
      f: 5_511_987_654_321,
      g: 0.5,
      h: -12.75,
      i: 0,
      j: true,
      k: null,
      l: 1e21,
    }),
    {
      a: 999_999,
      b: '<number:7>',
      c: -999_999,
      d: '<number:7>',
      e: '<number:10>',
      f: '<number:13>',
      g: '<number:2>',
      h: '<number:4>',
      i: 0,
      j: true,
      k: null,
      l: '<number:3>',
    },
  )
})

Deno.test('só a chave em snake_case minúsculo passa; nome, telefone ou id como chave é censurado', () => {
  const shape = redactShape(PESSOAL) as Record<string, any>
  assertEquals(Object.keys(shape.payload.reactions).length, 1)
  const [chave] = Object.keys(shape.payload.reactions)
  assertStringIncludes(chave, '<key:')
  assertFalse(chave.includes('5511987654321'))
  assertEquals(
    Object.keys(redactShape({
      'a b': 1,
      'joao@x.com': 2,
      'id5511987654': 3,
      campo_ok: 4,
      Maria: 5,
      Ana: 6,
      'a-55-11-99999-9999': 7,
      'João': 8,
      campoOk: 9,
      _privado: 10,
      ['x'.repeat(41)]: 11,
      ['x'.repeat(40)]: 12,
    })),
    [
      '<key:3#0>',
      '<key:10#1>',
      '<key:12#2>',
      'campo_ok',
      '<key:5#4>',
      '<key:3#5>',
      '<key:18#6>',
      '<key:4#7>',
      '<key:7#8>',
      '<key:8#9>',
      '<key:41#10>',
      'x'.repeat(40),
    ],
  )
})

Deno.test('só o nome de evento ou de provedor da lista passa, e só na chave de tipo, evento ou provedor', () => {
  for (
    const evento of [
      'message.new',
      'message.update',
      'message.delete',
      'message.delivery',
      'message.receipt.read',
      'message.reaction.new',
      'account.add',
      'account.reconnect',
      'account.initial_sync.completed',
      'account.status.running',
      'account.status.disconnected',
      'account.status.errored',
      'account.remove',
    ]
  ) {
    assertEquals(redactShape({ type: evento, event: evento }), { type: evento, event: evento })
  }
  for (const provedor of ['whatsapp', 'linkedin', 'mail']) {
    assertEquals(redactShape({ provider: provedor }), { provider: provedor })
  }
  const shape = redactShape({
    type: 'Mensagem Nova',
    event: 'message.other',
    provider: 'whatsapp-business',
    kind: 'text',
    direction: 'inbound',
    source: 'api',
    status: 'ocupado',
    role: 'cto',
    // o valor da lista em outra chave não passa
    tipo: 'message.new',
    nome: 'whatsapp',
  }) as Record<string, any>
  assertEquals(shape, {
    type: '<string:13>',
    event: '<string:13>',
    provider: '<string:17>',
    kind: '<string:4>',
    direction: '<string:7>',
    source: '<string:3>',
    status: '<string:7>',
    role: '<string:3>',
    tipo: '<string:11>',
    nome: '<string:8>',
  })
})

Deno.test('só a chave dita vale: o mesmo valor dentro de uma lista é censurado', () => {
  const shape = redactShape({ nome: 'joao', tags: ['joao', 'maria'], type: ['message.new'], provider: ['whatsapp'] })
  assertEquals(shape, {
    nome: '<string:4>',
    tags: ['<string:4>', '<string:5>'],
    type: ['<string:11>'],
    provider: ['<string:8>'],
  })
})

// Um corpo hostil: dado pessoal em chave, em "status" (o "recado" do perfil do WhatsApp), em cargo, em número e em unicode.
const HOSTIL = {
  type: 'message.new',
  account_id: 'acc_x',
  Maria: { Ana: 'oi' },
  'a-55-11-99999-9999': 'segredo-chave',
  payload: {
    provider: 'whatsapp',
    role: 'cto',
    status: 'Ocupado, só no Zap depois das 18h',
    source: 'maria.silva',
    about: 'Dentista em Pinheiros, atendo por hora marcada',
    profile: { status: 'ocupado', role: 'joao', provider: 'joao', source: 'api', kind: 'maria.silva' },
    landline: 1_133_334_444,
    mobile: 5_511_987_654_321,
    cpf: 12_345_678_900,
    lat: -23.5613351,
    lng: -46.6565712,
    epoch_ms: 1_759_158_000_000,
    epoch_s: 1_759_158_000,
    price: 19.99,
    name: 'José Ângela Müller 山田太郎 🎉',
    apelido: 'Zé 👍',
    'Ângela': 'unicode na chave',
    '山田': 'unicode na chave',
    lista: [1_133_334_444, 0.1, 'Dona Maria', { Nome: 'Carlos', telefone: 1_133_334_444 }],
  },
}

const SOBRAS_HOSTIS = [
  'Maria',
  'Ana',
  'oi',
  'segredo-chave',
  '55-11',
  '99999',
  'cto',
  'Ocupado',
  'ocupado',
  'Zap',
  'maria.silva',
  'joao',
  'Dentista',
  'Pinheiros',
  'hora marcada',
  '1133334444',
  '5511987654321',
  '12345678900',
  '23.5613351',
  '46.6565712',
  '5613351',
  '6565712',
  '1759158000',
  '19.99',
  '0.1',
  'José',
  'Ângela',
  'Müller',
  '山田',
  '太郎',
  '🎉',
  '👍',
  'Zé',
  'Dona',
  'Carlos',
  'Nome',
  'unicode na chave',
]

Deno.test('um corpo hostil (nomes como chave, "recado" em status, telefones inteiros, decimais e unicode): nada sobrevive', () => {
  const shape = redactShape(HOSTIL) as Record<string, any>
  const guardado = JSON.stringify(shape)
  for (const trecho of SOBRAS_HOSTIS) {
    assertFalse(guardado.includes(trecho), `"${trecho}" sobrou no formato: ${guardado}`)
  }
  assertEquals(shape, {
    type: 'message.new',
    account_id: '<string:5>',
    '<key:5#2>': { '<key:3#0>': '<string:2>' },
    '<key:18#3>': '<string:13>',
    payload: {
      provider: 'whatsapp',
      role: '<string:3>',
      status: '<string:33>',
      source: '<string:11>',
      about: '<string:46>',
      profile: {
        status: '<string:7>',
        role: '<string:4>',
        provider: '<string:4>',
        source: '<string:3>',
        kind: '<string:11>',
      },
      landline: '<number:10>',
      mobile: '<number:13>',
      cpf: '<number:11>',
      lat: '<number:9>',
      lng: '<number:9>',
      epoch_ms: '<number:13>',
      epoch_s: '<number:10>',
      price: '<number:4>',
      name: `<string:${HOSTIL.payload.name.length}>`,
      apelido: `<string:${HOSTIL.payload.apelido.length}>`,
      '<key:6#16>': `<string:${'unicode na chave'.length}>`,
      '<key:2#17>': `<string:${'unicode na chave'.length}>`,
      lista: ['<number:10>', '<number:2>', '<string:10>'],
    },
  })
})

Deno.test('uma chave __proto__ não mexe no protótipo e o corpo que não é objeto também vira formato', () => {
  const corpo = JSON.parse('{"__proto__": {"admin": "sim"}, "a": 1}')
  const shape = redactShape(corpo)
  assertEquals(Object.getPrototypeOf(shape), Object.prototype)
  assertEquals((shape as Record<string, unknown>).admin, undefined)
  assertEquals(Object.keys(shape).sort(), ['<key:9#0>', 'a'])
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
