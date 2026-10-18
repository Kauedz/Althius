// Limite de uso do Canal (slack-canal 08): passou do limite da pessoa ou do Workspace, o thread recebe uma recusa curta e
// nenhuma Execução é pedida. Se a leitura do limite falhar, o pedido segue e a falha fica no log.
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

function montar(
  limite: () => Promise<'ok' | 'pessoa' | 'workspace'>,
  abertura: (p: PedidoDeFio) => AberturaDoFio = () => ({ kind: 'aberto', conversationId: 'conv-1', runId: 'run-2' }),
) {
  const c = {
    pedidos: [] as PedidoDeFio[],
    leiturasDeFio: [] as string[],
    leiturasDeUsuario: [] as string[],
    postagens: [] as { canal: string; thread_ts: string; text: string }[],
    logs: [] as Record<string, unknown>[],
    pendentes: [] as Promise<unknown>[],
    limites: [] as string[],
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
      limiteDeUso: (ws, user) => {
        c.limites.push(`${ws}|${user}`)
        return limite()
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
  const eventId = `EvLim${contador}`
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


const mencaoNova = (texto: string) => ({
  type: 'app_mention',
  user: 'UANA',
  text: `<@U0BOT> ${texto}`,
  ts: '1700000001.000100',
  channel: 'C0GERAL',
})

Deno.test('dentro do limite, o fio abre e o limite é lido para quem pediu, no Workspace dele', async () => {
  const m = montar(() => Promise.resolve('ok'))
  await entregar(m, mencaoNova('@Scopus quais contas estão quentes?'))
  assertEquals(m.c.limites, [`${WS}|${ANA}`])
  assertEquals(m.c.pedidos.length, 1)
  assertEquals(m.c.postagens, [])
})

Deno.test('a pessoa que passou do limite recebe a recusa no thread, sem Execução', async () => {
  const m = montar(() => Promise.resolve('pessoa'))
  await entregar(m, mencaoNova('@Scopus quais contas estão quentes?'))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => [p.thread_ts, p.text]), [['1700000001.000100', RESPOSTAS.limiteDaPessoa]])
  assertEquals(m.c.logs.map((l) => l.resultado), ['limite_da_pessoa'])
})

Deno.test('o Workspace que passou do limite recusa também a continuação do fio, sem Execução', async () => {
  const m = montar(() => Promise.resolve('workspace'))
  await entregar(m, noThreadDoCanal('e a segunda delas?'))
  assertEquals(m.c.pedidos, [])
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.limiteDoWorkspace])
  assertEquals(m.c.logs.map((l) => l.resultado), ['limite_do_workspace'])
})

Deno.test('se a leitura do limite falhar, o pedido segue e a falha fica no log', async () => {
  const m = montar(() => Promise.reject(new Error('banco fora do ar')))
  await entregar(m, mencaoNova('@Scopus quais contas estão quentes?'))
  assertEquals(m.c.pedidos.length, 1)
  assertEquals(m.c.logs.map((l) => l.resultado), ['falha_ao_ler_limite', 'fio_aberto'])
})

Deno.test('as recusas do limite não trazem o texto do pedido no log', async () => {
  const m = montar(() => Promise.resolve('pessoa'))
  await entregar(m, mencaoNova('@Scopus segredo comercial'))
  assertEquals(JSON.stringify(m.c.logs).includes('segredo comercial'), false)
})
