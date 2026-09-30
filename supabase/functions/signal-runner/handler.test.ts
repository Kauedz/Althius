import { assertEquals } from 'jsr:@std/assert@1'
import { type ActorDoRegistro, ApifyRequestError, type Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  createHandler,
  type Db,
  type MonitorReivindicado,
  SemCreditos,
} from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const ALFA = { id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null }
const BETA = { id: 'conta-beta', name: 'Beta', domain: 'beta.test', linkedinUrl: null }

const monitor = (contas = [ALFA, BETA]): MonitorReivindicado => ({
  monitorId: 'mon-1',
  workspaceId: WS,
  signalType: 'vaga_linkedin',
  criteria: { palavras: ['dados'] },
  createdBy: 'user-1',
  accounts: contas,
})

// Um adaptador de mentira: cada item do actor é uma vaga com id e data.
const adaptador: AdaptadorDeSinal = {
  signalType: 'vaga_linkedin',
  entrada: (conta, criterios) => ({ input: { empresa: conta.name, palavras: criterios.palavras }, maxItems: 20 }),
  sinais: (itens, conta) =>
    (itens as { id: string; titulo: string; data: string }[]).map((i) => ({
      eventKey: `${conta.id}|${i.id}`,
      phrase: `Abriu vaga: ${i.titulo}`,
      firedAt: i.data,
      source: 'LinkedIn',
      evidence: `vaga ${i.id}`,
    })),
}

function montar(opcoes: {
  monitores?: MonitorReivindicado[]
  cap?: (scope: string) => 'ok' | 'confirmar' | 'sem_teto' | 'teto_atingido'
  reservar?: () => Promise<string>
  apify?: Apify['run']
  actor?: ActorDoRegistro | null
  agora?: () => number
  semAdaptador?: boolean
  adaptador?: AdaptadorDeSinal
} = {}) {
  const chamadas: { reservas: unknown[]; liquidadas: string[]; liberadas: string[]; sinais: unknown[]; fins: unknown[]; caps: unknown[]; runs: unknown[] } =
    { reservas: [], liquidadas: [], liberadas: [], sinais: [], fins: [], caps: [], runs: [] }
  let n = 0
  const db: Db = {
    tokenMatches: (t) => Promise.resolve(t === 'token-certo-com-mais-de-trinta-e-dois-caracteres'),
    claim: () => Promise.resolve(opcoes.monitores ?? [monitor()]),
    actorForType: () =>
      Promise.resolve(opcoes.actor === undefined
        ? { actorId: 'curious_coder~linkedin-jobs-scraper', signalType: 'vaga_linkedin', state: 'available' as const, version: 'v1', maxCostUsd: 0.5 }
        : opcoes.actor),
    reserve: (args) => {
      chamadas.reservas.push(args)
      return opcoes.reservar ? opcoes.reservar() : Promise.resolve(`reserva-${++n}`)
    },
    settle: (id) => (chamadas.liquidadas.push(id), Promise.resolve()),
    release: (id) => (chamadas.liberadas.push(id), Promise.resolve()),
    consumeCap: (workspaceId, scope, amount) => {
      chamadas.caps.push({ workspaceId, scope, amount })
      return Promise.resolve(opcoes.cap ? opcoes.cap(scope) : 'ok')
    },
    recordSignal: (args) => (chamadas.sinais.push(args), Promise.resolve(true)),
    recordCost: () => Promise.resolve(),
    finish: (monitorId, scanned, error) => (chamadas.fins.push({ monitorId, scanned, error }), Promise.resolve()),
  }
  const apify: Apify = {
    run: opcoes.apify ?? ((args) => {
      chamadas.runs.push(args)
      return Promise.resolve({ runId: 'run-1', items: [{ id: 'v1', titulo: 'Analista de dados', data: '2026-09-28T10:00:00Z' }] })
    }),
  }
  const handler = createHandler({
    db,
    apify,
    adaptadores: opcoes.semAdaptador ? {} : { vaga_linkedin: opcoes.adaptador ?? adaptador },
    agora: opcoes.agora ?? (() => Date.parse('2026-09-30T12:00:00Z')),
    log: () => {},
  })
  return { handler, chamadas }
}

const chamar = (handler: (r: Request) => Promise<Response>, token = 'token-certo-com-mais-de-trinta-e-dois-caracteres', method = 'POST') =>
  handler(new Request('http://x/signal-runner', { method, headers: { 'x-runner-token': token }, body: method === 'POST' ? '{}' : undefined }))

Deno.test('só POST com o token do relógio', async () => {
  const { handler, chamadas } = montar()
  assertEquals((await chamar(handler, 'x', 'GET')).status, 405)
  assertEquals((await chamar(handler, 'token-errado-token-errado-token-errado')).status, 401)
  assertEquals(chamadas.reservas.length, 0)
})

Deno.test('varre cada Conta: reserva 1 crédito, chama o actor, grava os Sinais e liquida', async () => {
  const { handler, chamadas } = montar()
  const r = await chamar(handler)
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { monitors: 1, scanned: 2, signals: 2 })
  assertEquals(chamadas.reservas.length, 2)
  assertEquals((chamadas.reservas[0] as { action: string; quantity: number }).action, 'account_scan')
  assertEquals((chamadas.reservas[0] as { quantity: number }).quantity, 1)
  assertEquals((chamadas.runs[0] as { input: unknown }).input, { empresa: 'Alfa', palavras: ['dados'] })
  assertEquals((chamadas.runs[0] as { maxTotalChargeUsd: number }).maxTotalChargeUsd, 0.5)
  assertEquals(chamadas.liquidadas, ['reserva-1', 'reserva-2'])
  assertEquals(chamadas.liberadas, [])
  assertEquals(chamadas.caps.map((c) => (c as { scope: string }).scope), ['acao:varredura', 'acao:varredura'])
  assertEquals(chamadas.fins, [{ monitorId: 'mon-1', scanned: 2, error: null }])
  assertEquals((chamadas.sinais[0] as { eventKey: string; monitorId: string }).eventKey, 'conta-alfa|v1')
})

Deno.test('a chave da reserva é estável na mesma hora: repetir a rodada não cobra duas vezes', async () => {
  const a = montar()
  await chamar(a.handler)
  const b = montar()
  await chamar(b.handler)
  assertEquals((a.chamadas.reservas[0] as { actionKey: string }).actionKey, (b.chamadas.reservas[0] as { actionKey: string }).actionKey)
})

Deno.test('automático em confirmar ou sem teto: não varre, não cobra e diz por quê', async () => {
  for (const [cap, texto] of [['confirmar', 'confirmar'], ['sem_teto', 'teto'], ['teto_atingido', 'teto']] as const) {
    const { handler, chamadas } = montar({ cap: () => cap })
    const r = await chamar(handler)
    assertEquals((await r.json()).scanned, 0)
    assertEquals(chamadas.runs.length, 0)
    assertEquals(chamadas.liberadas, ['reserva-1'], 'a reserva volta ao saldo')
    assertEquals(chamadas.liquidadas, [])
    const fim = chamadas.fins[0] as { scanned: number; error: string }
    assertEquals(fim.scanned, 0)
    assertEquals(fim.error.toLowerCase().includes(texto), true, fim.error)
  }
})

Deno.test('sem créditos ou no limite do participante: para o Monitoramento e avisa', async () => {
  const { handler, chamadas } = montar({ reservar: () => Promise.reject(new SemCreditos()) })
  const r = await chamar(handler)
  assertEquals((await r.json()).scanned, 0)
  assertEquals(chamadas.runs.length, 0)
  assertEquals((chamadas.fins[0] as { error: string }).error.includes('crédito'), true)
})

Deno.test('falha do Apify numa Conta: libera a reserva, segue para a próxima e não cobra', async () => {
  let i = 0
  const { handler, chamadas } = montar({
    apify: () => {
      i++
      return i === 1
        ? Promise.reject(new ApifyRequestError(500))
        : Promise.resolve({ runId: 'run-2', items: [{ id: 'v2', titulo: 'Engenheiro', data: '2026-09-29T10:00:00Z' }] })
    },
  })
  const r = await chamar(handler)
  assertEquals(await r.json(), { monitors: 1, scanned: 1, signals: 1 })
  assertEquals(chamadas.liberadas, ['reserva-1'])
  assertEquals(chamadas.liquidadas, ['reserva-2'])
  assertEquals((chamadas.fins[0] as { error: string }).error.includes('Alfa'), true)
})

Deno.test('sem adaptador ou com actor indisponível: o Monitoramento espera, sem gastar nada', async () => {
  const a = montar({ semAdaptador: true })
  assertEquals((await (await chamar(a.handler)).json()).scanned, 0)
  assertEquals(a.chamadas.reservas.length, 0)
  assertEquals((a.chamadas.fins[0] as { error: string }).error.includes('adaptador'), true)
  const b = montar({ actor: { actorId: 'x~y', signalType: 'vaga_linkedin', state: 'testing', version: null, maxCostUsd: 0.5 } })
  assertEquals((await (await chamar(b.handler)).json()).scanned, 0)
  assertEquals(b.chamadas.reservas.length, 0)
  assertEquals((b.chamadas.fins[0] as { error: string }).error.includes('disponível'), true)
})

Deno.test('o adaptador que quebra não cobra o cliente', async () => {
  const quebrado: AdaptadorDeSinal = { ...adaptador, sinais: () => { throw new Error('campo mudou') } }
  const { handler, chamadas } = montar({ adaptador: quebrado })
  const r = await chamar(handler)
  assertEquals((await r.json()).scanned, 0)
  assertEquals(chamadas.liquidadas, [])
  assertEquals(chamadas.liberadas, ['reserva-1', 'reserva-2'])
  assertEquals((chamadas.fins[0] as { error: string }).error.includes('Alfa'), true)
})

Deno.test('acaba o tempo no meio: varre o que deu, avisa e a próxima rodada continua', async () => {
  let t = Date.parse('2026-09-30T12:00:00Z')
  const { handler, chamadas } = montar({
    agora: () => t,
    apify: () => {
      t += 200_000
      return Promise.resolve({ runId: 'r', items: [] })
    },
  })
  const r = await chamar(handler)
  assertEquals((await r.json()).scanned, 1)
  const fim = chamadas.fins[0] as { scanned: number; error: string }
  assertEquals(fim.scanned, 1)
  assertEquals(fim.error.includes('1 de 2'), true)
})
