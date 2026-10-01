import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type CanalDaResposta,
  type EnviadorDeResposta,
  enviadorDeEmail,
  type LiberacaoDaResposta,
  type MotivoDoBloqueioDaResposta,
  type RespostaLiberada,
} from '../_shared/enviador-de-resposta.ts'
import {
  type Conversation,
  type EmailSent,
  type OutgoingEmail,
  type UnipileMail,
  UnipileRequestError,
  UnipileUnreadableResponse,
} from '../_shared/send-step.ts'
import { createHandler, type Db } from './handler.ts'

const WORKSPACE = '51000000-0000-0000-0000-000000000001'
const PROPOSTA = '70000000-0000-0000-0000-000000000001'
const TITULAR = '50000000-0000-0000-0000-000000000001'

const LIBERADA: RespostaLiberada = {
  outcome: 'released',
  proposal_id: PROPOSTA,
  channel: 'email',
  unipile_account_id: 'unipile-google-1',
  destination: 'maria@empresa-alvo.test',
  contact_name: 'Maria Souza',
  subject: 'Re: Apresentação',
  body: 'Olá, Maria! Para 20 usuários o valor é X.',
  reply_to_message_id: '<msg-r1@empresa-alvo.test>',
  tracking_header_name: 'X-Althius-Resposta',
  tracking_header_value: `${PROPOSTA}:3`,
  revision: 3,
}

interface OpcoesDoBanco {
  member?: boolean
  user?: boolean
  conversa?: Conversation | null
  conversaFalha?: boolean
  /** O desfecho da ingestão por id do e-mail da conversa. */
  ingest?: Record<string, string>
  registroFalha?: boolean
}

/** Um banco em memória com a máquina de estados da proposta: liberada uma vez, depois "enviando" e o resultado. */
function bancoFalso(liberacao: LiberacaoDaResposta | Error, opcoes: OpcoesDoBanco = {}) {
  const chamadas: string[] = []
  const liberacoes: { canais: CanalDaResposta[] }[] = []
  const registros: { proposta: string; outcome: string; error: string | null; providerEmailId?: string | null }[] = []
  const ingeridos: string[] = []
  let estado: 'aprovada' | 'enviando' | 'enviada' | 'incerta' = 'aprovada'
  const db: Db = {
    userFromJwt: async () => (opcoes.user ?? true) ? { userId: TITULAR } : null,
    hasActiveMembership: async () => opcoes.member ?? true,
    conversationForReply: async () => {
      chamadas.push('conversationForReply')
      if (opcoes.conversaFalha) throw new Error('banco')
      return opcoes.conversa ?? null
    },
    ingestEmailEvent: async (input) => {
      ingeridos.push(String(input.email.id))
      return {
        outcome: opcoes.ingest?.[String(input.email.id)] ?? 'unrelated',
        interaction_id: null,
        send_id: null,
        attachments: [],
      }
    },
    releaseApprovedReply: async (_proposta, _usuario, canais) => {
      chamadas.push('releaseApprovedReply')
      liberacoes.push({ canais })
      if (liberacao instanceof Error) throw liberacao
      if (liberacao.outcome !== 'released') return liberacao
      const bloqueio = ({ enviando: 'in_flight', enviada: 'already_sent', incerta: 'reconcile_required' } as const)[
        estado as 'enviando'
      ]
      if (estado !== 'aprovada') {
        return { outcome: bloqueio, proposal_id: PROPOSTA, channel: 'email', revision: 3 }
      }
      estado = 'enviando'
      return liberacao
    },
    recordReplySendResult: async (proposta, resultado) => {
      chamadas.push('recordReplySendResult')
      if (opcoes.registroFalha) throw new Error('banco')
      registros.push({ proposta, outcome: resultado.outcome, error: resultado.error, providerEmailId: resultado.providerEmailId })
      estado = resultado.outcome === 'sent' ? 'enviada' : resultado.outcome === 'failed' ? 'aprovada' : 'incerta'
    },
  }
  return { db, chamadas, liberacoes, registros, ingeridos }
}

interface OpcoesDaUnipile {
  thread?: Record<string, unknown>[] | Error
}

function unipileFalsa(
  comportamento: EmailSent | UnipileRequestError | UnipileUnreadableResponse | Error | 'pendurado',
  opcoes: OpcoesDaUnipile = {},
) {
  const enviados: { accountId: string; email: OutgoingEmail }[] = []
  const unipile: UnipileMail = {
    getEmail: async (_conta, emailId) => ({ id: emailId }),
    listThreadEmails: async () => {
      if (opcoes.thread instanceof Error) throw opcoes.thread
      return opcoes.thread ?? []
    },
    listEmailSenders: async () => ['ana@norte.test'],
    sendEmail: (accountId, email, { signal }) => {
      enviados.push({ accountId, email })
      if (comportamento === 'pendurado') {
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        )
      }
      if (comportamento instanceof Error) return Promise.reject(comportamento)
      return Promise.resolve(comportamento)
    },
  }
  return { unipile, enviados }
}

function montar(
  db: Db,
  unipile: UnipileMail,
  extras: { enviadores?: EnviadorDeResposta[]; sendTimeoutMs?: number } = {},
) {
  return createHandler({
    db,
    unipile,
    enviadores: extras.enviadores ?? [enviadorDeEmail(unipile)],
    appOrigin: 'https://app.test',
    sendTimeoutMs: extras.sendTimeoutMs,
  })
}

function pedido(body: unknown, cabecalhos: Record<string, string> = { Authorization: 'Bearer jwt', apikey: 'anon' }) {
  return new Request('https://functions.test/reply-proposal-send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabecalhos },
    body: JSON.stringify(body),
  })
}

const corpo = { action: 'send', workspaceId: WORKSPACE, proposalId: PROPOSTA }
const ENVIADA: EmailSent = { id: 'email-out-1', message_id: '<out-1@mail.gmail.com>' }

Deno.test('sem o JWT do titular, nada é liberado nem enviado', async () => {
  const { db, chamadas } = bancoFalso(LIBERADA, { user: false })
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const handler = montar(db, unipile)
  assertEquals((await handler(pedido(corpo, {}))).status, 401)
  assertEquals((await handler(pedido(corpo))).status, 401)
  assertEquals((await handler(new Request('https://functions.test/', { method: 'GET' }))).status, 405)
  assertEquals([chamadas, enviados.length], [[], 0])
})

Deno.test('o corpo é conferido: ação, Workspace e proposta', async () => {
  const { db, chamadas } = bancoFalso(LIBERADA)
  const { unipile } = unipileFalsa(ENVIADA)
  const handler = montar(db, unipile)
  assertEquals((await handler(pedido({ ...corpo, action: 'outra' }))).status, 400)
  assertEquals((await handler(pedido({ ...corpo, workspaceId: 'x' }))).status, 400)
  assertEquals((await handler(pedido({ ...corpo, proposalId: 'x' }))).status, 400)
  assertEquals((await handler(new Request('https://functions.test/', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', apikey: 'anon' },
    body: 'não é json',
  }))).status, 400)
  assertEquals(chamadas, [])
})

Deno.test('quem não participa do Workspace é recusado antes de o banco liberar qualquer coisa', async () => {
  const { db, chamadas } = bancoFalso(LIBERADA, { member: false })
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const resposta = await montar(db, unipile)(pedido(corpo))
  assertEquals(resposta.status, 403)
  assertEquals([chamadas, enviados.length], [[], 0])
})

Deno.test('a aprovada é enviada uma vez, na conversa da mensagem de origem, e o resultado é gravado', async () => {
  const { db, registros, liberacoes } = bancoFalso(LIBERADA)
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const resposta = await montar(db, unipile)(pedido(corpo))
  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { outcome: 'sent', proposalId: PROPOSTA })
  assertEquals(enviados.length, 1)
  assertEquals(enviados[0].accountId, 'unipile-google-1')
  assertEquals(enviados[0].email, {
    to: [{ email: 'maria@empresa-alvo.test', display_name: 'Maria Souza' }],
    subject: 'Re: Apresentação',
    plain_text: 'Olá, Maria! Para 20 usuários o valor é X.',
    custom_headers: [{ name: 'X-Althius-Resposta', value: `${PROPOSTA}:3` }],
    reply_to_message_id: '<msg-r1@empresa-alvo.test>',
  })
  assertEquals(registros, [{ proposta: PROPOSTA, outcome: 'sent', error: null, providerEmailId: 'email-out-1' }])
  // O banco só liberou o canal que a função sabe enviar.
  assertEquals(liberacoes, [{ canais: ['email'] }])
})

Deno.test('aprovar e clicar duas vezes (ou repetir a chamada) não duplica o envio', async () => {
  const { db } = bancoFalso(LIBERADA)
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const handler = montar(db, unipile)
  const [a, b] = await Promise.all([handler(pedido(corpo)), Promise.resolve().then(() => handler(pedido(corpo)))])
  const resultados = [await a.json(), await b.json()]
  assertEquals(enviados.length, 1)
  assertEquals(resultados.filter((r) => r.outcome === 'sent').length, 1)
  // Depois de enviada, outra chamada recebe o bloqueio, sem enviar de novo.
  const terceira = await handler(pedido(corpo))
  assertEquals(terceira.status, 409)
  assertEquals((await terceira.json()).outcome, 'already_sent')
  assertEquals(enviados.length, 1)
})

Deno.test('cada bloqueio do banco devolve 409 com o motivo em português e nada é enviado', async () => {
  const motivos: MotivoDoBloqueioDaResposta[] = [
    'owner_not_responsible',
    'in_flight',
    'already_sent',
    'reconcile_required',
    'outdated',
    'not_approved',
    'channel_not_supported',
    'sequence_ended',
    'account_unavailable',
    'sender_not_ready',
    'contact_unlinked',
    'destination_changed',
  ]
  for (const outcome of motivos) {
    const { db, registros } = bancoFalso({ outcome, proposal_id: PROPOSTA, channel: 'email', revision: 3 })
    const { unipile, enviados } = unipileFalsa(ENVIADA)
    const resposta = await montar(db, unipile)(pedido(corpo))
    assertEquals(resposta.status, 409, outcome)
    const dado = await resposta.json()
    assertEquals(dado.outcome, outcome)
    assert(typeof dado.message === 'string' && dado.message.length > 10, outcome)
    assertEquals([enviados.length, registros.length], [0, 0], outcome)
  }
})

Deno.test('o provedor recusou: nada saiu, o resultado é gravado como recusa e a resposta fica para tentar de novo', async () => {
  const { db, registros } = bancoFalso(LIBERADA)
  const { unipile } = unipileFalsa(new UnipileRequestError(502))
  const handler = montar(db, unipile)
  const resposta = await handler(pedido(corpo))
  assertEquals(resposta.status, 502)
  assertEquals((await resposta.json()).outcome, 'failed')
  assertEquals(registros, [{ proposta: PROPOSTA, outcome: 'failed', error: 'HTTP 502', providerEmailId: null }])
  // Como a recusa não deixa dúvida, a mesma revisão pode ser enviada de novo.
  const outra = unipileFalsa(ENVIADA)
  const segunda = await montar(db, outra.unipile)(pedido(corpo))
  assertEquals(segunda.status, 200)
  assertEquals(outra.enviados.length, 1)
})

Deno.test('timeout, falha de rede ou resposta ilegível deixam o envio incerto, e uma incerta não é refeita às cegas', async () => {
  for (
    const [comportamento, erro] of [
      ['pendurado', 'timeout'],
      [new TypeError('rede'), 'network'],
      [new UnipileUnreadableResponse(), 'unreadable_response'],
    ] as const
  ) {
    const { db, registros } = bancoFalso(LIBERADA)
    const { unipile, enviados } = unipileFalsa(comportamento)
    const handler = montar(db, unipile, { sendTimeoutMs: 20 })
    const resposta = await handler(pedido(corpo))
    assertEquals(resposta.status, 504, erro)
    assertEquals((await resposta.json()).outcome, 'uncertain')
    assertEquals(registros.map((r) => [r.outcome, r.error]), [['uncertain', erro]])
    // Repetir o pedido: o banco diz que o último envio está incerto, e a Unipile não é chamada de novo.
    const repetida = await handler(pedido(corpo))
    assertEquals(repetida.status, 409)
    assertEquals((await repetida.json()).outcome, 'reconcile_required')
    assertEquals(enviados.length, 1, erro)
  }
})

Deno.test('se o resultado do envio não pode ser gravado, a tela é avisada da dúvida e nada é reenviado', async () => {
  const { db } = bancoFalso(LIBERADA, { registroFalha: true })
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const handler = montar(db, unipile)
  const resposta = await handler(pedido(corpo))
  assertEquals(resposta.status, 500)
  assertEquals((await resposta.json()).outcome, 'uncertain')
  assertEquals((await handler(pedido(corpo))).status, 409)
  assertEquals(enviados.length, 1)
})

Deno.test('uma proposta que não existe devolve 404, e uma falha do banco ao liberar devolve 500 sem enviar', async () => {
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const naoAchou = bancoFalso(Object.assign(new Error('reply proposal not found'), { code: 'P0002' }))
  assertEquals((await montar(naoAchou.db, unipile)(pedido(corpo))).status, 404)
  const caiu = bancoFalso(new Error('banco fora'))
  assertEquals((await montar(caiu.db, unipile)(pedido(corpo))).status, 500)
  assertEquals(enviados.length, 0)
})

Deno.test('antes de enviar, a conversa é conferida na Unipile: uma mensagem nova barra o envio', async () => {
  const conversa: Conversation = { unipile_account_id: 'unipile-google-1', provider_thread_id: 'thread-1', provider_email_id: null }
  const { db, chamadas, ingeridos } = bancoFalso(LIBERADA, { conversa, ingest: { 'email-novo': 'reply' } })
  const { unipile, enviados } = unipileFalsa(ENVIADA, { thread: [{ id: 'email-novo', thread_id: 'thread-1' }] })
  const resposta = await montar(db, unipile)(pedido(corpo))
  assertEquals(resposta.status, 409)
  assertEquals((await resposta.json()).outcome, 'outdated')
  assertEquals(ingeridos, ['email-novo'])
  // O banco nem foi chamado para liberar, e nada saiu.
  assert(!chamadas.includes('releaseApprovedReply'))
  assertEquals(enviados.length, 0)
})

Deno.test('se a conversa não pode ser conferida, a resposta não sai', async () => {
  const conversa: Conversation = { unipile_account_id: 'unipile-google-1', provider_thread_id: 'thread-1', provider_email_id: null }
  const falhaNaUnipile = bancoFalso(LIBERADA, { conversa })
  const u1 = unipileFalsa(ENVIADA, { thread: new Error('Unipile fora') })
  const a = await montar(falhaNaUnipile.db, u1.unipile)(pedido(corpo))
  assertEquals([a.status, (await a.json()).outcome], [409, 'thread_check_failed'])
  assert(!falhaNaUnipile.chamadas.includes('releaseApprovedReply'))

  const falhaNoBanco = bancoFalso(LIBERADA, { conversaFalha: true })
  const u2 = unipileFalsa(ENVIADA)
  const b = await montar(falhaNoBanco.db, u2.unipile)(pedido(corpo))
  assertEquals([b.status, (await b.json()).outcome], [409, 'thread_check_failed'])
  assertEquals([u1.enviados.length, u2.enviados.length], [0, 0])
})

Deno.test('uma conversa sem mensagem nova segue para o envio', async () => {
  const conversa: Conversation = { unipile_account_id: 'unipile-google-1', provider_thread_id: 'thread-1', provider_email_id: null }
  const { db } = bancoFalso(LIBERADA, { conversa, ingest: { 'email-velho': 'duplicate_email' } })
  const { unipile, enviados } = unipileFalsa(ENVIADA, { thread: [{ id: 'email-velho', thread_id: 'thread-1' }] })
  const resposta = await montar(db, unipile)(pedido(corpo))
  assertEquals(resposta.status, 200)
  assertEquals(enviados.length, 1)
})

Deno.test('o enviador é plugável: um canal novo entra na lista e o banco passa a liberá-lo', async () => {
  const chat: RespostaLiberada = { ...LIBERADA, channel: 'whatsapp', destination: '+5511999990000', subject: null }
  const { db, liberacoes } = bancoFalso(chat)
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const enviadas: RespostaLiberada[] = []
  const whatsapp: EnviadorDeResposta = {
    canal: 'whatsapp',
    enviar: (resposta) => {
      enviadas.push(resposta)
      return Promise.resolve({ outcome: 'sent', providerMessageId: 'wa-1' })
    },
  }
  const resposta = await montar(db, unipile, { enviadores: [enviadorDeEmail(unipile), whatsapp] })(pedido(corpo))
  assertEquals(resposta.status, 200)
  assertEquals(liberacoes, [{ canais: ['email', 'whatsapp'] }])
  assertEquals(enviadas.map((r) => r.destination), ['+5511999990000'])
  // O e-mail não foi usado para uma resposta de WhatsApp.
  assertEquals(enviados.length, 0)
})

Deno.test('um canal sem enviador nunca é enviado pelo e-mail: o banco recusa e a resposta fica como está', async () => {
  const { db, registros } = bancoFalso({ outcome: 'channel_not_supported', proposal_id: PROPOSTA, channel: 'linkedin', revision: 3 })
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const resposta = await montar(db, unipile)(pedido(corpo))
  assertEquals(resposta.status, 409)
  assertEquals((await resposta.json()).outcome, 'channel_not_supported')
  assertEquals([enviados.length, registros.length], [0, 0])
})

Deno.test('se o banco liberar um canal sem enviador (não deveria), nada é enviado e a proposta volta a aprovada', async () => {
  const chat: RespostaLiberada = { ...LIBERADA, channel: 'linkedin' }
  const { db, registros } = bancoFalso(chat)
  const { unipile, enviados } = unipileFalsa(ENVIADA)
  const resposta = await montar(db, unipile)(pedido(corpo))
  assertEquals(resposta.status, 502)
  assertEquals(enviados.length, 0)
  assertEquals(registros.map((r) => [r.outcome, r.error]), [['failed', 'channel_not_supported']])
})

Deno.test('a função só libera, envia e grava: não toca na Sequência', async () => {
  const { db, chamadas } = bancoFalso(LIBERADA)
  const { unipile } = unipileFalsa(ENVIADA)
  await montar(db, unipile)(pedido(corpo))
  assertEquals(chamadas, ['conversationForReply', 'releaseApprovedReply', 'recordReplySendResult'])
})

Deno.test('o preflight de CORS responde, e a mensagem do bloqueio fala português', async () => {
  const { db } = bancoFalso({ outcome: 'outdated', proposal_id: PROPOSTA, channel: 'email', revision: 3 })
  const { unipile } = unipileFalsa(ENVIADA)
  const handler = montar(db, unipile)
  const preflight = await handler(new Request('https://functions.test/', { method: 'OPTIONS', headers: { Origin: 'https://app.test' } }))
  assertEquals(preflight.status, 200)
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), 'https://app.test')
  const dado = await (await handler(pedido(corpo))).json()
  assertStringIncludes(dado.message, 'Chegou outra mensagem')
})
