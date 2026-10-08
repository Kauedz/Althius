// O custo real de cada varredura do Monitoramento (creditos-e-planos, ticket 01): o que o Apify informa é gravado com o
// Workspace, o actor e a execução, só para medir. Gravar o custo nunca muda o resultado da varredura.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { ActorDoRegistro, Apify } from '../signal-scan/handler.ts'
import { type AdaptadorDeSinal, createHandler, type Db, type MonitorReivindicado } from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const AGORA = Date.parse('2026-09-30T12:00:00Z')
const TOKEN = 'token-certo-com-mais-de-trinta-e-dois-caracteres'

const MONITOR: MonitorReivindicado = {
  monitorId: 'mon-1',
  workspaceId: WS,
  signalType: 'vaga_linkedin',
  criteria: {},
  createdBy: 'user-1',
  slot: '2026-09-30T12:00:00+00:00',
  accounts: [
    { id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null },
    { id: 'conta-beta', name: 'Beta', domain: 'beta.test', linkedinUrl: null },
  ],
}

const ACTOR: ActorDoRegistro = {
  actorId: 'curious_coder~linkedin-jobs-scraper',
  signalType: 'vaga_linkedin',
  state: 'available',
  version: 'v1',
  maxCostUsd: 0.5,
}

// Cada item do actor é uma vaga com id e data.
const adaptador: AdaptadorDeSinal = {
  signalType: 'vaga_linkedin',
  entrada: (conta) => ({ input: { empresa: conta.name }, maxItems: 20 }),
  sinais: (itens, conta) =>
    (itens as { id: string; data: string }[]).map((i) => ({
      eventKey: `${conta.id}|${i.id}`,
      phrase: `Abriu vaga ${i.id}`,
      firedAt: i.data,
    })),
}

type Custo = Parameters<Db['recordCost']>[0]

function montar(opcoes: {
  runId?: (empresa: string) => string | null
  custoDaExecucao?: Apify['custoDaExecucao']
  recordCost?: Db['recordCost']
} = {}) {
  const custos: Custo[] = []
  const consultados: string[] = []
  const sinais: string[] = []
  const fechamentos: { id: string; success: boolean }[] = []
  const logs: Record<string, unknown>[] = []
  const db: Db = {
    tokenMatches: (t) => Promise.resolve(t === TOKEN),
    claim: () => Promise.resolve([MONITOR]),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: (a) => Promise.resolve({ outcome: 'go', reservationId: `res-${a.accountId}` }),
    endScan: (id, success) => (fechamentos.push({ id, success }), Promise.resolve()),
    recordSignal: (a) => (sinais.push(a.eventKey), Promise.resolve(true)),
    recordCost: opcoes.recordCost ?? ((args) => (custos.push(args), Promise.resolve())),
    finish: () => Promise.resolve(),
  }
  const apify: Apify = {
    run: ({ input }) => {
      const empresa = (input as { empresa: string }).empresa
      const runId = opcoes.runId ? opcoes.runId(empresa) : `run-${empresa.toLowerCase()}`
      const items = [
        { id: `${empresa}-1`, data: '2026-09-28T10:00:00Z' },
        { id: `${empresa}-2`, data: '2026-09-29T10:00:00Z' },
      ]
      return Promise.resolve({ runId, items })
    },
    custoDaExecucao: opcoes.custoDaExecucao ?? ((runId) => (consultados.push(runId), Promise.resolve(0.012))),
  }
  const handler = createHandler({
    db,
    apify,
    adaptadores: { vaga_linkedin: adaptador },
    agora: () => AGORA,
    log: (c) => logs.push(c),
  })
  const chamar = () =>
    handler(new Request('http://x/signal-runner', { method: 'POST', headers: { 'x-runner-token': TOKEN }, body: '{}' }))
  return { chamar, custos, consultados, sinais, fechamentos, logs }
}

Deno.test('cada varredura grava o custo que o Apify informou, com o Workspace, o actor, a execução e os itens', async () => {
  const { chamar, custos, consultados } = montar()
  assertEquals((await chamar()).status, 200)
  assertEquals(consultados, ['run-alfa', 'run-beta'])
  assertEquals(custos, [
    { workspaceId: WS, actorId: ACTOR.actorId, runId: 'run-alfa', items: 2, costUsd: 0.012 },
    { workspaceId: WS, actorId: ACTOR.actorId, runId: 'run-beta', items: 2, costUsd: 0.012 },
  ])
})

Deno.test('quando o Apify não informa o custo, a execução é gravada com o valor em branco', async () => {
  const { chamar, custos } = montar({ custoDaExecucao: () => Promise.resolve(null) })
  await chamar()
  assertEquals(custos.map((c) => c.costUsd), [null, null])
})

Deno.test('a execução sem id do Apify ganha um id próprio e não consulta o custo', async () => {
  const consultados: string[] = []
  const { chamar, custos } = montar({
    runId: () => null,
    custoDaExecucao: (runId) => (consultados.push(runId), Promise.resolve(1)),
  })
  await chamar()
  assertEquals(consultados, [])
  assertEquals(custos.map((c) => c.costUsd), [null, null])
  assert(custos.every((c) => c.runId.startsWith('signal-runner:')), JSON.stringify(custos))
  assert(custos[0].runId !== custos[1].runId)
})

Deno.test('uma falha ao gravar o custo só vai ao log: os Sinais ficam e a varredura fecha com sucesso', async () => {
  const { chamar, sinais, fechamentos, logs } = montar({ recordCost: () => Promise.reject(new Error('banco fora')) })
  assertEquals(await (await chamar()).json(), { monitors: 1, scanned: 2, signals: 4 })
  assertEquals(sinais.length, 4)
  assertEquals(fechamentos, [{ id: 'res-conta-alfa', success: true }, { id: 'res-conta-beta', success: true }])
  assertEquals(logs.filter((l) => l.outcome === 'cost_failed').length, 2)
})

Deno.test('quando a leitura do custo no Apify falha, a execução é gravada com o valor em branco', async () => {
  const { chamar, custos, sinais } = montar({ custoDaExecucao: () => Promise.reject(new Error('Apify fora')) })
  await chamar()
  assertEquals(custos, [
    { workspaceId: WS, actorId: ACTOR.actorId, runId: 'run-alfa', items: 2, costUsd: null },
    { workspaceId: WS, actorId: ACTOR.actorId, runId: 'run-beta', items: 2, costUsd: null },
  ])
  assertEquals(sinais.length, 4)
})
