// Abertura de vagas no mercado endereçável: o Monitoramento com escopo 'mercado' roda a cascata da descoberta, sem Conta-alvo,
// com o preço fixo da rodada como teto de créditos e a chave do Monitoramento e da hora marcada. O Monitoramento de
// Contas-alvo segue o caminho de sempre, pelo actor e por Conta.
import { assertEquals } from 'jsr:@std/assert@1'
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import { CASCATA_DO_MERCADO, CREDITOS_POR_RODADA_NO_MERCADO } from '../_shared/cascata-de-sinais/passos/vagas-mercado.ts'
import { type AdaptadorDeSinal, type Cascatas, createHandler, type Db, type MonitorReivindicado } from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const SLOT = '2026-10-21T12:00:00+00:00'
const CRITERIOS = { nicho: 'custom', nichoCustom: 'Óleo e gás', funcoes: ['SDR', 'BDR'], localizacao: ['Brasil'], estado: 'Rio de Janeiro' }
const MERCADO: MonitorReivindicado = {
  monitorId: 'mon-mercado', workspaceId: WS, signalType: 'vaga_linkedin', criteria: CRITERIOS, createdBy: 'user-1', slot: SLOT, accounts: [],
}
const CONTAS: MonitorReivindicado = {
  monitorId: 'mon-contas', workspaceId: WS, signalType: 'vaga_linkedin', criteria: { funcoes: ['SDR'] }, createdBy: 'user-1', slot: SLOT,
  accounts: [{ id: 'c1', name: 'Alfa', domain: 'alfa.test', linkedinUrl: null }],
}
const MERCADO_GENERICO: MonitorReivindicado = {
  monitorId: 'mon-mercado-generico', workspaceId: WS, signalType: 'anuncio_meta', criteria: CRITERIOS, createdBy: 'user-1', slot: SLOT, accounts: [],
}

const resultado = (extra: Partial<ResultadoDaCascata> = {}): ResultadoDaCascata => ({
  desfecho: 'concluida', mensagem: 'A busca terminou.', creditosCobrados: 4, custoUsd: 0.25, sinais: [], novos: 1, repetidos: 0,
  semConta: 3, semContaNomes: [], candidatas: 3, mercado: [], passos: [], ...extra,
})

const adaptador: AdaptadorDeSinal = {
  signalType: 'vaga_linkedin',
  entrada: () => ({ input: {}, maxItems: 1 }),
  sinais: () => [],
}

function montar(monitores: MonitorReivindicado[], r: ResultadoDaCascata = resultado(), comEscopo = true) {
  const c = { pedidos: [] as PedidoDeCascata[], fins: [] as { monitorId: string; attempted: number; error: string | null }[], aberturas: 0, runs: 0 }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve(monitores),
    actorForType: () =>
      Promise.resolve({ actorId: 'curious_coder~linkedin-jobs-scraper', signalType: 'vaga_linkedin', state: 'available', version: 'v1', maxCostUsd: 0.5 }),
    beginScan: () => (c.aberturas++, Promise.resolve({ outcome: 'go', reservationId: 'r' })),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (monitorId, attempted, error) => (c.fins.push({ monitorId, attempted, error }), Promise.resolve()),
    ...(comEscopo ? { escopo: (id: string) => Promise.resolve(id === 'mon-mercado' || id === 'mon-mercado-generico' ? 'mercado' as const : 'contas' as const) } : {}),
  }
  const cascatas: Cascatas = {
    ehCascata: () => Promise.resolve(false),
    rodar: (p) => (c.pedidos.push(p), Promise.resolve(r)),
  }
  const handler = createHandler({
    db, apify: { run: () => (c.runs++, Promise.resolve({ runId: null, items: [] })) }, adaptadores: { vaga_linkedin: adaptador }, cascatas,
    agora: () => Date.parse('2026-10-21T12:00:00Z'), log: () => {},
  })
  return { c, chamar: async () => await (await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))).json() }
}

Deno.test('o Monitoramento de mercado roda a cascata da descoberta, sem Contas, com o teto de 4 créditos', async () => {
  const { c, chamar } = montar([MERCADO])
  const corpo = await chamar()
  assertEquals(c.pedidos.length, 1)
  const p = c.pedidos[0]
  assertEquals(
    [p.signalType, p.registrarComo, p.origem, p.monitorId, p.chave, p.descoberta, p.tetoCreditos],
    [CASCATA_DO_MERCADO, 'vaga_linkedin', 'monitor', 'mon-mercado', `monitor:mon-mercado:${SLOT}:mercado:${CASCATA_DO_MERCADO}`, true, 4],
  )
  assertEquals(CREDITOS_POR_RODADA_NO_MERCADO, 4)
  assertEquals(p.contas, undefined, 'as Contas do Workspace a cascata lê sozinha, só para casar')
  assertEquals(p.criterios, CRITERIOS)
  // Nada do caminho por Conta: nem varredura aberta, nem actor rodado fora da cascata.
  assertEquals([c.aberturas, c.runs], [0, 0])
  assertEquals(c.fins, [{ monitorId: 'mon-mercado', attempted: 0, error: null }])
  assertEquals(corpo.signals, 1)
})

Deno.test('a recusa da descoberta (em validação, sem crédito, sem contrato) fica no Monitoramento em palavras do produto', async () => {
  const { c, chamar } = montar([MERCADO], resultado({ desfecho: 'em_teste', mensagem: 'Essa busca ainda está em validação e não roda neste Workspace.', novos: 0 }))
  await chamar()
  assertEquals(c.fins[0].error, 'Essa busca ainda está em validação e não roda neste Workspace.')
})

Deno.test('uma fonte de descoberta usa a própria cascata e mantém o tipo público do Monitoramento', async () => {
  const { c, chamar } = montar([MERCADO_GENERICO])
  await chamar()
  assertEquals(c.pedidos.length, 1)
  assertEquals(c.pedidos[0].signalType, 'anuncio_meta')
  assertEquals(c.pedidos[0].registrarComo, 'anuncio_meta')
  assertEquals(c.pedidos[0].descoberta, true)
  assertEquals(c.pedidos[0].chave, `monitor:mon-mercado-generico:${SLOT}:mercado:anuncio_meta`)
})

Deno.test('o Monitoramento de Contas-alvo segue pelo actor, Conta por Conta, como antes', async () => {
  const { c, chamar } = montar([CONTAS])
  await chamar()
  assertEquals(c.pedidos.length, 0)
  assertEquals([c.aberturas, c.runs], [1, 1])
  assertEquals(c.fins, [{ monitorId: 'mon-contas', attempted: 1, error: null }])
})

Deno.test('sem a leitura do escopo, todo Monitoramento é de Contas-alvo', async () => {
  const { c, chamar } = montar([CONTAS], resultado(), false)
  await chamar()
  assertEquals(c.pedidos.length, 0)
  assertEquals(c.aberturas, 1)
})
