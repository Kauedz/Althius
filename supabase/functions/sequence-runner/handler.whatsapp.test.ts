// O Executor com passos de WhatsApp (canais-06, parte 1): o banco entrega o canal de cada passo vencido, e o de WhatsApp
// segue pelo núcleo do WhatsApp, com a Unipile falsa na camada de rede (fetch), para provar também as URLs e a chave.
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import type { EmailSent, OutgoingEmail, ReleaseResult, UnipileMail } from '../_shared/send-step.ts'
import { unipileChatVia } from '../_shared/send-step-adapters.ts'
import type { ReleasedWhatsappSend, WhatsappPort, WhatsappReleaseResult } from '../_shared/send-whatsapp.ts'
import { createHandler, type DueSend, type RunnerDb } from './handler.ts'

const TOKEN = 'a'.repeat(64)
const TITULAR = '50000000-0000-0000-0000-000000000001'
const WA_1 = '60000000-0000-0000-0000-0000000000a1'
const WA_2 = '60000000-0000-0000-0000-0000000000a2'
const EMAIL_1 = '60000000-0000-0000-0000-0000000000e1'
const CHAVE = 'chave-secreta-da-api-9f8e7d'

function whatsappLiberado(sendId: string, extra: Partial<ReleasedWhatsappSend> = {}): ReleasedWhatsappSend {
  return {
    outcome: 'released',
    send_id: sendId,
    unipile_account_id: 'acc_titular',
    destination: '+5511987654321',
    contact_name: 'Maria Souza',
    body: 'Olá, Maria.',
    provider_chat_id: null,
    ...extra,
  }
}

function emailLiberado(sendId: string): ReleaseResult {
  return {
    outcome: 'released',
    send_id: sendId,
    unipile_account_id: 'unipile-google-1',
    destination: 'maria@empresa-alvo.test',
    contact_name: 'Maria Souza',
    subject: 'Apresentação',
    body: 'Olá, Maria.',
    reply_to_message_id: null,
    tracking_header_name: 'X-Althius-Envio',
    tracking_header_value: sendId,
  }
}

function bancos(
  due: DueSend[],
  whatsapp: Record<string, WhatsappReleaseResult | Error>,
  emails: Record<string, ReleaseResult> = {},
) {
  const recorded: Record<string, unknown>[] = []
  const blocked: unknown[][] = []
  const released: string[] = []
  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claimDueSends: async (limit) => due.slice(0, limit),
    releaseDueSend: async (sendId) => {
      released.push(`email:${sendId}`)
      return emails[sendId] ?? { outcome: 'not_due', send_id: sendId }
    },
    conversationForSend: async () => null,
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    recordStepSendResult: async (input) => {
      recorded.push({ via: 'email', ...input })
    },
    claimSenderReconciliations: async () => [],
    conversationsToReconcile: async () => [],
    recordReconciliationProgress: async () => true,
    finishSenderReconciliation: async () => true,
  }
  const whatsappDb: WhatsappPort['db'] = {
    recordStepSendResult: async (input) => {
      recorded.push({ via: 'whatsapp', ...input })
    },
    blockStep: async (...args) => {
      blocked.push(args)
    },
    releaseSend: async () => {
      throw new Error('o Executor não usa a liberação do titular')
    },
    releaseDueSend: async (sendId) => {
      released.push(`whatsapp:${sendId}`)
      const result = whatsapp[sendId] ?? { outcome: 'not_due', send_id: sendId }
      if (result instanceof Error) throw result
      return result
    },
    stepSendChannel: async () => 'whatsapp',
  }
  return { db, whatsappDb, recorded, blocked, released }
}

interface Rede {
  users?: number | 'hang'
  send?: { status: number; body?: string; retryAfter?: string } | 'hang'
}

function redeFalsa(rede: Rede = {}) {
  const chamadas: { url: string; method: string; key: string | null; body: unknown }[] = []
  const fetchFalso: typeof fetch = (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    chamadas.push({
      url,
      method: init?.method ?? 'GET',
      key: headers.get('x-api-key'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const espera = (quando: 'hang') =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      )
    if (url.includes('/users/')) {
      if (rede.users === 'hang') return espera('hang')
      return Promise.resolve(new Response('{}', { status: rede.users ?? 200 }))
    }
    if (rede.send === 'hang') return espera('hang')
    const send = rede.send ?? { status: 200, body: '{}' }
    return Promise.resolve(
      new Response(send.body ?? '{}', {
        status: send.status,
        headers: send.retryAfter ? { 'retry-after': send.retryAfter } : {},
      }),
    )
  }
  return { fetchFalso, chamadas }
}

const semEmail: UnipileMail = {
  getEmail: async () => ({}),
  listThreadEmails: async () => [],
  listEmailSenders: async () => [],
  sendEmail: () => Promise.reject(new Error('esta rodada não envia e-mail')),
}

function executor(due: DueSend[], whatsapp: Record<string, WhatsappReleaseResult | Error>, rede: Rede = {}, options: {
  unipile?: UnipileMail
  semPorta?: boolean
  emails?: Record<string, ReleaseResult>
  sendTimeoutMs?: number
  checkTimeoutMs?: number
} = {}) {
  const { db, whatsappDb, recorded, blocked, released } = bancos(due, whatsapp, options.emails)
  const { fetchFalso, chamadas } = redeFalsa(rede)
  const work: Promise<unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    db,
    unipile: options.unipile ?? semEmail,
    ...(options.semPorta ? {} : {
      whatsapp: {
        db: whatsappDb,
        chat: unipileChatVia(CHAVE, fetchFalso),
        sendTimeoutMs: options.sendTimeoutMs ?? 25,
        checkTimeoutMs: options.checkTimeoutMs ?? 25,
      },
    }),
    waitUntil: (promise) => work.push(promise),
    log: (fields) => logs.push(fields),
  })
  const rodar = async () => {
    const res = await handle(
      new Request('https://functions.test/sequence-runner', { method: 'POST', headers: { 'x-runner-token': TOKEN } }),
    )
    await Promise.all(work)
    return res
  }
  return { rodar, recorded, blocked, released, chamadas, logs }
}

const duoWhatsapp = (sendId: string): DueSend => ({ send_id: sendId, owner_user_id: TITULAR, channel: 'whatsapp' })

Deno.test('passo vencido de WhatsApp: confere o número, abre a conversa e grava o resultado, sem chave na URL', async () => {
  const { rodar, recorded, chamadas, logs } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) })
  const res = await rodar()
  assertEquals(res.status, 202)
  assertEquals(chamadas.map((c) => `${c.method} ${decodeURIComponent(new URL(c.url).pathname)}`), [
    'GET /v2/acc_titular/users/5511987654321@s.whatsapp.net',
    'POST /v2/acc_titular/chats/send',
  ])
  assertEquals(chamadas[1].body, { user_ids: ['5511987654321@s.whatsapp.net'], text: 'Olá, Maria.' })
  for (const chamada of chamadas) {
    assertFalse(chamada.url.includes(CHAVE), 'a chave da API nunca vai na URL')
    assertEquals(chamada.key, CHAVE)
  }
  assertEquals(recorded.length, 1)
  assertEquals(recorded[0].via, 'whatsapp')
  assertEquals(recorded[0].outcome, 'sent')
  assertEquals(recorded[0].providerMessageId, null, 'a Unipile não devolveu id: fica vazio')
  assertEquals(logs, [{ type: 'runner', sendId: WA_1, channel: 'whatsapp', outcome: 'sent' }])
})

Deno.test('E-mail e WhatsApp vencidos na mesma rodada seguem cada um pelo seu caminho, um por vez', async () => {
  const enviados: OutgoingEmail[] = []
  const unipile: UnipileMail = {
    ...semEmail,
    sendEmail: (_conta, email): Promise<EmailSent> => {
      enviados.push(email)
      return Promise.resolve({ id: 'email-1', message_id: null })
    },
  }
  const { rodar, recorded, chamadas, released } = executor(
    [{ send_id: EMAIL_1, owner_user_id: TITULAR }, duoWhatsapp(WA_1)],
    { [WA_1]: whatsappLiberado(WA_1) },
    {},
    { unipile, emails: { [EMAIL_1]: emailLiberado(EMAIL_1) } },
  )
  await rodar()
  assertEquals(released, [`email:${EMAIL_1}`, `whatsapp:${WA_1}`])
  assertEquals(enviados.length, 1)
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded.map((r) => `${r.via}:${r.outcome}`), ['email:sent', 'whatsapp:sent'])
})

Deno.test('com uma conversa gravada o passo envia nela, sem conferir o número', async () => {
  const chat = '5511987654321@s.whatsapp.net'
  const { rodar, chamadas, recorded } = executor([duoWhatsapp(WA_1)], {
    [WA_1]: whatsappLiberado(WA_1, { provider_chat_id: chat }),
  })
  await rodar()
  assertEquals(chamadas.map((c) => `${c.method} ${decodeURIComponent(new URL(c.url).pathname)}`), [
    `POST /v2/acc_titular/chats/${chat}/messages/send`,
  ])
  assertEquals(chamadas[0].body, { text: 'Olá, Maria.' })
  assertEquals(recorded[0].providerChatId, chat)
})

Deno.test('espaçamento: o passo que o banco segura por causa da mesma Conta não chama a Unipile e continua vencido', async () => {
  const { rodar, chamadas, recorded, logs } = executor([duoWhatsapp(WA_1)], {
    [WA_1]: { outcome: 'sender_spacing', send_id: WA_1 },
  })
  await rodar()
  assertEquals(chamadas, [])
  assertEquals(recorded, [], 'nada foi enviado nem falhou: o passo espera a próxima rodada')
  assertEquals(logs, [{ type: 'runner', sendId: WA_1, channel: 'whatsapp', outcome: 'sender_spacing' }])
})

Deno.test('envio automático de WhatsApp desligado: a liberação recusa, nada é enviado nem gravado', async () => {
  const { rodar, chamadas, recorded, logs } = executor([duoWhatsapp(WA_1)], {
    [WA_1]: { outcome: 'automatic_disabled', send_id: WA_1 },
  })
  await rodar()
  assertEquals(chamadas, [])
  assertEquals(recorded, [])
  assertEquals(logs, [{ type: 'runner', sendId: WA_1, channel: 'whatsapp', outcome: 'automatic_disabled' }])
})

Deno.test('o Contato cujo telefone principal perdeu a marca de WhatsApp é recusado pelo banco e nada sai', async () => {
  const { rodar, chamadas, recorded } = executor([duoWhatsapp(WA_1)], {
    [WA_1]: { outcome: 'destination_no_whatsapp', send_id: WA_1 },
  })
  await rodar()
  assertEquals(chamadas, [])
  assertEquals(recorded, [])
})

Deno.test('número sem WhatsApp (404 na conferência): bloqueia, avisa o banco e não envia', async () => {
  const { rodar, chamadas, recorded, blocked, logs } = executor(
    [duoWhatsapp(WA_1)],
    { [WA_1]: whatsappLiberado(WA_1) },
    { users: 404 },
  )
  await rodar()
  assertEquals(chamadas.map((c) => c.method), ['GET'])
  assertEquals(blocked, [[WA_1, 'destination_no_whatsapp']])
  assertEquals(recorded, [])
  assertEquals(logs[0].outcome, 'destination_no_whatsapp')
})

Deno.test('conferência do número com 5xx: não envia e o banco agenda uma nova tentativa', async () => {
  const { rodar, chamadas, recorded } = executor(
    [duoWhatsapp(WA_1)],
    { [WA_1]: whatsappLiberado(WA_1) },
    { users: 503 },
  )
  await rodar()
  assertEquals(chamadas.map((c) => c.method), ['GET'])
  assertEquals(recorded.map((r) => `${r.outcome}:${r.error}`), ['failed:destination_check_failed'])
})

Deno.test('aceito com 2xx sem corpo: vale como enviado e o id da mensagem fica vazio', async () => {
  const { rodar, recorded } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) }, {
    send: { status: 200, body: '' },
  })
  await rodar()
  assertEquals(recorded[0].outcome, 'sent')
  assertEquals(recorded[0].providerMessageId, null)
  assertEquals(recorded[0].providerChatId, '5511987654321@s.whatsapp.net')
})

Deno.test('tempo esgotado no envio é incerto e faz exatamente uma chamada de envio', async () => {
  const { rodar, chamadas, recorded } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) }, {
    send: 'hang',
  })
  await rodar()
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded.map((r) => `${r.outcome}:${r.error}`), ['uncertain:timeout'])
})

Deno.test('429 com Retry-After: falha (nada saiu) com o prazo para o banco, uma só chamada de envio', async () => {
  const { rodar, chamadas, recorded } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) }, {
    send: { status: 429, retryAfter: '45' },
  })
  await rodar()
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded.map((r) => `${r.outcome}:${r.error}:${r.retryAfterSeconds}`), ['failed:rate_limited:45'])
})

Deno.test('4xx no envio (menos o 429) é falha definitiva: sem prazo de nova tentativa, uma só chamada de envio', async () => {
  const { rodar, chamadas, recorded } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) }, {
    send: { status: 400, retryAfter: '45' },
  })
  await rodar()
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded.map((r) => `${r.outcome}:${r.error}:${r.retryAfterSeconds}`), ['failed:http_400:null'])
})

Deno.test('502 no envio é incerto: nunca reenvia sozinho', async () => {
  const { rodar, chamadas, recorded } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) }, {
    send: { status: 502, body: '<html>bad gateway</html>' },
  })
  await rodar()
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded.map((r) => `${r.outcome}:${r.error}`), ['uncertain:http_502'])
})

Deno.test('uma falha isolada não para os outros passos da rodada', async () => {
  const { rodar, recorded, logs } = executor(
    [duoWhatsapp(WA_1), duoWhatsapp(WA_2)],
    { [WA_1]: new Error('banco fora'), [WA_2]: whatsappLiberado(WA_2) },
  )
  await rodar()
  assertEquals(logs[0].outcome, 'release_error')
  assertEquals(recorded.map((r) => `${r.outcome}`), ['sent'])
})

Deno.test('sem o caminho do WhatsApp configurado, o passo é só registrado e não sai por outro canal', async () => {
  const { rodar, chamadas, recorded, released, logs } = executor([duoWhatsapp(WA_1)], {}, {}, { semPorta: true })
  await rodar()
  assertEquals(chamadas, [])
  assertEquals(recorded, [])
  assertEquals(released, [], 'nem a liberação é pedida: o passo continua como estava')
  assertEquals(logs, [{ type: 'runner', sendId: WA_1, channel: 'whatsapp', outcome: 'whatsapp_not_configured' }])
})

Deno.test('um passo sem o canal (banco anterior) segue como E-mail', async () => {
  const enviados: OutgoingEmail[] = []
  const unipile: UnipileMail = {
    ...semEmail,
    sendEmail: (_conta, email): Promise<EmailSent> => {
      enviados.push(email)
      return Promise.resolve({ id: 'email-1', message_id: null })
    },
  }
  const { rodar, chamadas } = executor([{ send_id: EMAIL_1, owner_user_id: TITULAR }], {}, {}, {
    unipile,
    emails: { [EMAIL_1]: emailLiberado(EMAIL_1) },
  })
  await rodar()
  assertEquals(enviados.length, 1)
  assert(chamadas.length === 0, 'o WhatsApp não é tocado')
})

Deno.test('o log da rodada não traz número, texto nem chave', async () => {
  const { rodar, logs } = executor([duoWhatsapp(WA_1)], { [WA_1]: whatsappLiberado(WA_1) })
  await rodar()
  const texto = JSON.stringify(logs)
  for (const segredo of ['5511987654321', 'Olá, Maria', 'Maria Souza', CHAVE]) {
    assertFalse(texto.includes(segredo), segredo)
  }
})
