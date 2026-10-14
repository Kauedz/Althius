import { assertEquals } from 'jsr:@std/assert@1'
import { type ActorDoRegistro, ApifyRequestError, type Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  createHandler,
  type Db,
  type MonitorReivindicado,
  type ResultadoDaAbertura,
} from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const SLOT = '2026-09-30T12:00:00+00:00'
const AGORA = Date.parse('2026-09-30T12:00:00Z')
const ALFA = { id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null }
const BETA = { id: 'conta-beta', name: 'Beta', domain: 'beta.test', linkedinUrl: null }

const monitor = (id = 'mon-1', contas = [ALFA, BETA]): MonitorReivindicado => ({
  monitorId: id,
  workspaceId: WS,
  signalType: 'vaga_linkedin',
  criteria: { palavras: ['dados'] },
  createdBy: 'user-1',
  slot: SLOT,
  accounts: contas,
})

const vaga = (id: string, data = '2026-09-28T10:00:00Z') => ({ id, titulo: `Vaga ${id}`, data })

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

const ACTOR: ActorDoRegistro = {
  actorId: 'curious_coder~linkedin-jobs-scraper',
  signalType: 'vaga_linkedin',
  state: 'available',
  version: 'v1',
  maxCostUsd: 0.5,
}

interface Opcoes {
  monitores?: MonitorReivindicado[]
  abertura?: (accountId: string) => { outcome: ResultadoDaAbertura; reservationId: string | null }
  apify?: Apify['run']
  actor?: ActorDoRegistro | null
  agora?: () => number
  semAdaptador?: boolean
  adaptador?: AdaptadorDeSinal
  recordSignal?: () => Promise<boolean>
  ilimitado?: boolean
}

function montar(opcoes: Opcoes = {}) {
  const c = {
    aberturas: [] as { accountId: string; slot: string; userId: string | null }[],
    fechamentos: [] as { id: string; success: boolean }[],
    sinais: [] as { eventKey: string; firedAt: string; monitorId: string }[],
    fins: [] as { monitorId: string; attempted: number; error: string | null; continuar: boolean }[],
    runs: [] as { input: unknown; maxTotalChargeUsd: number }[],
  }
  const db: Db = {
    tokenMatches: (t) => Promise.resolve(t === 'token-certo-com-mais-de-trinta-e-dois-caracteres'),
    claim: () => Promise.resolve(opcoes.monitores ?? [monitor()]),
    actorForType: () => Promise.resolve(opcoes.actor === undefined ? ACTOR : opcoes.actor),
    beginScan: (a) => {
      c.aberturas.push({ accountId: a.accountId, slot: a.slot, userId: a.userId })
      return Promise.resolve(opcoes.abertura ? opcoes.abertura(a.accountId) : { outcome: 'go', reservationId: `res-${a.accountId}` })
    },
    endScan: (id, success) => (c.fechamentos.push({ id, success }), Promise.resolve()),
    recordSignal: (a) => {
      c.sinais.push({ eventKey: a.eventKey, firedAt: a.firedAt, monitorId: a.monitorId })
      return opcoes.recordSignal ? opcoes.recordSignal() : Promise.resolve(true)
    },
    recordCost: () => Promise.resolve(),
    finish: (monitorId, attempted, error, continuar) => (c.fins.push({ monitorId, attempted, error, continuar }), Promise.resolve()),
    ...(opcoes.ilimitado ? { creditsUnlimited: () => Promise.resolve(true) } : {}),
  }
  const apify: Apify = {
    run: opcoes.apify ?? ((args) => {
      c.runs.push({ input: args.input, maxTotalChargeUsd: args.maxTotalChargeUsd })
      return Promise.resolve({ runId: 'run-1', items: [vaga('v1')] })
    }),
  }
  const handler = createHandler({
    db,
    apify,
    adaptadores: opcoes.semAdaptador ? {} : { vaga_linkedin: opcoes.adaptador ?? adaptador },
    agora: opcoes.agora ?? (() => AGORA),
    log: () => {},
  })
  return { handler, c }
}

const chamar = (handler: (r: Request) => Promise<Response>, token = 'token-certo-com-mais-de-trinta-e-dois-caracteres', method = 'POST') =>
  handler(new Request('http://x/signal-runner', { method, headers: { 'x-runner-token': token }, body: method === 'POST' ? '{}' : undefined }))

Deno.test('aquecer guarda a estatística e não reivindica Monitoramento', async () => {
  let chamadas = 0
  const { handler, c } = montar()
  const comAquecer = createHandler({
    db: {
      tokenMatches: (t) => Promise.resolve(t === 'token-certo-com-mais-de-trinta-e-dois-caracteres'),
      claim: () => {
        c.aberturas.push({ accountId: 'nao', slot: SLOT, userId: null })
        return Promise.resolve([monitor()])
      },
      actorForType: () => Promise.resolve(ACTOR),
      beginScan: () => Promise.resolve({ outcome: 'go', reservationId: 'res' }),
      endScan: () => Promise.resolve(),
      recordSignal: () => Promise.resolve(true),
      recordCost: () => Promise.resolve(),
      finish: () => Promise.resolve(),
    },
    apify: { run: () => Promise.resolve({ runId: 'run-1', items: [] }) },
    adaptadores: { vaga_linkedin: adaptador },
    aquecer: () => {
      chamadas++
      return Promise.resolve({
        desfecho: 'concluida',
        mensagem: 'A estatística de comércio exterior deste mês foi guardada.',
      })
    },
    log: () => {},
  })
  const r = await comAquecer(new Request('http://x/signal-runner', {
    method: 'POST',
    headers: { 'x-runner-token': 'token-certo-com-mais-de-trinta-e-dois-caracteres' },
    body: JSON.stringify({ action: 'aquecer' }),
  }))
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { desfecho: 'concluida', mensagem: 'A estatística de comércio exterior deste mês foi guardada.' })
  assertEquals(chamadas, 1)
  assertEquals(c.aberturas.length, 0)
  const normal = await chamar(handler)
  assertEquals((await normal.json()).monitors, 1)
})

Deno.test('só POST com o token do relógio', async () => {
  const { handler, c } = montar()
  assertEquals((await chamar(handler, 'x', 'GET')).status, 405)
  assertEquals((await chamar(handler, 'token-errado-token-errado-token-errado')).status, 401)
  assertEquals(c.aberturas.length, 0)
})

Deno.test('varre cada Conta: abre, roda o actor com o teto do registro, grava os Sinais e fecha com sucesso', async () => {
  const { handler, c } = montar()
  const r = await chamar(handler)
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { monitors: 1, scanned: 2, signals: 2 })
  assertEquals(c.aberturas, [
    { accountId: 'conta-alfa', slot: SLOT, userId: 'user-1' },
    { accountId: 'conta-beta', slot: SLOT, userId: 'user-1' },
  ])
  assertEquals(c.runs[0], { input: { empresa: 'Alfa', palavras: ['dados'] }, maxTotalChargeUsd: 0.5 })
  assertEquals(c.fechamentos, [{ id: 'res-conta-alfa', success: true }, { id: 'res-conta-beta', success: true }])
  assertEquals(c.sinais[0], { eventKey: 'conta-alfa|v1', firedAt: '2026-09-28T10:00:00Z', monitorId: 'mon-1' })
  assertEquals(c.fins, [{ monitorId: 'mon-1', attempted: 2, error: null, continuar: false }])
})

Deno.test('a rodada já concluída ou já falhada não roda o actor nem cobra outra vez; a retomada roda', async () => {
  const { handler, c } = montar({
    abertura: (conta) =>
      conta === 'conta-alfa' ? { outcome: 'done', reservationId: 'r1' } : { outcome: 'resume', reservationId: 'r2' },
  })
  assertEquals(await (await chamar(handler)).json(), { monitors: 1, scanned: 1, signals: 1 })
  assertEquals(c.runs.length, 1)
  assertEquals(c.fechamentos, [{ id: 'r2', success: true }])
  assertEquals(c.fins[0].attempted, 2)

  const b = montar({ abertura: () => ({ outcome: 'skip', reservationId: 'r3' }) })
  assertEquals((await (await chamar(b.handler)).json()).scanned, 0)
  assertEquals(b.c.runs.length, 0)
  assertEquals(b.c.fins[0].attempted, 2)
})

Deno.test('Workspace ilimitado com reserva: teto atingido não para a varredura', async () => {
  const { handler, c } = montar({
    abertura: () => ({ outcome: 'teto_atingido', reservationId: 'res-ilimitado' }),
    ilimitado: true,
  })
  assertEquals((await (await chamar(handler)).json()).scanned, 2)
  assertEquals(c.runs.length, 2)
  assertEquals(c.fechamentos.map((f) => f.success), [true, true])
})

Deno.test('automático em confirmar, sem teto ou no teto: não varre, não cobra e diz por quê', async () => {
  for (const [outcome, texto] of [['confirmar', 'confirmar'], ['sem_teto', 'teto'], ['teto_atingido', 'teto']] as const) {
    const { handler, c } = montar({ abertura: () => ({ outcome, reservationId: null }) })
    assertEquals((await (await chamar(handler)).json()).scanned, 0)
    assertEquals(c.runs.length, 0)
    assertEquals(c.fechamentos, [])
    assertEquals(c.aberturas.length, 1, 'para no primeiro pedido, sem tentar as outras Contas')
    assertEquals(c.fins[0].attempted, 0)
    assertEquals(c.fins[0].error?.toLowerCase().includes(texto), true, String(c.fins[0].error))
    assertEquals(c.fins[0].continuar, false)
  }
})

Deno.test('sem créditos ou no limite do participante: para o Monitoramento e avisa', async () => {
  const { handler, c } = montar({ abertura: () => ({ outcome: 'no_credits', reservationId: null }) })
  assertEquals((await (await chamar(handler)).json()).scanned, 0)
  assertEquals(c.runs.length, 0)
  assertEquals(c.fins[0].error?.includes('crédito'), true)
})

Deno.test('falha do Apify numa Conta: fecha sem cobrar, segue para a próxima e diz qual falhou', async () => {
  let i = 0
  const { handler, c } = montar({
    apify: () => {
      i++
      return i === 1
        ? Promise.reject(new ApifyRequestError(500))
        : Promise.resolve({ runId: 'run-2', items: [vaga('v2', '2026-09-29T10:00:00Z')] })
    },
  })
  assertEquals(await (await chamar(handler)).json(), { monitors: 1, scanned: 1, signals: 1 })
  assertEquals(c.fechamentos, [{ id: 'res-conta-alfa', success: false }, { id: 'res-conta-beta', success: true }])
  assertEquals(c.fins[0].attempted, 2)
  assertEquals(c.fins[0].error?.includes('Alfa'), true)
})

Deno.test('o adaptador ou a gravação do Sinal que quebram não cobram o cliente', async () => {
  const quebrado: AdaptadorDeSinal = { ...adaptador, sinais: () => { throw new Error('campo mudou') } }
  const a = montar({ adaptador: quebrado })
  assertEquals((await (await chamar(a.handler)).json()).scanned, 0)
  assertEquals(a.c.fechamentos.every((f) => f.success === false), true)
  assertEquals(a.c.fechamentos.length, 2)

  const b = montar({ recordSignal: () => Promise.reject(new Error('Conta arquivada')) })
  assertEquals((await (await chamar(b.handler)).json()).scanned, 0)
  assertEquals(b.c.fechamentos.every((f) => f.success === false), true)
})

Deno.test('sem adaptador ou com actor indisponível: o Monitoramento espera, sem abrir varredura nenhuma', async () => {
  const a = montar({ semAdaptador: true })
  assertEquals((await (await chamar(a.handler)).json()).scanned, 0)
  assertEquals(a.c.aberturas.length, 0)
  assertEquals(a.c.fins[0].error?.includes('adaptador'), true)
  const b = montar({ actor: { ...ACTOR, state: 'testing' } })
  assertEquals((await (await chamar(b.handler)).json()).scanned, 0)
  assertEquals(b.c.aberturas.length, 0)
  assertEquals(b.c.fins[0].error?.includes('disponível'), true)
})

Deno.test('acaba o tempo no meio: varre o que deu, pede para continuar já e o Monitoramento seguinte não é engolido', async () => {
  let t = AGORA
  const { handler, c } = montar({
    monitores: [monitor('mon-1'), monitor('mon-2')],
    agora: () => t,
    apify: () => {
      t += 80_000
      return Promise.resolve({ runId: 'r', items: [] })
    },
  })
  const r = await (await chamar(handler)).json()
  assertEquals(r.scanned, 1)
  assertEquals(c.fins[0].monitorId, 'mon-1')
  assertEquals(c.fins[0].attempted, 1)
  assertEquals(c.fins[0].error?.includes('1 de 2'), true)
  assertEquals(c.fins[0].continuar, true)
  // O segundo Monitoramento nem começou: solta a reserva e volta já, sem falha e sem avançar a rotação.
  assertEquals(c.fins[1], { monitorId: 'mon-2', attempted: 0, error: null, continuar: true })
  assertEquals(c.aberturas.filter((a) => a.accountId === 'conta-alfa').length, 1)
})

Deno.test('a data do Sinal: o inválido ou muito no futuro é descartado e o de poucas horas à frente vira agora', async () => {
  const datas: AdaptadorDeSinal = {
    ...adaptador,
    sinais: () => [
      { eventKey: 'a', phrase: 'A', firedAt: 'não é data' },
      { eventKey: 'b', phrase: 'B', firedAt: '2026-11-15T00:00:00Z' },
      { eventKey: 'c', phrase: 'C', firedAt: '2026-09-30T18:00:00Z' },
      { eventKey: 'd', phrase: 'D', firedAt: '2026-09-29T09:00:00Z' },
    ],
  }
  const { handler, c } = montar({ adaptador: datas, monitores: [monitor('mon-1', [ALFA])] })
  assertEquals((await (await chamar(handler)).json()).signals, 2)
  assertEquals(c.sinais.map((s) => [s.eventKey, s.firedAt]), [
    ['c', '2026-09-30T12:00:00.000Z'],
    ['d', '2026-09-29T09:00:00Z'],
  ])
})
