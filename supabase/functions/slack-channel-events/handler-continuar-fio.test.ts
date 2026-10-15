// Continuar o fio (slack-canal 04): dentro de um thread que já é um fio, o dono continua a Conversa com o Agente do fio
// sem novo @ (Q19); outra pessoa recebe "este fio é a Conversa de <dono>" (Q13); o dono que menciona outro Agente recebe
// "este fio é do Agente <X>" (Q20); com uma Execução aberta no fio, "ainda respondendo". As recusas não pedem Execução.
// Mensagem de canal fora de fio e sem menção ao bot é ignorada sem resposta.
import { assertEquals } from 'jsr:@std/assert@1'
import { type AberturaDoFio, type AgenteDoSlack, createHandler, type FioDoSlack, type PedidoDeFio, RESPOSTAS } from './handler.ts'

const SEGREDO = 'segredo-de-assinatura'
const AGORA = 1_760_000_000
const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ANA = '5d000000-0000-0000-0000-000000000001'
const BIA = '5d000000-0000-0000-0000-000000000002'

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json' } })

const AGENTES: AgenteDoSlack[] = [
  { id: 'ag-scopus', nome: 'Scopus', noSlack: true },
  { id: 'ag-rhetor', nome: 'Rhetor', noSlack: true },
  { id: 'ag-ethos', nome: 'Ethos', noSlack: false },
]

/** Os fios já abertos, pela chave canal + thread_ts. */
const FIOS: Record<string, FioDoSlack> = {
  'C0GERAL|1700000000.000100': { donoId: ANA, donoNome: 'Ana Souza', agenteId: 'ag-scopus', agenteNome: 'Scopus' },
  'D0ANA|1700000000.000300': { donoId: ANA, donoNome: 'Ana Souza', agenteId: 'ag-rhetor', agenteNome: 'Rhetor' },
  'C0GERAL|1700000000.000500': { donoId: ANA, donoNome: null, agenteId: 'ag-scopus', agenteNome: 'Scopus' },
}

/** Um thread cuja leitura do fio falha no banco. */
const FIO_QUE_FALHA = '1700000000.000999'

const EMAILS: Record<string, string> = { UANA: 'ana@norte.test', UBIA: 'bia@norte.test' }
const CONTAS: Record<string, string> = { 'ana@norte.test': ANA, 'bia@norte.test': BIA }

function montar(abertura: (p: PedidoDeFio) => AberturaDoFio = () => ({ kind: 'aberto', conversationId: 'conv-1', runId: 'run-2' })) {
  const c = {
    pedidos: [] as PedidoDeFio[],
    leiturasDeFio: [] as string[],
    leiturasDeUsuario: [] as string[],
    postagens: [] as { canal: string; thread_ts: string; text: string }[],
    logs: [] as Record<string, unknown>[],
    pendentes: [] as Promise<unknown>[],
  }
  const reservas = new Set<string>()
  const handler = createHandler({
    db: {
      reservarEvento: (eventId) => Promise.resolve(!reservas.has(eventId) && !!reservas.add(eventId)),
      instalacaoAtiva: (teamId) =>
        Promise.resolve(teamId === 'T0NORTE' ? { workspaceId: WS, botUserId: 'U0BOT', token: 'xoxb-norte' } : null),
      contaPorEmail: (_ws, email) => Promise.resolve(CONTAS[email] ?? null),
      agentes: () => Promise.resolve(AGENTES),
      retirarPeloSlack: () => Promise.resolve(false),
      lerFio: (fio) => {
        c.leiturasDeFio.push(`${fio.workspaceId}|${fio.teamId}|${fio.canal}|${fio.threadTs}`)
        if (fio.threadTs === FIO_QUE_FALHA) return Promise.reject(new Error('banco fora do ar'))
        return Promise.resolve(FIOS[`${fio.canal}|${fio.threadTs}`] ?? null)
      },
      abrirFio: (pedido) => {
        c.pedidos.push(pedido)
        return Promise.resolve(abertura(pedido))
      },
    },
    segredoDeAssinatura: SEGREDO,
    agora: () => AGORA,
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
      const req = new Request(entrada, init)
      if (req.url === 'https://slack.com/api/users.info') {
        const usuario = new URLSearchParams(await req.text()).get('user') ?? ''
        c.leiturasDeUsuario.push(usuario)
        return json({ ok: true, user: { id: usuario, team_id: 'T0NORTE', profile: { email: EMAILS[usuario] } } })
      }
      const corpo = await req.json()
      c.postagens.push({ canal: corpo.channel, thread_ts: corpo.thread_ts, text: corpo.text })
      return json({ ok: true, ts: '1.2' })
    }) as typeof fetch,
    esperarDepois: (trabalho) => {
      c.pendentes.push(trabalho)
    },
    log: (campos) => c.logs.push(campos),
  })
  return { c, handler }
}

async function assinar(corpo: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`v0:${AGORA}:${corpo}`)))
  return `v0=${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

let contador = 0
async function entregar(m: ReturnType<typeof montar>, interno: Record<string, unknown>) {
  contador += 1
  const eventId = `EvCont${contador}`
  const corpo = JSON.stringify({ type: 'event_callback', team_id: 'T0NORTE', event_id: eventId, event: interno })
  const resposta = await m.handler(
    new Request('https://proj.supabase.co/functions/v1/slack-channel-events', {
      method: 'POST',
      headers: { 'X-Slack-Request-Timestamp': String(AGORA), 'X-Slack-Signature': await assinar(corpo) },
      body: corpo,
    }),
  )
  await Promise.all(m.c.pendentes)
  return { status: resposta.status, eventId }
}

/** Uma resposta no thread de um canal, sem menção ao bot (`message.channels`). */
const noThreadDoCanal = (texto: string, extra: Record<string, unknown> = {}) => ({
  type: 'message',
  channel_type: 'channel',
  user: 'UANA',
  text: texto,
  ts: '1700000000.000900',
  thread_ts: '1700000000.000100',
  channel: 'C0GERAL',
  ...extra,
})
/** Uma resposta no thread do DM com o bot (`message.im`). */
const noThreadDoDm = (texto: string, extra: Record<string, unknown> = {}) => ({
  type: 'message',
  channel_type: 'im',
  user: 'UANA',
  text: texto,
  ts: '1700000000.000901',
  thread_ts: '1700000000.000300',
  channel: 'D0ANA',
  ...extra,
})
/** Uma menção ao bot dentro do thread de um canal (`app_mention`). */
const mencaoNoThread = (texto: string, extra: Record<string, unknown> = {}) => ({
  type: 'app_mention',
  user: 'UANA',
  text: `<@U0BOT> ${texto}`,
  ts: '1700000000.000902',
  thread_ts: '1700000000.000100',
  channel: 'C0GERAL',
  ...extra,
})

Deno.test('no thread de canal, o dono continua sem @ e o pedido vai ao Agente do fio, no mesmo thread', async () => {
  const m = montar()
  const { eventId } = await entregar(m, noThreadDoCanal('e a segunda delas?'))
  assertEquals(m.c.pedidos, [{
    workspaceId: WS,
    userId: ANA,
    agentId: 'ag-scopus',
    teamId: 'T0NORTE',
    canal: 'C0GERAL',
    threadTs: '1700000000.000100',
    texto: 'e a segunda delas?',
    eventId,
  }])
  assertEquals(m.c.leiturasDeFio, [`${WS}|T0NORTE|C0GERAL|1700000000.000100`])
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.logs.filter((l) => l.resultado === 'fio_continuado').map((l) => l.runId), ['run-2'])
})

Deno.test('no thread do DM, o dono também continua sem @ com o Agente do fio', async () => {
  const m = montar()
  await entregar(m, noThreadDoDm('e quanto ao follow-up?'))
  assertEquals(m.c.pedidos.map((p) => [p.agentId, p.canal, p.threadTs, p.texto]), [
    ['ag-rhetor', 'D0ANA', '1700000000.000300', 'e quanto ao follow-up?'],
  ])
  assertEquals(m.c.postagens, [])
})

Deno.test('o dono que menciona o bot no fio, ou o próprio Agente do fio, continua a mesma Conversa', async () => {
  const m = montar()
  await entregar(m, mencaoNoThread('continua, por favor'))
  await entregar(m, noThreadDoCanal('@Scopus e a terceira?'))
  assertEquals(m.c.pedidos.map((p) => [p.agentId, p.threadTs, p.texto]), [
    ['ag-scopus', '1700000000.000100', 'continua, por favor'],
    ['ag-scopus', '1700000000.000100', '@Scopus e a terceira?'],
  ])
  assertEquals(m.c.postagens, [])
})

Deno.test('outra pessoa no thread recebe a recusa com o nome do dono e a dica de abrir o próprio fio', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('posso perguntar também?', { user: 'UBIA' }))
  await entregar(m, mencaoNoThread('@Scopus e eu?', { user: 'UBIA' }))
  assertEquals(m.c.pedidos, [])
  const recusa = RESPOSTAS.fioDaConversaDe('Ana Souza')
  assertEquals(recusa.includes('Ana Souza') && recusa.includes('outro thread') && recusa.includes('DM'), true)
  assertEquals(m.c.postagens, [
    { canal: 'C0GERAL', thread_ts: '1700000000.000100', text: recusa },
    { canal: 'C0GERAL', thread_ts: '1700000000.000100', text: recusa },
  ])
})

Deno.test('dono sem nome na Althius: a recusa a outra pessoa não mostra e-mail', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('oi', { user: 'UBIA', thread_ts: '1700000000.000500' }))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.fioDeOutraPessoa])
  assertEquals(JSON.stringify(m.c.postagens).includes('@norte.test'), false)
})

Deno.test('o dono que menciona outro Agente no fio recebe a recusa com o nome do Agente do fio', async () => {
  const m = montar()
  await entregar(m, mencaoNoThread('@Rhetor me ajuda aqui'))
  await entregar(m, noThreadDoCanal('@Rhetor e você?'))
  await entregar(m, noThreadDoCanal('@Scopus e @Rhetor, juntos?'))
  await entregar(m, noThreadDoCanal('@Ethos oi'))
  assertEquals(m.c.pedidos, [])
  const recusa = RESPOSTAS.fioDoAgente('Scopus')
  assertEquals(recusa.includes('Scopus') && recusa.includes('outro thread'), true)
  assertEquals(m.c.postagens.map((p) => [p.thread_ts, p.text]), Array(4).fill(['1700000000.000100', recusa]))
})

Deno.test('com uma Execução aberta no fio, a mensagem recebe "ainda respondendo" no thread', async () => {
  const m = montar(() => ({ kind: 'recusado', motivo: 'ocupado' }))
  await entregar(m, noThreadDoCanal('mais uma coisa'))
  assertEquals(m.c.pedidos.length, 1)
  assertEquals(m.c.postagens, [{ canal: 'C0GERAL', thread_ts: '1700000000.000100', text: RESPOSTAS.aindaRespondendo }])
})

Deno.test('mensagem de canal fora de fio e sem menção ao bot é ignorada sem resposta nem leitura de quem escreveu', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('outro assunto', { thread_ts: '1700000000.000777' }))
  await entregar(m, noThreadDoCanal('@Scopus oi', { thread_ts: undefined }))
  assertEquals(m.c.leiturasDeFio, [`${WS}|T0NORTE|C0GERAL|1700000000.000777`], 'a mensagem solta nem procura fio')
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.leiturasDeUsuario, [])
})

Deno.test('a cópia em message.channels de uma menção ao bot é ignorada: quem trata é o app_mention', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('<@U0BOT> continua'))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.leiturasDeUsuario, [])
})

Deno.test('no fio, só arquivo recebe "só leio texto"; edição e mensagem de bot são ignoradas', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('', { subtype: 'file_share', files: [{ id: 'F1' }] }))
  await entregar(m, noThreadDoCanal('editado', { edited: { ts: '1.1' } }))
  await entregar(m, noThreadDoCanal('sou um bot', { bot_id: 'B1' }))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.soTexto])
})

Deno.test('no fio, texto longo demais recebe o aviso e não chega ao banco', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('a'.repeat(4001)))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.longoDemais])
})

Deno.test('no thread do DM que não é fio, uma mensagem com @Agente abre um fio nele, como antes', async () => {
  const m = montar()
  await entregar(m, noThreadDoDm('@Scopus oi', { thread_ts: '1700000000.000444' }))
  assertEquals(m.c.pedidos.map((p) => [p.agentId, p.threadTs]), [['ag-scopus', '1700000000.000444']])
})

Deno.test('o log da continuação e das recusas não traz o texto nem o nome do dono', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('segredo comercial'))
  await entregar(m, noThreadDoCanal('segredo da Bia', { user: 'UBIA' }))
  const logs = JSON.stringify(m.c.logs)
  assertEquals(logs.includes('segredo'), false)
  assertEquals(logs.includes('Ana Souza'), false)
})

Deno.test('se a leitura do fio falha, a menção recebe "tente de novo" no thread e a falha fica no log', async () => {
  const m = montar()
  await entregar(m, mencaoNoThread('continua', { thread_ts: FIO_QUE_FALHA }))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => [p.thread_ts, p.text]), [[FIO_QUE_FALHA, RESPOSTAS.indisponivel]])
  assertEquals(m.c.logs.map((l) => l.resultado), ['falha_ao_ler_fio', 'indisponivel'])
})

Deno.test('se a leitura do fio falha numa resposta de canal sem menção, nada é postado, mas a falha fica no log', async () => {
  const m = montar()
  await entregar(m, noThreadDoCanal('continua', { thread_ts: FIO_QUE_FALHA }))
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.logs.map((l) => l.resultado), ['falha_ao_ler_fio'])
})

Deno.test('o dono removido do Workspace no meio do fio é recusado como não reconhecido, sem pedir Execução', async () => {
  const m = montar()
  const conta = CONTAS['ana@norte.test']
  delete CONTAS['ana@norte.test']
  try {
    await entregar(m, noThreadDoCanal('e a terceira?'))
  } finally {
    CONTAS['ana@norte.test'] = conta
  }
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => [p.thread_ts, p.text]), [['1700000000.000100', RESPOSTAS.naoReconhecido]])
  assertEquals(m.c.logs.map((l) => l.resultado), ['nao_reconhecido'])
})

Deno.test('o dono removido entre a leitura e o pedido: o banco recusa e o thread recebe "não reconheci"', async () => {
  const m = montar(() => ({ kind: 'recusado', motivo: 'nao_reconhecido' }))
  await entregar(m, noThreadDoCanal('e a terceira?'))
  assertEquals(m.c.pedidos.length, 1)
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.naoReconhecido])
  assertEquals(m.c.logs.map((l) => l.resultado), ['nao_reconhecido'])
})
