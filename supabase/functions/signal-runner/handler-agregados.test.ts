// O Monitoramento de um tipo genérico do catálogo (novo escritório, expansão geográfica, abertura de vagas...) que as
// cascatas do Mapa de Mercado atendem. O banco diz quais cascatas atendem o tipo, quais estão disponíveis e quais estão
// no prazo da cadência delas; o runner roda cada uma pelo MESMO motor, uma reserva de crédito por cascata, e grava o
// Sinal no tipo genérico. O tipo com actor disponível segue o caminho do actor.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import { MARCA_INTERNA } from '../_shared/marca.ts'
import type { ActorDoRegistro } from '../signal-scan/handler.ts'
import { type AdaptadorDeSinal, type Cascatas, createHandler, type Db, type MonitorReivindicado } from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const SLOT = '2026-10-13T12:00:00+00:00'
const AGORA = Date.parse('2026-10-13T12:00:00Z')
const MONITOR: MonitorReivindicado = {
  monitorId: 'mon-1', workspaceId: WS, signalType: 'novo_escritorio', criteria: {}, createdBy: 'user-1', slot: SLOT,
  accounts: [
    { id: 'c1', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null, cnpj: '11222333000181' },
    { id: 'c2', name: 'Beta', domain: null, linkedinUrl: null },
  ],
}

const ACTOR_DISPONIVEL: ActorDoRegistro = {
  actorId: 'curious_coder~linkedin-jobs-scraper', signalType: 'vaga_linkedin', state: 'available', version: null, maxCostUsd: 1,
}
const ADAPTADOR: AdaptadorDeSinal = { signalType: 'vaga_linkedin', entrada: () => ({ input: {}, maxItems: 1 }), sinais: () => [] }

const resultado = (extra: Partial<ResultadoDaCascata> = {}): ResultadoDaCascata => ({
  desfecho: 'concluida', mensagem: '1 Sinal novo gravado.', creditosCobrados: 1, custoUsd: 0.02, sinais: [], novos: 1, repetidos: 0,
  semConta: 0, semContaNomes: [], mercado: [], passos: [], ...extra,
})

interface Montagem {
  monitor?: MonitorReivindicado
  /** O plano do banco: as cascatas do tipo que estão disponíveis e as que estão no prazo. */
  plano?: { disponiveis: string[]; devidas: string[] }
  respostas?: Record<string, ResultadoDaCascata | Error>
  actor?: ActorDoRegistro | null
  adaptadores?: Record<string, AdaptadorDeSinal>
  agora?: () => number
}

function montar(o: Montagem = {}) {
  const monitor = o.monitor ?? MONITOR
  const c = {
    pedidos: [] as PedidoDeCascata[],
    fins: [] as { attempted: number; error: string | null; continuar: boolean }[],
    planos: [] as string[],
    aberturas: 0,
    runs: 0,
  }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve([monitor]),
    actorForType: () => Promise.resolve(o.actor ?? null),
    beginScan: () => (c.aberturas++, Promise.resolve({ outcome: 'go', reservationId: 'r' })),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_m, attempted, error, continuar) => (c.fins.push({ attempted, error, continuar }), Promise.resolve()),
  }
  const cascatas: Cascatas = {
    ehCascata: () => Promise.resolve(false),
    rodar: (p) => {
      c.pedidos.push(p)
      const r = o.respostas?.[p.signalType] ?? resultado()
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    },
    planoDoMonitor: (monitorId) => {
      c.planos.push(monitorId)
      return Promise.resolve(o.plano ?? { disponiveis: [], devidas: [] })
    },
  }
  const handler = createHandler({
    db, apify: { run: () => (c.runs++, Promise.resolve({ runId: null, items: [] })) },
    adaptadores: o.adaptadores ?? {}, cascatas, agora: o.agora ?? (() => AGORA), log: () => {},
  })
  return { c, chamar: async () => await (await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))).json() }
}

Deno.test('o tipo genérico roda cada cascata devida pelo mesmo motor, e o Sinal é gravado no tipo genérico', async () => {
  const { c, chamar } = montar({
    plano: { disponiveis: ['nova_planta_filial', 'novo_cd_ou_filial', 'troca_de_sede'], devidas: ['nova_planta_filial', 'novo_cd_ou_filial'] },
    respostas: { nova_planta_filial: resultado({ novos: 2 }), novo_cd_ou_filial: resultado({ novos: 1 }) },
  })
  const corpo = await chamar()
  assertEquals(c.planos, ['mon-1'])
  assertEquals(c.pedidos.map((p) => p.signalType), ['nova_planta_filial', 'novo_cd_ou_filial'])
  for (const p of c.pedidos) {
    assertEquals([p.workspaceId, p.userId, p.origem, p.monitorId, p.registrarComo], [WS, 'user-1', 'monitor', 'mon-1', 'novo_escritorio'])
    assertEquals(p.contas?.map((x) => [x.id, x.cnpj ?? null]), [['c1', '11222333000181'], ['c2', null]])
  }
  // Cada cascata tem a sua reserva de crédito: a chave junta o Monitoramento, a hora marcada e a cascata.
  assertEquals(c.pedidos.map((p) => p.chave), [`monitor:mon-1:${SLOT}:nova_planta_filial`, `monitor:mon-1:${SLOT}:novo_cd_ou_filial`])
  assert(c.pedidos.every((p) => p.prazoFinal !== undefined && p.prazoFinal > AGORA))
  // Nada do caminho por Conta nem do actor.
  assertEquals([c.aberturas, c.runs], [0, 0])
  assertEquals(c.fins, [{ attempted: 2, error: null, continuar: false }])
  assertEquals([corpo.scanned, corpo.signals], [2, 3])
})

Deno.test('o Monitoramento recebe os critérios que o usuário deu, para cada cascata', async () => {
  const monitor = { ...MONITOR, signalType: 'vaga_linkedin', criteria: { localizacao: ['Brasil'], periodo: 'Últimos 7 dias' } }
  const { c, chamar } = montar({ monitor, plano: { disponiveis: ['vaga_comex'], devidas: ['vaga_comex'] } })
  await chamar()
  assertEquals(c.pedidos.length, 1)
  assertEquals([c.pedidos[0].signalType, c.pedidos[0].registrarComo], ['vaga_comex', 'vaga_linkedin'])
  assertEquals(c.pedidos[0].criterios, { localizacao: ['Brasil'], periodo: 'Últimos 7 dias' })
})

Deno.test('nenhuma cascata no prazo da cadência: nada roda, nada é cobrado e o Monitoramento não tem falha', async () => {
  const { c, chamar } = montar({ plano: { disponiveis: ['nova_planta_filial'], devidas: [] } })
  const corpo = await chamar()
  assertEquals(c.pedidos.length, 0)
  assertEquals(c.fins, [{ attempted: 2, error: null, continuar: false }])
  assertEquals([corpo.scanned, corpo.signals], [0, 0])
})

Deno.test('o tipo com actor disponível segue o caminho do actor, sem consultar as cascatas', async () => {
  const monitor = { ...MONITOR, signalType: 'vaga_linkedin' }
  const { c, chamar } = montar({
    monitor,
    actor: ACTOR_DISPONIVEL,
    adaptadores: { vaga_linkedin: ADAPTADOR },
    plano: { disponiveis: ['vaga_comex'], devidas: ['vaga_comex'] },
  })
  await chamar()
  assertEquals(c.planos, [])
  assertEquals(c.pedidos.length, 0)
  assertEquals(c.aberturas, 2, 'o actor varreu as duas Contas, como sempre')
})

Deno.test('o tipo com actor que não está disponível cai nas cascatas', async () => {
  const monitor = { ...MONITOR, signalType: 'vaga_linkedin' }
  const { c, chamar } = montar({
    monitor,
    actor: { ...ACTOR_DISPONIVEL, state: 'testing' },
    adaptadores: { vaga_linkedin: ADAPTADOR },
    plano: { disponiveis: ['vaga_comex'], devidas: ['vaga_comex'] },
  })
  await chamar()
  assertEquals(c.pedidos.map((p) => p.signalType), ['vaga_comex'])
  assertEquals(c.aberturas, 0)
})

Deno.test('o tipo sem cascata disponível segue o caminho de sempre (sem adaptador, o Monitoramento espera)', async () => {
  const { c, chamar } = montar({ plano: { disponiveis: [], devidas: [] } })
  await chamar()
  assertEquals(c.pedidos.length, 0)
  assertEquals(c.fins[0].error, 'Ainda não há adaptador para o Sinal novo_escritorio.')
})

Deno.test('uma cascata que falha não derruba as outras, e o motivo fica no Monitoramento em palavras do produto', async () => {
  const { c, chamar } = montar({
    plano: { disponiveis: ['nova_planta_filial', 'novo_cd_ou_filial'], devidas: ['nova_planta_filial', 'novo_cd_ou_filial'] },
    respostas: {
      nova_planta_filial: new Error('begin_cascade_run: 22023 invalid cascade request apify'),
      novo_cd_ou_filial: resultado({ desfecho: 'sem_creditos', mensagem: 'O Workspace não tem créditos suficientes para essa busca.', novos: 0 }),
    },
  })
  const corpo = await chamar()
  assertEquals(c.pedidos.length, 2)
  assertEquals(c.fins.length, 1)
  const erro = c.fins[0].error!
  assert(erro.includes('A rodada falhou; tentamos de novo na próxima.'), erro)
  assert(erro.includes('O Workspace não tem créditos suficientes para essa busca.'), erro)
  assert(!MARCA_INTERNA.test(erro), erro)
  assertEquals(corpo.signals, 0)
})

Deno.test('mensagens iguais de cascatas diferentes aparecem uma vez; já rodou hoje não é falha', async () => {
  const { c, chamar } = montar({
    plano: { disponiveis: ['a', 'b', 'c'], devidas: ['a', 'b', 'c'] },
    respostas: {
      a: resultado({ desfecho: 'parcial', mensagem: 'Nossa busca não respondeu a tempo.', novos: 0 }),
      b: resultado({ desfecho: 'parcial', mensagem: 'Nossa busca não respondeu a tempo.', novos: 0 }),
      c: resultado({ desfecho: 'ja_rodou_hoje', mensagem: 'Esse Monitoramento já rodou hoje.', novos: 0 }),
    },
  })
  await chamar()
  assertEquals(c.fins[0].error, 'Nossa busca não respondeu a tempo.')
})

Deno.test('o tempo acabando no meio: as cascatas que faltam ficam devidas e o Monitoramento volta já', async () => {
  let t = AGORA
  const { c, chamar } = montar({
    plano: { disponiveis: ['a', 'b', 'c'], devidas: ['a', 'b', 'c'] },
    agora: () => t,
    respostas: { a: resultado({ novos: 1 }) },
  })
  // A primeira cascata consome o tempo todo da função.
  const original = c.pedidos.push.bind(c.pedidos)
  c.pedidos.push = (...p: PedidoDeCascata[]) => {
    t += 200_000
    return original(...p)
  }
  const corpo = await chamar()
  assertEquals(c.pedidos.map((p) => p.signalType), ['a'])
  assertEquals(c.fins.length, 1)
  assertEquals(c.fins[0].continuar, true)
  assert(c.fins[0].error?.includes('1 de 3'), String(c.fins[0].error))
  assert(!MARCA_INTERNA.test(c.fins[0].error ?? ''))
  assertEquals(corpo.signals, 1)
})
