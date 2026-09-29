import { assertEquals } from 'jsr:@std/assert@1'
import { UnipileRequestError } from './send-step.ts'
import {
  type ChatSent,
  type ReleasedWhatsappSend,
  sendWhatsappStep,
  type UnipileChat,
  type WhatsappPort,
  whatsappRecipientId,
  type WhatsappReleaseResult,
} from './send-whatsapp.ts'

const RELEASED: ReleasedWhatsappSend = {
  outcome: 'released',
  send_id: 'send-1',
  unipile_account_id: 'acc_dono',
  destination: '+5511987654321',
  contact_name: 'Maria Souza',
  body: 'Olá, Maria.',
  provider_chat_id: null,
}

interface Behaviour {
  exists?: boolean | Error | 'hang'
  start?: ChatSent | Error | 'hang'
  inChat?: ChatSent | Error | 'hang'
  record?: 'fail'
  block?: 'fail'
}

function fake(behaviour: Behaviour = {}) {
  const calls: string[] = []
  const recorded: Record<string, unknown>[] = []
  const blocked: unknown[][] = []
  const sends: unknown[][] = []
  const settle = <T>(what: T | Error | 'hang', signal: AbortSignal): Promise<T> => {
    if (what instanceof Error) return Promise.reject(what)
    if (what === 'hang') {
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))
      )
    }
    return Promise.resolve(what)
  }
  const chat: UnipileChat = {
    userExists: (account, userId, { signal }) => {
      calls.push('userExists')
      sends.push(['userExists', account, userId])
      return settle(behaviour.exists ?? true, signal)
    },
    startChat: (account, userId, text, { signal }) => {
      calls.push('startChat')
      sends.push(['startChat', account, userId, text])
      return settle(behaviour.start ?? { chatId: null, messageId: null }, signal)
    },
    sendInChat: (account, chatId, text, { signal }) => {
      calls.push('sendInChat')
      sends.push(['sendInChat', account, chatId, text])
      return settle(behaviour.inChat ?? { chatId: null, messageId: null }, signal)
    },
  }
  const port: WhatsappPort = {
    chat,
    sendTimeoutMs: 25,
    checkTimeoutMs: 25,
    db: {
      recordStepSendResult: (input) => {
        recorded.push(input as unknown as Record<string, unknown>)
        return behaviour.record === 'fail' ? Promise.reject(new Error('banco fora')) : Promise.resolve()
      },
      blockStep: (...args) => {
        blocked.push(args)
        return behaviour.block === 'fail' ? Promise.reject(new Error('banco fora')) : Promise.resolve()
      },
      releaseSend: () => Promise.reject(new Error('não usado')),
      releaseDueSend: () => Promise.reject(new Error('não usado')),
      stepSendChannel: () => Promise.resolve('whatsapp'),
    },
  }
  return { port, calls, recorded, blocked, sends }
}

const release = (result: WhatsappReleaseResult | Error) => () =>
  result instanceof Error ? Promise.reject(result) : Promise.resolve(result)

Deno.test('o id do destinatário é o número sem "+" e sem formatação, com @s.whatsapp.net', () => {
  assertEquals(whatsappRecipientId('+5511987654321'), '5511987654321@s.whatsapp.net')
  assertEquals(whatsappRecipientId('+14155550123'), '14155550123@s.whatsapp.net')
  assertEquals(whatsappRecipientId('+55 11 98765-4321'), null)
  assertEquals(whatsappRecipientId('5511987654321@s.whatsapp.net'), null)
  assertEquals(whatsappRecipientId('+12'), null)
  assertEquals(whatsappRecipientId(''), null)
})

Deno.test('primeira mensagem: confere o número, abre a conversa e grava aceito, sem id de mensagem quando não vem', async () => {
  const { port, calls, recorded, sends } = fake({ start: { chatId: null, messageId: null } })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
  assertEquals(calls, ['userExists', 'startChat'], 'confere o número e abre a conversa, uma vez cada')
  assertEquals(sends[0], ['userExists', 'acc_dono', '5511987654321@s.whatsapp.net'])
  assertEquals(sends[1], ['startChat', 'acc_dono', '5511987654321@s.whatsapp.net', 'Olá, Maria.'])
  assertEquals(recorded.length, 1)
  assertEquals(recorded[0].outcome, 'sent')
  assertEquals(recorded[0].providerMessageId, null, 'sem id na resposta, o id da mensagem fica vazio')
  assertEquals(
    recorded[0].providerChatId,
    '5511987654321@s.whatsapp.net',
    'conversa individual: o chat é o id do destinatário',
  )
})

Deno.test('o id da conversa e da mensagem, quando vêm, são gravados como vieram', async () => {
  const { port, recorded } = fake({ start: { chatId: 'chat-da-unipile', messageId: 'msg-1' } })
  await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(recorded[0].providerChatId, 'chat-da-unipile')
  assertEquals(recorded[0].providerMessageId, 'msg-1')
})

Deno.test('com uma conversa gravada, envia nela sem conferir o número de novo', async () => {
  const chatId = '5511987654321@s.whatsapp.net'
  const { port, calls, recorded, sends } = fake({ inChat: { chatId: null, messageId: 'msg-2' } })
  const result = await sendWhatsappStep(port, {
    sendId: 'send-2',
    release: release({ ...RELEASED, provider_chat_id: chatId }),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: true })
  assertEquals(calls, ['sendInChat'])
  assertEquals(sends[0], ['sendInChat', 'acc_dono', chatId, 'Olá, Maria.'])
  assertEquals(recorded[0].providerChatId, chatId)
  assertEquals(recorded[0].providerMessageId, 'msg-2')
})

Deno.test('número sem WhatsApp (404): bloqueia, avisa o banco e não envia', async () => {
  const { port, calls, recorded, blocked } = fake({ exists: false })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'blocked', outcome: 'destination_no_whatsapp' })
  assertEquals(calls, ['userExists'])
  assertEquals(blocked, [['send-1', 'destination_no_whatsapp']])
  assertEquals(recorded, [], 'nada de resultado de envio: nada foi enviado')
})

Deno.test('se o banco não registra o bloqueio, o envio não é dado por bloqueado nem por enviado', async () => {
  const { port, calls } = fake({ exists: false, block: 'fail' })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'release_error' })
  assertEquals(calls, ['userExists'])
})

Deno.test('falha da própria conferência do número (5xx): não envia, grava a falha para tentar de novo', async () => {
  const { port, calls, recorded } = fake({ exists: new UnipileRequestError(503) })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'blocked', outcome: 'destination_check_failed' })
  assertEquals(calls, ['userExists'])
  assertEquals(recorded.length, 1)
  assertEquals(recorded[0].outcome, 'failed')
  assertEquals(recorded[0].error, 'destination_check_failed')
})

Deno.test('conferência com 429 respeita o Retry-After', async () => {
  const { port, calls, recorded } = fake({ exists: new UnipileRequestError(429, 90) })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'blocked', outcome: 'destination_check_failed' })
  assertEquals(calls, ['userExists'])
  assertEquals(recorded[0].retryAfterSeconds, 90)
})

Deno.test('conferência que estoura o tempo: não envia e tenta de novo depois', async () => {
  const { port, calls, recorded } = fake({ exists: 'hang' })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'blocked', outcome: 'destination_check_failed' })
  assertEquals(calls, ['userExists'])
  assertEquals(recorded[0].outcome, 'failed')
})

Deno.test('conferência que falha por rede: não envia', async () => {
  const { port, calls } = fake({ exists: new TypeError('fetch failed') })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'blocked', outcome: 'destination_check_failed' })
  assertEquals(calls, ['userExists'])
})

Deno.test('tempo esgotado no envio é incerto e faz exatamente uma chamada de envio', async () => {
  const { port, calls, recorded } = fake({ start: 'hang' })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true })
  assertEquals(calls, ['userExists', 'startChat'], 'um único envio: nunca um segundo por conta própria')
  assertEquals(recorded[0].outcome, 'uncertain')
  assertEquals(recorded[0].error, 'timeout')
})

Deno.test('tempo esgotado numa conversa existente também é incerto, com uma só chamada', async () => {
  const { port, calls, recorded } = fake({ inChat: 'hang' })
  const result = await sendWhatsappStep(port, {
    sendId: 'send-1',
    release: release({ ...RELEASED, provider_chat_id: '5511987654321@s.whatsapp.net' }),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true })
  assertEquals(calls, ['sendInChat'])
  assertEquals(recorded[0].error, 'timeout')
})

Deno.test('falha de rede depois de pedir o envio é incerta, com uma só chamada', async () => {
  const { port, calls, recorded } = fake({ start: new TypeError('connection reset') })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true })
  assertEquals(calls.filter((c) => c !== 'userExists'), ['startChat'])
  assertEquals(recorded[0].error, 'network')
})

Deno.test('5xx no envio (pode ter sido aceito) é incerto, nunca repetido sozinho', async () => {
  for (const status of [500, 502, 504, 408]) {
    const { port, calls, recorded } = fake({ start: new UnipileRequestError(status) })
    const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
    assertEquals(result, { kind: 'attempted', outcome: 'uncertain', recorded: true }, `HTTP ${status}`)
    assertEquals(calls.filter((c) => c === 'startChat').length, 1, `HTTP ${status}`)
    assertEquals(recorded[0].error, `http_${status}`)
  }
})

Deno.test('recusa 4xx é falha com código claro, sem tentar de novo dentro da mesma chamada', async () => {
  const { port, calls, recorded } = fake({ start: new UnipileRequestError(403) })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'attempted', outcome: 'failed', recorded: true })
  assertEquals(calls.filter((c) => c === 'startChat').length, 1)
  assertEquals(recorded[0].error, 'http_403')
  assertEquals(recorded[0].retryAfterSeconds, null)
})

Deno.test('429 no envio é falha (nada saiu) e o Retry-After vai para o banco', async () => {
  const { port, calls, recorded } = fake({ start: new UnipileRequestError(429, 42) })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'attempted', outcome: 'failed', recorded: true })
  assertEquals(calls.filter((c) => c === 'startChat').length, 1)
  assertEquals(recorded[0].error, 'rate_limited')
  assertEquals(recorded[0].retryAfterSeconds, 42)
})

Deno.test('o que o banco bloqueou (espaçamento, Conta fora, número trocado) não chega à Unipile', async () => {
  for (
    const outcome of [
      'sender_spacing',
      'sender_not_ready',
      'destination_changed',
      'destination_no_whatsapp',
      'owner_not_responsible',
    ] as const
  ) {
    const { port, calls, recorded } = fake()
    const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release({ outcome, send_id: 'send-1' }) })
    assertEquals(result, { kind: 'blocked', outcome })
    assertEquals(calls, [], outcome)
    assertEquals(recorded, [], outcome)
  }
})

Deno.test('envio inexistente e erro do banco ao liberar não chegam à Unipile', async () => {
  const a = fake()
  assertEquals(
    await sendWhatsappStep(a.port, {
      sendId: 'x',
      release: release(Object.assign(new Error('nf'), { code: 'P0002' })),
    }),
    { kind: 'not_found' },
  )
  const b = fake()
  assertEquals(await sendWhatsappStep(b.port, { sendId: 'x', release: release(new Error('boom')) }), {
    kind: 'release_error',
  })
  assertEquals([...a.calls, ...b.calls], [])
})

Deno.test('se o resultado não é gravado, o envio é dado como tentado e não gravado', async () => {
  const { port } = fake({ record: 'fail' })
  const result = await sendWhatsappStep(port, { sendId: 'send-1', release: release(RELEASED) })
  assertEquals(result, { kind: 'attempted', outcome: 'sent', recorded: false })
})

Deno.test('um número fora do formato não vai à Unipile', async () => {
  const { port, calls, recorded } = fake()
  const result = await sendWhatsappStep(port, {
    sendId: 'send-1',
    release: release({ ...RELEASED, destination: '11 98765-4321' }),
  })
  assertEquals(result, { kind: 'attempted', outcome: 'failed', recorded: true })
  assertEquals(calls, [])
  assertEquals(recorded[0].error, 'invalid_destination')
})
