import { assertEquals } from 'jsr:@std/assert@1'
import { type ActorDoRegistro, type Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  type BuscaReivindicada,
  type Buscas,
  createHandler,
  type Db,
  type ResultadoDaAbertura,
} from './handler.ts'

// A reativação de Sinais (sinais-reais, ticket 08): a mesma função que varre os Monitoramentos cuida da fila de buscas.
// Estes testes ficam à parte dos da varredura, e a fila só existe quando o index.ts a liga.

const WS = '11111111-1111-4111-8111-111111111111'
const PEDIDO = '2026-09-30T12:00:00+00:00'
const AGORA = Date.parse('2026-09-30T12:00:00Z')
const ALFA = { id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null }

const busca = (o: Partial<BuscaReivindicada> = {}): BuscaReivindicada => ({
  rescanId: 'busca-1',
  workspaceId: WS,
  origin: 'manual',
  requestedBy: 'user-1',
  requestedAt: PEDIDO,
  account: ALFA,
  monitors: [
    { monitorId: 'mon-vagas', signalType: 'vaga_linkedin', criteria: { palavras: ['dados'] } },
    { monitorId: 'mon-lideranca', signalType: 'nova_lideranca', criteria: {} },
  ],
  ...o,
})

const item = (id: string, data = '2026-09-28T10:00:00Z') => ({ id, titulo: `Item ${id}`, data })

const adaptadorDe = (signalType: string): AdaptadorDeSinal => ({
  signalType,
  entrada: (conta, criterios) => ({ input: { empresa: conta.name, palavras: criterios.palavras }, maxItems: 20 }),
  sinais: (itens, conta) =>
    (itens as { id: string; titulo: string; data: string }[]).map((i) => ({
      eventKey: `${conta.id}|${signalType}|${i.id}`,
      phrase: `${signalType}: ${i.titulo}`,
      firedAt: i.data,
      source: 'LinkedIn',
    })),
})

const actorDe = (signalType: string): ActorDoRegistro => ({
  actorId: `ator~${signalType}`,
  signalType,
  state: 'available',
  version: 'v1',
  maxCostUsd: 0.5,
})

interface Opcoes {
  buscas?: BuscaReivindicada[]
  monitoresDoRelogio?: number
  abertura?: (monitorId: string) => { outcome: ResultadoDaAbertura; reservationId: string | null }
  apify?: Apify['run']
  adaptadores?: Record<string, AdaptadorDeSinal>
  agora?: () => number
}

function montar(opcoes: Opcoes = {}) {
  const c = {
    eventos: [] as string[],
    aberturas: [] as { rescanId: string; monitorId: string }[],
    fechamentos: [] as { id: string; success: boolean }[],
    sinais: [] as { eventKey: string; monitorId: string; accountId: string }[],
    fins: [] as { rescanId: string; state: string; scanned: number; error: string | null }[],
    paradas: [] as { workspaceId: string; error: string }[],
    kicks: 0,
    runs: [] as { actorId: string }[],
  }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => {
      c.eventos.push('claim-monitores')
      return Promise.resolve(
        Array.from({ length: opcoes.monitoresDoRelogio ?? 0 }, (_, i) => ({
          monitorId: `mon-relogio-${i}`,
          workspaceId: WS,
          signalType: 'vaga_linkedin',
          criteria: {},
          createdBy: null,
          slot: PEDIDO,
          accounts: [ALFA],
        })),
      )
    },
    actorForType: (tipo) => Promise.resolve(actorDe(tipo)),
    beginScan: (a) => {
      c.eventos.push(`abre-monitor:${a.monitorId}`)
      return Promise.resolve({ outcome: 'go', reservationId: `res-${a.monitorId}` })
    },
    endScan: () => Promise.resolve(),
    recordSignal: (a) => (c.sinais.push({ eventKey: a.eventKey, monitorId: a.monitorId, accountId: a.accountId }), Promise.resolve(true)),
    recordCost: () => Promise.resolve(),
    finish: () => Promise.resolve(),
  }
  const buscas: Buscas = {
    claim: () => {
      c.eventos.push('claim-buscas')
      return Promise.resolve(opcoes.buscas ?? [busca()])
    },
    beginScan: (a) => {
      c.aberturas.push(a)
      c.eventos.push(`abre-busca:${a.monitorId}`)
      return Promise.resolve(
        opcoes.abertura ? opcoes.abertura(a.monitorId) : { outcome: 'go', reservationId: `res-${a.rescanId}-${a.monitorId}` },
      )
    },
    endScan: (_rescanId, id, success) => (c.fechamentos.push({ id, success }), Promise.resolve()),
    finish: (rescanId, state, scanned, error) => (c.fins.push({ rescanId, state, scanned, error }), Promise.resolve()),
    stopWorkspace: (workspaceId, error) => (c.paradas.push({ workspaceId, error }), Promise.resolve(3)),
    kick: () => (c.kicks++, Promise.resolve()),
  }
  const apify: Apify = {
    run: opcoes.apify ?? ((args) => {
      c.runs.push({ actorId: args.actorId })
      return Promise.resolve({ runId: 'run-1', items: [item('i1')] })
    }),
  }
  const handler = createHandler({
    db,
    apify,
    buscas,
    adaptadores: opcoes.adaptadores ?? { vaga_linkedin: adaptadorDe('vaga_linkedin'), nova_lideranca: adaptadorDe('nova_lideranca') },
    agora: opcoes.agora ?? (() => AGORA),
    log: () => {},
  })
  return { handler, c }
}

const chamar = (handler: (r: Request) => Promise<Response>) =>
  handler(new Request('http://x/signal-runner', { method: 'POST', headers: { 'x-runner-token': 'qualquer' }, body: '{}' }))

Deno.test('a busca do clique varre a Conta com cada Monitoramento ativo, grava os Sinais e conclui', async () => {
  const { handler, c } = montar()
  const r = await chamar(handler)
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { monitors: 0, scanned: 0, signals: 0, rescans: { count: 1, scanned: 2, signals: 2 } })
  assertEquals(c.aberturas, [
    { rescanId: 'busca-1', monitorId: 'mon-vagas' },
    { rescanId: 'busca-1', monitorId: 'mon-lideranca' },
  ])
  assertEquals(c.runs.map((x) => x.actorId), ['ator~vaga_linkedin', 'ator~nova_lideranca'])
  assertEquals(c.sinais.map((s) => [s.monitorId, s.accountId]), [['mon-vagas', 'conta-alfa'], ['mon-lideranca', 'conta-alfa']])
  assertEquals(c.fechamentos, [{ id: 'res-busca-1-mon-vagas', success: true }, { id: 'res-busca-1-mon-lideranca', success: true }])
  assertEquals(c.fins, [{ rescanId: 'busca-1', state: 'done', scanned: 2, error: null }])
  assertEquals(c.kicks, 0)
})

Deno.test('a busca vem antes dos Monitoramentos do relógio, que esperam o clique de quem está olhando', async () => {
  const { handler, c } = montar({ monitoresDoRelogio: 1 })
  await chamar(handler)
  assertEquals(c.eventos, ['claim-buscas', 'abre-busca:mon-vagas', 'abre-busca:mon-lideranca', 'claim-monitores', 'abre-monitor:mon-relogio-0'])
})

Deno.test('a varredura que falha não é cobrada; as outras seguem e a busca conclui dizendo quantas falharam', async () => {
  let chamadas = 0
  const { handler, c } = montar({
    apify: (args) => {
      chamadas++
      if (chamadas === 1) return Promise.reject(new Error('Apify fora do ar'))
      c.runs.push({ actorId: args.actorId })
      return Promise.resolve({ runId: 'run-2', items: [item('i2')] })
    },
  })
  assertEquals((await chamar(handler)).status, 200)
  assertEquals(c.fechamentos, [{ id: 'res-busca-1-mon-vagas', success: false }, { id: 'res-busca-1-mon-lideranca', success: true }])
  assertEquals(c.fins, [{ rescanId: 'busca-1', state: 'done', scanned: 1, error: '1 varredura falhou; tente de novo mais tarde.' }])
})

Deno.test('sem saldo, a busca do clique para com o motivo e não roda o actor', async () => {
  const { handler, c } = montar({ abertura: () => ({ outcome: 'no_credits', reservationId: null }) })
  await chamar(handler)
  assertEquals(c.runs, [])
  assertEquals(c.fins, [{
    rescanId: 'busca-1',
    state: 'stopped',
    scanned: 0,
    error: 'Sem créditos ou no limite mensal de quem pediu: a busca parou.',
  }])
  assertEquals(c.paradas, [])
})

Deno.test('no teto, a busca mensal para e para as outras buscas mensais do Workspace de uma vez', async () => {
  const { handler, c } = montar({
    buscas: [busca({ origin: 'mensal', requestedBy: null })],
    abertura: () => ({ outcome: 'teto_atingido', reservationId: null }),
  })
  await chamar(handler)
  assertEquals(c.fins.map((f) => [f.state, f.error]), [[
    'stopped',
    'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.',
  ]])
  assertEquals(c.paradas, [{
    workspaceId: WS,
    error: 'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.',
  }])
})

Deno.test('a busca do clique que bate no limite não para as buscas mensais dos outros', async () => {
  const { handler, c } = montar({ abertura: () => ({ outcome: 'no_credits', reservationId: null }) })
  await chamar(handler)
  assertEquals(c.paradas, [])
})

Deno.test('Monitoramento sem adaptador não é cobrado; se nenhum tem, a busca para dizendo por quê', async () => {
  const { handler, c } = montar({ adaptadores: {} })
  await chamar(handler)
  assertEquals(c.aberturas, [])
  assertEquals(c.fins, [{
    rescanId: 'busca-1',
    state: 'stopped',
    scanned: 0,
    error: 'Ainda não há adaptador para os Sinais dos Monitoramentos ativos.',
  }])
})

Deno.test('quando o tempo da função acaba no meio, a busca volta à fila e o relógio é chamado de novo', async () => {
  let agora = AGORA
  const { handler, c } = montar({
    apify: (args) => {
      c.runs.push({ actorId: args.actorId })
      agora += 80_000
      return Promise.resolve({ runId: 'run-1', items: [item('i1')] })
    },
    agora: () => agora,
  })
  await chamar(handler)
  assertEquals(c.aberturas.length, 1)
  assertEquals(c.fins, [{ rescanId: 'busca-1', state: 'pending', scanned: 1, error: 'Varridos 1 de 2 Monitoramentos; o resto na próxima rodada.' }])
  assertEquals(c.kicks, 1)
})

Deno.test('uma volta que falha inesperadamente devolve a busca à fila, sem derrubar as outras', async () => {
  let aberturas = 0
  const { handler, c } = montar({
    buscas: [busca({ rescanId: 'busca-1' }), busca({ rescanId: 'busca-2' })],
    abertura: (monitorId) => {
      if (++aberturas === 1) throw new Error('banco fora do ar')
      return { outcome: 'go', reservationId: `res-${monitorId}` }
    },
  })
  assertEquals((await chamar(handler)).status, 200)
  assertEquals(c.fins.map((f) => [f.rescanId, f.state]), [['busca-1', 'pending'], ['busca-2', 'done']])
})

Deno.test('sem a fila ligada, o handler segue só com os Monitoramentos e devolve a resposta de sempre', async () => {
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve([]),
    actorForType: () => Promise.resolve(null),
    beginScan: () => Promise.reject(new Error('não devia abrir')),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: () => Promise.resolve(),
  }
  const handler = createHandler({ db, apify: { run: () => Promise.reject(new Error('não devia rodar')) }, adaptadores: {}, log: () => {} })
  assertEquals(await (await chamar(handler)).json(), { monitors: 0, scanned: 0, signals: 0 })
})
