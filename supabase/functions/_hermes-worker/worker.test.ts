import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { AgenteDoWorkspace, ContaEncontrada, Reserva, TipoDeEvento } from '../agent-conversation/runner.ts'
import {
  type CorpoDoRun,
  createWorker,
  type FilaDb,
  type FimDoHermes,
  type Hermes,
  hermesHttp,
  limparSaida,
} from './worker.ts'

const SCOPUS: AgenteDoWorkspace = {
  id: 'a-scopus',
  name: 'Scopus',
  specialty: 'scopus',
  kind: 'padrao',
  instructions: 'Priorize incorporadoras.',
  voice_tone: '',
}
const RHETOR: AgenteDoWorkspace = { ...SCOPUS, id: 'a-rhetor', name: 'Rhetor', specialty: 'rhetor', instructions: '' }
const ALFA: ContaEncontrada = {
  name: 'Alfa',
  domain: 'alfa.com.br',
  segment: null,
  origin: 'manual',
  last_interaction_at: null,
}

function reserva(extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'coordenada',
    workspace_name: 'Norte',
    request_text: 'Quais Contas temos?',
    agent_id: null,
    mentions: [],
    agents: [SCOPUS, RHETOR],
    history: [{ request: 'Oi', answer: 'Olá.' }],
    ...extra,
  }
}

function montar({
  fila = ['r1'] as string[],
  reservada = reserva() as Reserva | null,
  fim = { status: 'completed', output: 'Ok.' } as FimDoHermes | Error,
  vivo = true,
} = {}) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const corpos: { corpo: CorpoDoRun; chave: string }[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(fila),
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([ALFA]),
  }
  const hermes: Hermes = {
    vivo: () => Promise.resolve(vivo),
    iniciar: (corpo, chave) => (corpos.push({ corpo, chave }), Promise.resolve('hermes-run-1')),
    aguardar: () => (fim instanceof Error ? Promise.reject(fim) : Promise.resolve(fim)),
  }
  return { worker: createWorker({ db, hermes, log: () => {} }), eventos, fechamentos, corpos }
}

Deno.test('a Coordenação: o Hermes recebe o contexto e a resposta volta com as etapas dos Agentes', async () => {
  const saida = JSON.stringify({
    etapas: [{ agente: 'Scopus', texto: 'Achei a Alfa.' }, { agente: 'Hermes', texto: 'ignorado' }],
    resposta: 'Temos a Alfa.',
  })
  const { worker, eventos, fechamentos, corpos } = montar({
    fim: { status: 'completed', output: `<think>pensando</think>\n\`\`\`json\n${saida}\n\`\`\`` },
  })
  // Com Menção, a rodada vai pelo modo por Agente (PR-11); o modo de uma chamada é testado direto.
  await worker.processar(reserva({ mentions: [RHETOR.id] }))
  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId ?? '-'}`), [
    'chamada:a-scopus',
    'feito:a-scopus',
    'resposta:-',
  ])
  assertEquals(eventos[2].payload, { texto: 'Temos a Alfa.' })
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
  const { corpo, chave } = corpos[0]
  assertEquals(chave, 'althius-r1')
  assertEquals(corpo.input, 'Quais Contas temos?')
  assertEquals(corpo.conversation_history, [{ role: 'user', content: 'Oi' }, { role: 'assistant', content: 'Olá.' }])
  assertStringIncludes(corpo.instructions, 'Nunca diga o nome do motor')
  assertStringIncludes(corpo.instructions, 'Priorize incorporadoras.')
  assertStringIncludes(corpo.instructions, '"alfa.com.br"')
  assertStringIncludes(corpo.instructions, 'Os Agentes mencionados precisam trabalhar: Rhetor.')
})

Deno.test('sem o JSON pedido, a saída do motor vira a resposta, sem etapas inventadas', async () => {
  const { worker, eventos } = montar({ fim: { status: 'completed', output: 'Temos a Alfa.' } })
  await worker.rodada()
  assertEquals(eventos, [{ kind: 'resposta', agentId: null, payload: { texto: 'Temos a Alfa.' } }])
})

Deno.test('no modo de uma chamada, na página do Agente sem Menção, a resposta é dele', async () => {
  const { worker, eventos, corpos } = montar({ fim: { status: 'completed', output: 'A Alfa tem aderência.' } })
  await worker.processar(reserva({ kind: 'agente', agent_id: SCOPUS.id }))
  assertEquals(eventos, [{ kind: 'texto', agentId: SCOPUS.id, payload: { texto: 'A Alfa tem aderência.' } }])
  assertStringIncludes(corpos[0].corpo.instructions, 'Responda como Scopus')
})

Deno.test('falha, prazo e Hermes fora viram falha com motivo, sem resposta', async () => {
  const casos: [FimDoHermes | Error, string][] = [
    [{ status: 'failed', error: 'provider' }, 'hermes_failed'],
    [{ status: 'timeout', error: 'prazo' }, 'timeout'],
    [{ status: 'completed', output: '<think>só isso</think>' }, 'model_empty'],
    [new Error('conexão recusada'), 'hermes_unreachable'],
  ]
  for (const [fim, codigo] of casos) {
    const { worker, eventos, fechamentos } = montar({ fim })
    await worker.rodada()
    assertEquals(eventos, [], codigo)
    assertEquals(fechamentos, [{ status: 'failed', errorCode: codigo }])
  }
})

Deno.test('com o Hermes fora do ar, nada é reservado: o pedido espera na fila', async () => {
  const { worker, corpos, fechamentos } = montar({ vivo: false })
  assertEquals(await worker.rodada(), null)
  assertEquals([corpos.length, fechamentos.length], [0, 0])
})

Deno.test('um pedido que outro worker já reservou é pulado', async () => {
  const { worker, corpos } = montar({ reservada: null })
  assertEquals(await worker.rodada(), 0)
  assertEquals(corpos.length, 0)
})

Deno.test('limparSaida tira o raciocínio e a cerca de código', () => {
  assertEquals(limparSaida('<think>a\nb</think>\n```json\n{"x":1}\n```'), '{"x":1}')
  assertEquals(limparSaida('  Olá.  '), 'Olá.')
})

Deno.test('o cliente HTTP do Hermes: chave, idempotência, espera até o fim e para no prazo', async () => {
  const pedidos: Request[] = []
  let status = 0
  const buscar = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const pedido = new Request(entrada, init)
    pedidos.push(pedido)
    const caminho = new URL(pedido.url).pathname
    if (caminho === '/health') return Promise.resolve(new Response('ok'))
    if (caminho === '/v1/runs') {
      return Promise.resolve(new Response(JSON.stringify({ run_id: 'run_1', status: 'started' }), { status: 202 }))
    }
    if (caminho.endsWith('/stop')) return Promise.resolve(new Response('{}'))
    status++
    const corpo = status < 2 ? { status: 'running' } : { status: 'completed', output: 'Pronto.' }
    return Promise.resolve(new Response(JSON.stringify(corpo)))
  }
  const hermes = hermesHttp({
    url: 'http://127.0.0.1:8642/',
    chave: 'k',
    fetch: buscar,
    esperar: () => Promise.resolve(),
  })
  assertEquals(await hermes.vivo(), true)
  assertEquals(
    await hermes.iniciar({ input: 'Oi', instructions: 'x', conversation_history: [] }, 'althius-r1'),
    'run_1',
  )
  assertEquals(pedidos[1].headers.get('Idempotency-Key'), 'althius-r1')
  assertEquals(pedidos[1].headers.get('Authorization'), 'Bearer k')
  assertEquals(await hermes.aguardar('run_1'), { status: 'completed', output: 'Pronto.' })

  const parado = hermesHttp({
    url: 'http://h',
    chave: 'k',
    prazoMs: 0,
    fetch: (entrada, init) => (pedidos.push(new Request(entrada, init)), Promise.resolve(new Response('{}'))),
  })
  assertEquals((await parado.aguardar('run_2')).status, 'timeout')
  assertEquals(new URL(pedidos.at(-1)!.url).pathname, '/v1/runs/run_2/stop')
})
