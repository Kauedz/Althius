import { assertEquals } from 'jsr:@std/assert@1'
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import type { ActorDoRegistro } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  type Cascatas,
  type ContaParaVarrer,
  createHandler,
  type Db,
  type Manuais,
  type MonitorReivindicado,
  type MotivoRegistradoDaRodada,
  type PedidoManual,
} from './handler.ts'

// O lote da Rodada (agente-de-sinal 05): o banco devolve só as Contas do lote (as que faltam dele, a partir do cursor da rotação)
// e o runner tenta exatamente essas. Quando o lote acaba a Rodada fecha sem pedir a continuação; a rotação e o limite do lote
// são do banco (pgTAP `ajustes_das_decisoes_do_agente_de_sinal.sql`). Aqui se confere o que o runner faz com o que recebe.

const WS = '11111111-1111-4111-8111-111111111111'
const HORARIO = '2026-10-26T11:00:00+00:00'
const AGORA = Date.parse('2026-10-26T11:04:00Z')
const conta = (n: number): ContaParaVarrer => ({
  id: `conta-${n}`, name: `Conta ${n}`, domain: `c${n}.test`, linkedinUrl: `https://www.linkedin.com/company/c${n}`,
})
// O lote de uma Rodada: as Contas 26 a 30 (o fim do lote de 5), depois de a rotação ter passado pelas 25 primeiras.
const LOTE = [26, 27, 28, 29, 30].map(conta)

const adaptador: AdaptadorDeSinal = {
  signalType: 'nova_lideranca',
  entrada: (c) => ({ input: { empresa: c.linkedinUrl }, maxItems: 5 }),
  sinais: (_itens, c, criterios, agora) => [
    { eventKey: `${c.id}|${String(criterios.cargo)}`, phrase: `Nova liderança em ${c.name}`, firedAt: new Date(agora).toISOString() },
  ],
}
const ACTOR: ActorDoRegistro = { actorId: 'harvestapi~linkedin-profile-search', signalType: 'nova_lideranca', state: 'available', version: null, maxCostUsd: 0.2 }

const monitor = (accounts: ContaParaVarrer[], extra: Partial<MonitorReivindicado> = {}): MonitorReivindicado => ({
  monitorId: 'mon-lote', workspaceId: WS, signalType: 'nova_lideranca', criteria: { cargo: 'CTO' }, createdBy: 'user-1', slot: HORARIO, accounts, ...extra,
})

function montar(opcoes: { monitores?: MonitorReivindicado[]; pedidos?: PedidoManual[]; cascatas?: Cascatas; agora?: () => number } = {}) {
  const c = {
    abertas: [] as string[],
    fins: [] as { attempted: number; continuar: boolean }[],
    pedidos: [] as { estado: string; tentadas: number }[],
    fornecedor: 0,
  }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve(opcoes.monitores ?? []),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: (a) => (c.abertas.push(a.accountId), Promise.resolve({ outcome: 'go', reservationId: `res-${a.accountId}` })),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_id, attempted, _erro, continuar) => (c.fins.push({ attempted, continuar }), Promise.resolve()),
    abrirRodada: () => Promise.resolve('rodada-1'),
    somarRodada: () => Promise.resolve(),
  }
  const manuais: Manuais = {
    claim: () => Promise.resolve(opcoes.pedidos ?? []),
    finish: (_id, estado, tentadas) => (c.pedidos.push({ estado, tentadas }), Promise.resolve()),
    kick: () => Promise.resolve(),
  }
  const handler = createHandler({
    db,
    apify: { run: () => (c.fornecedor++, Promise.resolve({ runId: 'run-1', items: [{}] })) },
    manuais,
    ...(opcoes.cascatas ? { cascatas: opcoes.cascatas } : {}),
    adaptadores: { nova_lideranca: adaptador },
    agora: opcoes.agora ?? (() => AGORA),
    log: () => {},
  })
  return { c, chamar: () => handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' })) }
}

Deno.test('a Rodada agendada tenta só as Contas do lote que o banco devolveu e fecha sem pedir a continuação', async () => {
  const { c, chamar } = montar({ monitores: [monitor(LOTE)] })
  await chamar()
  assertEquals(c.abertas, ['conta-26', 'conta-27', 'conta-28', 'conta-29', 'conta-30'])
  assertEquals(c.fornecedor, 5, 'o fornecedor só é consultado para as Contas do lote')
  assertEquals(c.fins, [{ attempted: 5, continuar: false }], 'o lote acabou: a rotação avança pelas 5 e a próxima Rodada é a da Agenda')
})

Deno.test('o que falta do lote na continuação é o que o runner recebe, e ele fecha quando acaba', async () => {
  let agora = AGORA
  let lenta = true
  const chamadas = [[monitor(LOTE)], [monitor(LOTE.slice(1))]]
  let n = 0
  const c = { abertas: [] as string[], fins: [] as { attempted: number; continuar: boolean }[] }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve(chamadas[n++] ?? []),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: (a) => (c.abertas.push(a.accountId), Promise.resolve({ outcome: 'go', reservationId: `res-${a.accountId}` })),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_id, attempted, _erro, continuar) => (c.fins.push({ attempted, continuar }), Promise.resolve()),
  }
  const handler = createHandler({
    db,
    // A primeira chamada tem tempo só para uma Conta (o fornecedor gasta 80 s dos 150 da função); a segunda é rápida.
    apify: { run: () => (lenta && (agora += 80_000), Promise.resolve({ runId: 'run-1', items: [{}] })) },
    adaptadores: { nova_lideranca: adaptador },
    agora: () => agora,
    log: () => {},
  })
  const chamar = () => handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))
  await chamar()
  assertEquals(c.fins, [{ attempted: 1, continuar: true }], 'a primeira chamada varre uma Conta do lote e pede a próxima já')
  agora = AGORA
  lenta = false
  await chamar()
  assertEquals(c.abertas, ['conta-26', 'conta-27', 'conta-28', 'conta-29', 'conta-30'], 'a continuação recebe só as 4 que faltam do lote')
  assertEquals(c.fins.at(-1), { attempted: 4, continuar: false }, 'e a Rodada fecha quando o lote acaba')
})

Deno.test('o pedido do Rodar agora tenta só as Contas do lote e termina como feito', async () => {
  const pedido: PedidoManual = {
    pedidoId: 'pedido-lote', workspaceId: WS, monitorId: 'mon-lote', signalType: 'nova_lideranca', criteria: { cargo: 'CTO' },
    requestedBy: 'user-1', requestedAt: HORARIO, accounts: LOTE.slice(0, 3),
  }
  const { c, chamar } = montar({ pedidos: [pedido] })
  await chamar()
  assertEquals(c.abertas, ['conta-26', 'conta-27', 'conta-28'])
  assertEquals(c.pedidos, [{ estado: 'feita', tentadas: 3 }], 'o pedido termina com as 3 tentadas, para o banco avançar o cursor da rotação')
})

const resultado = (): ResultadoDaCascata => ({
  desfecho: 'concluida', mensagem: '1 Sinal novo gravado.', creditosCobrados: 1, custoUsd: 0.02, sinais: [], novos: 1, repetidos: 0,
  semConta: 0, semContaNomes: [], mercado: [], passos: [],
})

Deno.test('a cascata recebe só o lote e a Rodada fecha com o tamanho do lote', async () => {
  const pedidos: PedidoDeCascata[] = []
  const cascatas: Cascatas = {
    ehCascata: () => Promise.resolve(true),
    rodar: (p) => (pedidos.push(p), Promise.resolve(resultado())),
  }
  const { c, chamar } = montar({ monitores: [monitor(LOTE, { signalType: 'vaga_comex' })], cascatas })
  await chamar()
  assertEquals(pedidos.map((p) => p.contas?.map((x) => x.id)), [['conta-26', 'conta-27', 'conta-28', 'conta-29', 'conta-30']])
  assertEquals(c.fins, [{ attempted: 5, continuar: false }], 'a rotação avança pelo lote inteiro')
})

Deno.test('as fontes que faltam continuam a mesma Rodada com o mesmo lote: só a Rodada que fecha avança a rotação', async () => {
  let agora = AGORA
  const pedidos: PedidoDeCascata[] = []
  const cascatas: Cascatas = {
    ehCascata: () => Promise.resolve(false),
    rodar: (p) => {
      pedidos.push(p)
      agora += 80_000 // a primeira cascata gasta o tempo de começar outra
      return Promise.resolve(resultado())
    },
    planoDoMonitor: () => Promise.resolve({ disponiveis: ['nova_planta_filial', 'novo_cd_ou_filial'], devidas: ['nova_planta_filial', 'novo_cd_ou_filial'] }),
  }
  const sem = { ...ACTOR, state: 'testing' as const }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve([monitor(LOTE, { signalType: 'novo_escritorio' })]),
    actorForType: () => Promise.resolve(sem),
    beginScan: () => Promise.resolve({ outcome: 'go', reservationId: 'r' }),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_id, attempted, _erro, continuar) => (fins.push({ attempted, continuar }), Promise.resolve()),
  }
  const fins: { attempted: number; continuar: boolean }[] = []
  const handler = createHandler({
    db, apify: { run: () => Promise.resolve({ runId: null, items: [] }) }, adaptadores: { nova_lideranca: adaptador }, cascatas,
    agora: () => agora, log: () => {},
  })
  await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))
  assertEquals(pedidos.length, 1, 'o tempo da função só deu para a primeira fonte')
  assertEquals(fins, [{ attempted: 0, continuar: true }], 'a continuação não gasta o lote: o banco devolve as mesmas Contas na chamada seguinte')
  // A chamada seguinte (o relógio volta já): a segunda fonte roda e a Rodada fecha com o lote inteiro.
  agora = AGORA
  cascatas.planoDoMonitor = () => Promise.resolve({ disponiveis: ['nova_planta_filial', 'novo_cd_ou_filial'], devidas: ['novo_cd_ou_filial'] })
  await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))
  assertEquals(fins.at(-1), { attempted: 5, continuar: false }, 'e só agora a rotação avança pelas 5 Contas do lote')
})

Deno.test('a Rodada perdida é um motivo registrado pelo banco', () => {
  const motivo: MotivoRegistradoDaRodada = 'perdida'
  assertEquals(motivo, 'perdida')
})
