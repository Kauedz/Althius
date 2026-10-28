// Fase 7: com HERMES_CANAL_PELO_AGENTE=true, o pedido que chega pelo Slack ou pelo WhatsApp vai para o agente único no
// app. O worker não chama o Hermes nem os Agentes: responde no Canal com o link do pedido, e a pessoa confere e envia na
// `/`, com a sessão dela (a aprovação pelo link). Sem a chave, nada muda.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { createWorker, type FilaDb, type Hermes, linkDoPedidoDoCanal, respostaDoCanalPeloAgente } from './worker.ts'

const RUN = '0b7e0000-0000-4000-8000-000000000001'

function reserva(gatilho: string, origin = 'slack'): Reserva {
  return {
    run_id: RUN, kind: 'coordenada', trigger_kind: gatilho, origin, workspace_name: 'Norte',
    request_text: 'Ache 10 empresas de logística no PR', agent_id: null, mentions: [], agents: [], history: [],
  } as Reserva
}

function montar(reservada: Reserva, canalPeloAgente?: { appOrigin: string }) {
  const eventos: { kind: TipoDeEvento; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; erro: string | null; modelo: string | null }[] = []
  let hermesChamado = 0
  const db: FilaDb = {
    listQueued: () => Promise.resolve([RUN]),
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, _a, payload) => (eventos.push({ kind, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, erro, modelo) => (fechamentos.push({ status, erro, modelo }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: () => (hermesChamado++, Promise.resolve('h1')),
    aguardar: () => Promise.resolve({ status: 'completed', output: '{"etapas":[],"resposta":"Resposta dos Agentes."}' }),
  }
  const worker = createWorker({ db, hermes, log: () => {}, canalPeloAgente })
  return { worker, eventos, fechamentos, hermes: () => hermesChamado }
}

Deno.test('o link do pedido do Canal aponta para a / do app com o id da Execução', () => {
  assertEquals(linkDoPedidoDoCanal('https://app.althius.com.br/', RUN), `https://app.althius.com.br/?pedido_do_canal=${RUN}`)
  const texto = respostaDoCanalPeloAgente('https://app.althius.com.br', RUN)
  assert(texto.includes(`https://app.althius.com.br/?pedido_do_canal=${RUN}`))
  assert(texto.includes('confirmação'))
  assert(!texto.includes('Hermes'))
})

Deno.test('com a chave, um pedido do Slack ou do WhatsApp responde com o link e não chama o Hermes', async () => {
  for (const origem of ['slack', 'whatsapp']) {
    const { worker, eventos, fechamentos, hermes } = montar(reserva('canal', origem), { appOrigin: 'https://app.althius.com.br' })
    assertEquals(await worker.rodada(), 1)
    assertEquals(hermes(), 0)
    assertEquals(eventos.map((e) => e.kind), ['resposta'])
    assert(String(eventos[0].payload.texto).includes(`?pedido_do_canal=${RUN}`))
    assertEquals(fechamentos, [{ status: 'succeeded', erro: null, modelo: null }])
  }
})

Deno.test('com a chave, um pedido feito no app segue com os Agentes', async () => {
  const { worker, hermes, eventos } = montar(reserva('conversa', 'althius'), { appOrigin: 'https://app.althius.com.br' })
  await worker.rodada()
  assertEquals(hermes(), 1)
  assert(!eventos.some((e) => String(e.payload.texto ?? '').includes('pedido_do_canal')))
})

Deno.test('sem a chave, o pedido do Canal segue com os Agentes como antes', async () => {
  const { worker, hermes, eventos } = montar(reserva('canal'))
  await worker.rodada()
  assertEquals(hermes(), 1)
  assert(!eventos.some((e) => String(e.payload.texto ?? '').includes('pedido_do_canal')))
})
