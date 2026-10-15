// Abrir o fio (slack-canal 03): com exatamente um @Agente que atende no Slack, a função pede ao banco a Execução pelo
// Canal (`start_slack_channel_run`) em nome de quem mencionou, no thread da própria mensagem, e não posta nada: quem
// responde no thread é a entrega, quando a Execução termina. As recusas do banco viram uma resposta curta no thread.
import { assertEquals } from 'jsr:@std/assert@1'
import { type AberturaDoFio, type AgenteDoSlack, createHandler, type PedidoDeFio, RESPOSTAS } from './handler.ts'

const SEGREDO = 'segredo-de-assinatura'
const AGORA = 1_760_000_000
const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ANA = '5d000000-0000-0000-0000-000000000001'

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json' } })

const AGENTES: AgenteDoSlack[] = [
  { id: 'ag-scopus', nome: 'Scopus', noSlack: true },
  { id: 'ag-scopus-latam', nome: 'Scopus · Enterprise LATAM', noSlack: true },
  { id: 'ag-ethos', nome: 'Ethos', noSlack: false },
]

function montar(abertura: (p: PedidoDeFio) => AberturaDoFio = () => ({ kind: 'aberto', conversationId: 'conv-1', runId: 'run-1' })) {
  const c = {
    pedidos: [] as PedidoDeFio[],
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
      contaPorEmail: (_ws, email) => Promise.resolve(email === 'ana@norte.test' ? ANA : null),
      agentes: () => Promise.resolve(AGENTES),
      retirarPeloSlack: () => Promise.resolve(false),
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
        return json({ ok: true, user: { id: 'UANA', team_id: 'T0NORTE', profile: { email: 'ana@norte.test' } } })
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
  const corpo = JSON.stringify({ type: 'event_callback', team_id: 'T0NORTE', event_id: `EvFio${contador}`, event: interno })
  const resposta = await m.handler(
    new Request('https://proj.supabase.co/functions/v1/slack-channel-events', {
      method: 'POST',
      headers: { 'X-Slack-Request-Timestamp': String(AGORA), 'X-Slack-Signature': await assinar(corpo) },
      body: corpo,
    }),
  )
  await Promise.all(m.c.pendentes)
  return { status: resposta.status, eventId: `EvFio${contador}` }
}

const mencao = (texto: string, extra: Record<string, unknown> = {}) => ({
  type: 'app_mention',
  user: 'UANA',
  text: `<@U0BOT> ${texto}`,
  ts: '1700000000.000100',
  channel: 'C0GERAL',
  ...extra,
})
const noDm = (texto: string, extra: Record<string, unknown> = {}) => ({
  type: 'message',
  channel_type: 'im',
  user: 'UANA',
  text: texto,
  ts: '1700000000.000300',
  channel: 'D0ANA',
  ...extra,
})

Deno.test('mensagem solta no canal com @Althius e um @Agente abre o fio no ts dela, sem postar', async () => {
  const m = montar()
  const { status, eventId } = await entregar(m, mencao('@Scopus · Enterprise LATAM, quem são as contas quentes?'))
  assertEquals(status, 200)
  assertEquals(m.c.pedidos, [{
    workspaceId: WS,
    userId: ANA,
    agentId: 'ag-scopus-latam',
    teamId: 'T0NORTE',
    canal: 'C0GERAL',
    threadTs: '1700000000.000100',
    texto: '@Scopus · Enterprise LATAM, quem são as contas quentes?',
    eventId,
  }])
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.logs.filter((l) => l.resultado === 'fio_aberto').map((l) => l.runId), ['run-1'])
})

Deno.test('no DM com o bot, sem @Althius, o @Agente também abre o fio no ts da mensagem', async () => {
  const m = montar()
  await entregar(m, noDm('@scopus me ajuda com a Alfa'))
  assertEquals(m.c.pedidos.map((p) => [p.agentId, p.canal, p.threadTs, p.texto]), [
    ['ag-scopus', 'D0ANA', '1700000000.000300', '@scopus me ajuda com a Alfa'],
  ])
  assertEquals(m.c.postagens, [])
})

Deno.test('no DM, cada mensagem solta abre o seu fio, no ts dela', async () => {
  const m = montar()
  await entregar(m, noDm('@Scopus primeira', { ts: '1700000001.000100' }))
  await entregar(m, noDm('@Scopus segunda', { ts: '1700000002.000100' }))
  assertEquals(m.c.pedidos.map((p) => p.threadTs), ['1700000001.000100', '1700000002.000100'])
})

Deno.test('o mesmo event_id reenviado pelo Slack não pede outra Execução', async () => {
  const m = montar()
  const corpo = JSON.stringify({ type: 'event_callback', team_id: 'T0NORTE', event_id: 'EvRepetido', event: mencao('@Scopus oi') })
  const pedir = async () =>
    m.handler(
      new Request('https://proj.supabase.co/functions/v1/slack-channel-events', {
        method: 'POST',
        headers: { 'X-Slack-Request-Timestamp': String(AGORA), 'X-Slack-Signature': await assinar(corpo) },
        body: corpo,
      }),
    )
  await pedir()
  await pedir()
  await Promise.all(m.c.pendentes)
  assertEquals(m.c.pedidos.map((p) => p.eventId), ['EvRepetido'])
})

Deno.test('as recusas do banco viram uma resposta curta no thread, sem inventar resposta', async () => {
  const casos: [AberturaDoFio, string][] = [
    [{ kind: 'recusado', motivo: 'ocupado' }, RESPOSTAS.aindaRespondendo],
    [{ kind: 'recusado', motivo: 'sem_contrato' }, RESPOSTAS.semContrato],
    [{ kind: 'recusado', motivo: 'nao_reconhecido' }, RESPOSTAS.naoReconhecido],
    [{ kind: 'recusado', motivo: 'nao_atende_no_slack' }, RESPOSTAS.naoAtendeNoSlack('Scopus')],
    [{ kind: 'recusado', motivo: 'fio_de_outra_pessoa' }, RESPOSTAS.fioDeOutraPessoa],
    [{ kind: 'recusado', motivo: 'fio_de_outro_agente' }, RESPOSTAS.fioDeOutroAgente],
    [{ kind: 'recusado', motivo: 'indisponivel' }, RESPOSTAS.indisponivel],
  ]
  for (const [abertura, texto] of casos) {
    const m = montar(() => abertura)
    await entregar(m, mencao('@Scopus oi'))
    assertEquals(m.c.postagens, [{ canal: 'C0GERAL', thread_ts: '1700000000.000100', text: texto }])
  }
})

Deno.test('Canal retirado entre a mensagem e o pedido: nada é postado', async () => {
  const m = montar(() => ({ kind: 'recusado', motivo: 'sem_instalacao' }))
  await entregar(m, mencao('@Scopus oi'))
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.logs.filter((l) => l.resultado === 'sem_instalacao').length, 1)
})

Deno.test('texto longo demais recebe o aviso e não chega ao banco', async () => {
  const m = montar()
  await entregar(m, mencao(`@Scopus ${'a'.repeat(4000)}`))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.longoDemais])
})

Deno.test('o log da abertura não traz o texto da pessoa', async () => {
  const m = montar()
  await entregar(m, mencao('@Scopus segredo comercial'))
  assertEquals(JSON.stringify(m.c.logs).includes('segredo comercial'), false)
})
