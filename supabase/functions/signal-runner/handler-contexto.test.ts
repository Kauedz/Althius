// O contexto dos adaptadores com estado (PR-8): com as fotos e a contagem de vagas no banco, roda `sinaisComContexto`,
// o modelo recebe o Workspace e o custo do modelo vira outra linha da mesma execução. Sem o contexto, roda `sinais`.
import { assertEquals } from 'jsr:@std/assert@1'
import type { ActorDoRegistro, Apify } from '../signal-scan/handler.ts'
import { type AdaptadorDeSinal, createHandler, type Db, type MonitorReivindicado } from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const AGORA = Date.parse('2026-10-14T12:00:00Z')
const TOKEN = 'token-certo-com-mais-de-trinta-e-dois-caracteres'
const MONITOR: MonitorReivindicado = {
  monitorId: 'mon-1', workspaceId: WS, signalType: 'publicacao_da_empresa', criteria: {}, createdBy: 'user-1',
  slot: '2026-10-14T12:00:00+00:00', accounts: [{ id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null }],
}
const ACTOR: ActorDoRegistro = { actorId: 'harvestapi~linkedin-company-posts', signalType: 'publicacao_da_empresa', state: 'available', version: null, maxCostUsd: 0.05 }

const adaptador: AdaptadorDeSinal = {
  signalType: 'publicacao_da_empresa',
  entrada: () => ({ input: {}, maxItems: 1 }),
  sinais: () => [{ eventKey: 'sem-contexto', phrase: 'Sem contexto', firedAt: '2026-10-10T00:00:00Z' }],
  async sinaisComContexto(_itens, conta, _c, _a, ctx) {
    const { custoUsd } = await ctx.llm!.json({ sistema: 's', usuario: 'u' })
    ctx.custo.adicionar(custoUsd, 3)
    const vagas = await ctx.vagasAbertas(conta.id, '2026-07-16T12:00:00.000Z')
    return [{ eventKey: `com-contexto-${vagas}`, phrase: 'Com contexto', firedAt: '2026-10-10T00:00:00Z' }]
  },
}

function montar(comContexto: boolean) {
  const sinais: string[] = []
  const custos: Parameters<Db['recordCost']>[0][] = []
  const workspacesDoModelo: (string | undefined)[] = []
  const db: Db = {
    tokenMatches: (t) => Promise.resolve(t === TOKEN),
    claim: () => Promise.resolve([MONITOR]),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: () => Promise.resolve({ outcome: 'go', reservationId: 'res-1' }),
    endScan: () => Promise.resolve(),
    recordSignal: (a) => (sinais.push(a.eventKey), Promise.resolve(true)),
    recordCost: (a) => (custos.push(a), Promise.resolve()),
    finish: () => Promise.resolve(),
    ...(comContexto
      ? {
        headcountBase: () => Promise.resolve(null),
        recordHeadcount: () => Promise.resolve(),
        countJobSignals: () => Promise.resolve(4),
      }
      : {}),
  }
  const apify: Apify = { run: () => Promise.resolve({ runId: 'run-1', items: [{}] }), custoDaExecucao: () => Promise.resolve(0.02) }
  const handler = createHandler({
    db, apify, adaptadores: { publicacao_da_empresa: adaptador }, agora: () => AGORA, log: () => {},
    llm: { json: (a) => (workspacesDoModelo.push(a.workspaceId), Promise.resolve({ json: {}, custoUsd: 0.0004 })) },
  })
  const chamar = () => handler(new Request('http://x', { method: 'POST', headers: { 'x-runner-token': TOKEN }, body: '{}' }))
  return { chamar, sinais, custos, workspacesDoModelo }
}

Deno.test('com o contexto: roda sinaisComContexto, o modelo recebe o Workspace e o custo do modelo é gravado', async () => {
  const { chamar, sinais, custos, workspacesDoModelo } = montar(true)
  assertEquals((await chamar()).status, 200)
  assertEquals(sinais, ['com-contexto-4'])
  assertEquals(workspacesDoModelo, [WS])
  assertEquals(custos, [
    { workspaceId: WS, actorId: ACTOR.actorId, runId: 'run-1', items: 1, costUsd: 0.02 },
    { workspaceId: WS, actorId: ACTOR.actorId, runId: 'run-1:modelo', items: 3, costUsd: 0.0004 },
  ])
})

Deno.test('sem o contexto no banco: roda sinais, sem custo de modelo', async () => {
  const { chamar, sinais, custos } = montar(false)
  assertEquals((await chamar()).status, 200)
  assertEquals(sinais, ['sem-contexto'])
  assertEquals(custos.length, 1)
})
