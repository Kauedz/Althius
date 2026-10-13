// O Monitoramento de um Sinal em cascata (sinais em cascata, fatia 2): a varredura chama o MESMO motor da conversa, uma
// vez por rodada, com a chave do Monitoramento e da hora marcada; não abre a varredura por Conta (a reserva é a da
// cascata), não roda actor por conta própria e deixa o motivo, em palavras do produto, no Monitoramento.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { ResultadoDaCascata, PedidoDeCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import { MARCA_INTERNA } from '../_shared/marca.ts'
import { type Cascatas, createHandler, type Db, type MonitorReivindicado } from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const SLOT = '2026-10-13T12:00:00+00:00'
const MONITOR: MonitorReivindicado = {
  monitorId: 'mon-1', workspaceId: WS, signalType: 'vaga_comex', criteria: { termos: ['analista de comex'] }, createdBy: 'user-1', slot: SLOT,
  accounts: [
    { id: 'c1', name: 'Alfa', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa', cnpj: '11222333000181' },
    { id: 'c2', name: 'Beta', domain: null, linkedinUrl: null },
  ],
}

const resultado = (extra: Partial<ResultadoDaCascata> = {}): ResultadoDaCascata => ({
  desfecho: 'concluida', mensagem: '1 Sinal novo gravado.', creditosCobrados: 1, custoUsd: 0.02, sinais: [], novos: 1, repetidos: 0, semConta: 0, passos: [], ...extra,
})

function montar(r: ResultadoDaCascata | Error, tipos = ['vaga_comex']) {
  const c = { pedidos: [] as PedidoDeCascata[], fins: [] as { attempted: number; error: string | null; continuar: boolean }[], aberturas: 0, runs: 0 }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve([MONITOR]),
    actorForType: () => Promise.resolve(null),
    beginScan: () => (c.aberturas++, Promise.resolve({ outcome: 'go', reservationId: 'r' })),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_m, attempted, error, continuar) => (c.fins.push({ attempted, error, continuar }), Promise.resolve()),
  }
  const cascatas: Cascatas = {
    ehCascata: (t) => Promise.resolve(tipos.includes(t)),
    rodar: (p) => {
      c.pedidos.push(p)
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    },
  }
  const handler = createHandler({
    db, apify: { run: () => (c.runs++, Promise.resolve({ runId: null, items: [] })) }, adaptadores: {}, cascatas,
    agora: () => Date.parse('2026-10-13T12:00:00Z'), log: () => {},
  })
  return { c, chamar: async () => await (await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))).json() }
}

Deno.test('o Monitoramento da cascata roda uma vez, com a chave do Monitoramento e do slot, as Contas e os critérios', async () => {
  const { c, chamar } = montar(resultado())
  const corpo = await chamar()
  assertEquals(c.pedidos.length, 1)
  const p = c.pedidos[0]
  assertEquals([p.workspaceId, p.userId, p.signalType, p.origem, p.monitorId, p.chave], [WS, 'user-1', 'vaga_comex', 'monitor', 'mon-1', `monitor:mon-1:${SLOT}`])
  assertEquals(p.contas?.map((x) => [x.id, x.cnpj ?? null]), [['c1', '11222333000181'], ['c2', null]])
  assertEquals(p.criterios, { termos: ['analista de comex'] })
  assert(p.prazoFinal !== undefined && p.prazoFinal > Date.parse('2026-10-13T12:00:00Z'), 'a cascata recebe o prazo da função')
  // Nada do caminho por Conta: sem abrir varredura, sem actor por conta própria.
  assertEquals([c.aberturas, c.runs], [0, 0])
  assertEquals(c.fins, [{ attempted: 2, error: null, continuar: false }])
  assertEquals([corpo.scanned, corpo.signals], [2, 1])
})

Deno.test('cada recusa ou falha da cascata fica no Monitoramento em palavras do produto', async () => {
  const casos: [Partial<ResultadoDaCascata>, string | null][] = [
    [{ desfecho: 'sem_creditos', mensagem: 'O Workspace não tem créditos suficientes para essa busca.', novos: 0 }, 'O Workspace não tem créditos suficientes para essa busca.'],
    [{ desfecho: 'falhou', mensagem: 'Sem saldo na fonte de dados; avisamos a equipe.', novos: 0 }, 'Sem saldo na fonte de dados; avisamos a equipe.'],
    [{ desfecho: 'automatico_parado', mensagem: 'A varredura automática está parada.', novos: 0 }, 'A varredura automática está parada.'],
    [{ desfecho: 'ja_rodou_hoje', mensagem: 'Esse Monitoramento já rodou hoje.', novos: 0 }, null],
    [{ desfecho: 'parcial', mensagem: 'Alguns Sinais não puderam ser gravados agora; tente de novo mais tarde.' }, 'Alguns Sinais não puderam ser gravados agora; tente de novo mais tarde.'],
    [{ desfecho: 'abortada', mensagem: 'Paramos antes de gastar além do teto da busca; só o que já foi consumido é cobrado.', novos: 0 }, 'Paramos antes de gastar além do teto da busca; só o que já foi consumido é cobrado.'],
  ]
  for (const [extra, esperado] of casos) {
    const { c, chamar } = montar(resultado(extra))
    await chamar()
    assertEquals(c.fins[0].error, esperado, String(extra.desfecho))
    assert(c.fins[0].error === null || !MARCA_INTERNA.test(c.fins[0].error))
    assertEquals(c.fins[0].continuar, false)
  }
})

Deno.test('a exceção do motor não derruba a rodada: o Monitoramento fecha com um motivo neutro', async () => {
  const { c, chamar } = montar(new Error('begin_cascade_run: 22023 invalid cascade request apify'))
  await chamar()
  assertEquals(c.fins.length, 1)
  assertEquals(c.fins[0].error, 'A rodada falhou; tentamos de novo na próxima.')
})

Deno.test('o tipo que não é cascata segue o caminho de sempre (sem adaptador, o Monitoramento espera)', async () => {
  const { c, chamar } = montar(resultado(), [])
  await chamar()
  assertEquals(c.pedidos.length, 0)
  assertEquals(c.fins[0].error, 'Ainda não há adaptador para o Sinal vaga_comex.')
})
