// O envio de um passo de WhatsApp pedido pelo titular (canais-06, parte 1): o canal do Envio decide o caminho, e o de
// WhatsApp usa o núcleo do WhatsApp, com a Unipile falsa na camada de rede.
import { assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1'
import { unipileChatVia } from '../_shared/send-step-adapters.ts'
import type { ReleasedWhatsappSend, WhatsappPort, WhatsappReleaseResult } from '../_shared/send-whatsapp.ts'
import { createHandler, type Db, type ReleaseResult, type UnipileMail } from './handler.ts'

const WORKSPACE = '51000000-0000-0000-0000-000000000001'
const SEND = '60000000-0000-0000-0000-000000000001'
const TITULAR = '50000000-0000-0000-0000-000000000001'
const CHAVE = 'chave-secreta-da-api-9f8e7d'

const LIBERADO: ReleasedWhatsappSend = {
  outcome: 'released',
  send_id: SEND,
  unipile_account_id: 'acc_titular',
  destination: '+5511987654321',
  contact_name: 'Maria Souza',
  body: 'Olá, Maria.',
  provider_chat_id: null,
}

const EMAIL_LIBERADO: ReleaseResult = {
  outcome: 'released',
  send_id: SEND,
  unipile_account_id: 'unipile-google-1',
  destination: 'maria@empresa-alvo.test',
  contact_name: 'Maria Souza',
  subject: 'Apresentação',
  body: 'Olá, Maria.',
  reply_to_message_id: null,
  tracking_header_name: 'X-Althius-Envio',
  tracking_header_value: SEND,
}

interface Opcoes {
  canal?: string | null | Error
  liberacao?: WhatsappReleaseResult | Error
  emailLiberacao?: ReleaseResult | Error
  membro?: boolean
  users?: number | 'hang'
  send?: { status: number; body?: string; retryAfter?: string } | 'hang'
}

function montar(opcoes: Opcoes = {}) {
  const recorded: Record<string, unknown>[] = []
  const emailsRecorded: unknown[] = []
  const liberacoes: string[] = []
  const chamadas: { url: string; method: string }[] = []
  let emailsEnviados = 0

  const db: Db = {
    userFromJwt: async () => ({ userId: TITULAR }),
    hasActiveMembership: async () => opcoes.membro ?? true,
    conversationForSend: async () => null,
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    releaseStepSend: async () => {
      liberacoes.push('email')
      const r = opcoes.emailLiberacao ?? { outcome: 'wrong_channel', send_id: SEND }
      if (r instanceof Error) throw r
      return r as ReleaseResult
    },
    recordStepSendResult: async (input) => {
      emailsRecorded.push(input)
    },
  }
  const unipile: UnipileMail = {
    getEmail: async () => ({}),
    listThreadEmails: async () => [],
    listEmailSenders: async () => [],
    sendEmail: async () => {
      emailsEnviados++
      return { id: 'e1', message_id: null }
    },
  }
  const fetchFalso: typeof fetch = (input, init) => {
    const url = String(input)
    chamadas.push({ url, method: init?.method ?? 'GET' })
    const espera = () =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      )
    if (url.includes('/users/')) {
      return opcoes.users === 'hang' ? espera() : Promise.resolve(new Response('{}', { status: opcoes.users ?? 200 }))
    }
    if (opcoes.send === 'hang') return espera()
    const send = opcoes.send ?? { status: 200, body: '{}' }
    return Promise.resolve(
      new Response(send.body ?? '{}', {
        status: send.status,
        headers: send.retryAfter ? { 'retry-after': send.retryAfter } : {},
      }),
    )
  }
  const whatsapp: WhatsappPort = {
    chat: unipileChatVia(CHAVE, fetchFalso),
    sendTimeoutMs: 25,
    checkTimeoutMs: 25,
    db: {
      recordStepSendResult: async (input) => {
        recorded.push(input as unknown as Record<string, unknown>)
      },
      blockStep: async () => {},
      releaseSend: async (sendId, userId) => {
        liberacoes.push(`whatsapp:${sendId}:${userId}`)
        const r = opcoes.liberacao ?? LIBERADO
        if (r instanceof Error) throw r
        return r
      },
      releaseDueSend: async () => {
        throw new Error('o titular não usa a liberação do Executor')
      },
      stepSendChannel: async () => {
        const canal = opcoes.canal === undefined ? 'whatsapp' : opcoes.canal
        if (canal instanceof Error) throw canal
        return canal
      },
    },
  }
  const handle = createHandler({ db, unipile, whatsapp, appOrigin: 'https://app.test' })
  return { handle, recorded, emailsRecorded, liberacoes, chamadas, emailsEnviados: () => emailsEnviados }
}

const pedido = (sendId = SEND) =>
  new Request('https://functions.test/sequence-step-sends', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer jwt', apikey: 'anon' },
    body: JSON.stringify({ action: 'send', workspaceId: WORKSPACE, sendId }),
  })

Deno.test('passo de WhatsApp: o titular envia pelo caminho do WhatsApp, e o E-mail não é tocado', async () => {
  const { handle, recorded, liberacoes, chamadas, emailsEnviados } = montar()
  const res = await handle(pedido())
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { outcome: 'sent', sendId: SEND })
  assertEquals(liberacoes, [`whatsapp:${SEND}:${TITULAR}`])
  assertEquals(chamadas.map((c) => c.method), ['GET', 'POST'])
  for (const chamada of chamadas) assertFalse(chamada.url.includes(CHAVE), 'a chave da API nunca vai na URL')
  assertEquals(recorded.length, 1)
  assertEquals(recorded[0].outcome, 'sent')
  assertEquals(emailsEnviados(), 0)
})

Deno.test('os bloqueios do banco chegam com texto de WhatsApp e não chamam a Unipile', async () => {
  const casos: [WhatsappReleaseResult['outcome'], string][] = [
    ['sender_not_ready', 'WhatsApp'],
    ['destination_changed', 'número'],
    ['sender_spacing', 'poucos segundos'],
    ['destination_no_whatsapp', 'Este número não tem WhatsApp'],
    ['owner_not_responsible', 'Vendedor responsável'],
    ['reconcile_required', 'Confira no seu WhatsApp'],
    ['automatic_disabled', 'envio automático de WhatsApp está desligado'],
  ]
  for (const [outcome, trecho] of casos) {
    const { handle, chamadas, recorded } = montar({ liberacao: { outcome, send_id: SEND } as WhatsappReleaseResult })
    const res = await handle(pedido())
    assertEquals(res.status, 409, outcome)
    const corpo = await res.json()
    assertEquals(corpo.outcome, outcome)
    assertStringIncludes(corpo.message, trecho)
    assertEquals(chamadas, [], outcome)
    assertEquals(recorded, [], outcome)
  }
})

Deno.test('número sem WhatsApp: 409 com a mensagem, sem envio', async () => {
  const { handle, chamadas } = montar({ users: 404 })
  const res = await handle(pedido())
  assertEquals(res.status, 409)
  assertEquals((await res.json()).outcome, 'destination_no_whatsapp')
  assertEquals(chamadas.map((c) => c.method), ['GET'])
})

Deno.test('conferência do número fora do ar: 409 destination_check_failed, sem envio', async () => {
  const { handle, chamadas, recorded } = montar({ users: 503 })
  const res = await handle(pedido())
  assertEquals(res.status, 409)
  assertEquals((await res.json()).outcome, 'destination_check_failed')
  assertEquals(chamadas.map((c) => c.method), ['GET'])
  assertEquals(recorded.map((r) => r.error), ['destination_check_failed'])
})

Deno.test('a Unipile recusa (403): 502, falha definitiva e nova tentativa só quando o titular reconfirmar', async () => {
  const { handle, chamadas, recorded } = montar({ send: { status: 403, retryAfter: '30' } })
  const res = await handle(pedido())
  assertEquals(res.status, 502)
  assertEquals((await res.json()).outcome, 'failed')
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded.map((r) => `${r.outcome}:${r.error}:${r.retryAfterSeconds}`), ['failed:http_403:null'])
})

Deno.test('tempo esgotado no envio: 504 incerto, uma só chamada de envio e a orientação de conferir no WhatsApp', async () => {
  const { handle, chamadas, recorded } = montar({ send: 'hang' })
  const res = await handle(pedido())
  assertEquals(res.status, 504)
  const corpo = await res.json()
  assertEquals(corpo.outcome, 'uncertain')
  assertStringIncludes(corpo.message, 'Confira no seu WhatsApp')
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded[0].outcome, 'uncertain')
})

Deno.test('429: falha com o Retry-After gravado, uma só chamada de envio', async () => {
  const { handle, chamadas, recorded } = montar({ send: { status: 429, retryAfter: '60' } })
  const res = await handle(pedido())
  assertEquals(res.status, 502)
  assertEquals(chamadas.filter((c) => c.method === 'POST').length, 1)
  assertEquals(recorded[0].retryAfterSeconds, 60)
})

Deno.test('um Envio de E-mail segue pelo caminho do E-mail, mesmo com o WhatsApp configurado', async () => {
  const { handle, liberacoes, chamadas, emailsEnviados } = montar({ canal: 'email', emailLiberacao: EMAIL_LIBERADO })
  const res = await handle(pedido())
  assertEquals(res.status, 200)
  assertEquals(liberacoes, ['email'])
  assertEquals(emailsEnviados(), 1)
  assertEquals(chamadas, [])
})

Deno.test('sem conseguir saber o canal, o envio segue pelo E-mail e o banco recusa o que não é E-mail', async () => {
  for (const canal of [new Error('rpc fora do ar'), null]) {
    const { handle, liberacoes, chamadas, emailsEnviados } = montar({ canal })
    const res = await handle(pedido())
    assertEquals(res.status, 409)
    assertEquals((await res.json()).outcome, 'wrong_channel')
    assertEquals(liberacoes, ['email'])
    assertEquals(emailsEnviados(), 0)
    assertEquals(chamadas, [])
  }
})

Deno.test('envio inexistente no caminho do WhatsApp: 404', async () => {
  const { handle, chamadas } = montar({ liberacao: Object.assign(new Error('nf'), { code: 'P0002' }) })
  const res = await handle(pedido())
  assertEquals(res.status, 404)
  assertEquals(chamadas, [])
})

Deno.test('sem sessão ou sem Participação ativa, nada é liberado nem enviado', async () => {
  const sem = montar({ membro: false })
  assertEquals((await sem.handle(pedido())).status, 403)
  assertEquals(sem.liberacoes, [])
  assertEquals(sem.chamadas, [])

  const anonimo = montar()
  const res = await anonimo.handle(
    new Request('https://functions.test/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'send', workspaceId: WORKSPACE, sendId: SEND }),
    }),
  )
  assertEquals(res.status, 401)
  assertEquals(anonimo.liberacoes, [])
  assertEquals(anonimo.chamadas, [])
})
