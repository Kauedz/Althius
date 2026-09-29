import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db, type Inicio, type Pedido } from './handler.ts'

const WORKSPACE = 'a0000000-0000-0000-0000-000000000001'
const CONVERSA = 'b0000000-0000-0000-0000-000000000001'
const AGENTE = 'c0000000-0000-0000-0000-000000000001'
const PEDIDO_ID = 'd0000000-0000-0000-0000-000000000001'
const EXECUCAO = 'e0000000-0000-0000-0000-000000000001'

function fakeDb(
  inicio: Inicio | Error = { kind: 'started', conversationId: CONVERSA, runId: EXECUCAO, status: 'queued' },
) {
  const pedidos: Pedido[] = []
  const db: Db = {
    userFromJwt: (authorization) => Promise.resolve(authorization === 'Bearer jwt-da-ana' ? { userId: 'ana' } : null),
    startRun: (pedido) => {
      pedidos.push(pedido)
      return inicio instanceof Error ? Promise.reject(inicio) : Promise.resolve(inicio)
    },
  }
  return { db, pedidos }
}

function montar({ inicio, semModelo = false }: { inicio?: Inicio | Error; semModelo?: boolean } = {}) {
  const { db, pedidos } = fakeDb(inicio)
  const executados: string[] = []
  const trabalhos: Promise<unknown>[] = []
  const handler = createHandler({
    db,
    executar: semModelo ? null : (runId) => {
      executados.push(runId)
      return Promise.resolve()
    },
    waitUntil: (work) => void trabalhos.push(work),
    appOrigin: 'https://app.althius.com.br',
    log: () => {},
  })
  return { handler, pedidos, executados, trabalhos }
}

function pedido(body: unknown, { jwt = 'jwt-da-ana', method = 'POST' } = {}) {
  return new Request('https://fn.test/agent-conversation', {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: 'anon',
      Origin: 'https://app.althius.com.br',
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

const ENVIO = {
  action: 'send',
  workspaceId: WORKSPACE,
  text: '  Quais Contas temos?  ',
  mentions: [AGENTE],
  clientRequestId: PEDIDO_ID,
}

Deno.test('capacidade: disponível só com o modelo configurado', async () => {
  const com = await montar().handler(pedido({ action: 'capability' }))
  assertEquals([com.status, await com.json()], [200, { available: true }])
  const sem = await montar({ semModelo: true }).handler(pedido({ action: 'capability' }))
  assertEquals([sem.status, await sem.json()], [200, { available: false }])
})

Deno.test('sem sessão válida, nada', async () => {
  const { handler, pedidos } = montar()
  const resposta = await handler(pedido(ENVIO, { jwt: 'outro' }))
  assertEquals(resposta.status, 401)
  assertEquals(pedidos.length, 0)
})

Deno.test('sem modelo, o pedido não é guardado nem simulado', async () => {
  const { handler, pedidos } = montar({ semModelo: true })
  const resposta = await handler(pedido(ENVIO))
  assertEquals(resposta.status, 503)
  assertEquals((await resposta.json()).code, 'model_unavailable')
  assertEquals(pedidos.length, 0)
})

Deno.test('o pedido é guardado com a sessão de quem pede e roda depois da resposta', async () => {
  const { handler, pedidos, executados, trabalhos } = montar()
  const resposta = await handler(pedido(ENVIO))
  assertEquals(resposta.status, 202)
  assertEquals(await resposta.json(), { conversationId: CONVERSA, runId: EXECUCAO, status: 'queued' })
  assertEquals(pedidos, [{
    authorization: 'Bearer jwt-da-ana',
    apikey: 'anon',
    workspaceId: WORKSPACE,
    conversationId: null,
    agentId: null,
    text: 'Quais Contas temos?',
    mentions: [AGENTE],
    clientRequestId: PEDIDO_ID,
  }])
  await Promise.all(trabalhos)
  assertEquals(executados, [EXECUCAO])
})

Deno.test('o pedido repetido que já rodou não roda de novo', async () => {
  const { handler, executados, trabalhos } = montar({
    inicio: { kind: 'started', conversationId: CONVERSA, runId: EXECUCAO, status: 'succeeded' },
  })
  const resposta = await handler(pedido(ENVIO))
  assertEquals((await resposta.json()).status, 'succeeded')
  assertEquals([trabalhos.length, executados.length], [0, 0])
})

Deno.test('pedidos malformados são recusados antes do banco', async () => {
  for (
    const body of [
      { ...ENVIO, workspaceId: 'x' },
      { ...ENVIO, clientRequestId: undefined },
      { ...ENVIO, conversationId: 'x' },
      { ...ENVIO, mentions: ['x'] },
      { ...ENVIO, mentions: [AGENTE, AGENTE, AGENTE, AGENTE, AGENTE] },
      { ...ENVIO, text: '   ' },
      { ...ENVIO, text: 'a'.repeat(4001) },
      { action: 'outra' },
    ]
  ) {
    const { handler, pedidos } = montar()
    const resposta = await handler(pedido(body))
    assertEquals(resposta.status, 400, JSON.stringify(body).slice(0, 80))
    assertEquals(pedidos.length, 0)
  }
})

Deno.test('as recusas do banco viram respostas claras', async () => {
  const casos: [Inicio | Error, number][] = [
    [{ kind: 'busy' }, 409],
    [{ kind: 'not_found' }, 404],
    [{ kind: 'forbidden' }, 403],
    [{ kind: 'invalid' }, 400],
    [new Error('banco fora'), 500],
  ]
  for (const [inicio, status] of casos) {
    const { handler, executados } = montar({ inicio })
    const resposta = await handler(pedido(ENVIO))
    assertEquals(resposta.status, status)
    assertEquals(executados.length, 0)
  }
})

Deno.test('só POST', async () => {
  const resposta = await montar().handler(pedido(null, { method: 'GET' }))
  assertEquals(resposta.status, 405)
})
