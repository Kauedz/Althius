import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { ActorDoRegistro, Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  type ContaParaVarrer,
  createHandler,
  type Db,
  type Manuais,
  type MonitorReivindicado,
  type PedidoManual,
  type ResultadoDaAbertura,
  type ResumoDaRodada,
  SemDadoParaVarrer,
} from './handler.ts'

// Rodar agora e o registro da Rodada (agente-de-sinal 02): o pedido de uma pessoa roda o Plano só nas Contas do escopo, cobra
// o crédito de cada Conta verificada sem tocar no Teto de automação, grava a Rodada e continua na chamada seguinte sem cobrar
// a mesma Conta duas vezes. Toda Rodada agendada também ganha a sua linha.

const WS = '11111111-1111-4111-8111-111111111111'
const PEDIDO_EM = '2026-10-23T12:00:00+00:00'
const AGORA = Date.parse('2026-10-23T12:00:30Z')
const ALFA: ContaParaVarrer = { id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa' }
const BETA: ContaParaVarrer = { id: 'conta-beta', name: 'Beta', domain: 'beta.test', linkedinUrl: 'https://www.linkedin.com/company/beta' }
const GAMA: ContaParaVarrer = { id: 'conta-gama', name: 'Gama', domain: 'gama.test', linkedinUrl: null }

const pedido = (o: Partial<PedidoManual> = {}): PedidoManual => ({
  pedidoId: 'pedido-1',
  workspaceId: WS,
  monitorId: 'mon-1',
  signalType: 'nova_lideranca',
  criteria: { cargo: 'CTO' },
  requestedBy: 'user-1',
  requestedAt: PEDIDO_EM,
  accounts: [ALFA, BETA, GAMA],
  ...o,
})

const MOTIVO_SEM_PAGINA = 'Contas sem a página da empresa no LinkedIn ficaram de fora'

// Um adaptador de mentira que, como o da Nova liderança, pula a Conta sem a página da empresa no LinkedIn.
const adaptador: AdaptadorDeSinal = {
  signalType: 'nova_lideranca',
  entrada(conta) {
    if (!conta.linkedinUrl) throw new SemDadoParaVarrer(MOTIVO_SEM_PAGINA)
    return { input: { empresa: conta.linkedinUrl }, maxItems: 5 }
  },
  sinais: (_itens, conta, criterios, agora) => [
    { eventKey: `${conta.id}|${String(criterios.cargo)}`, phrase: `Nova liderança em ${conta.name}`, firedAt: new Date(agora).toISOString() },
  ],
}

const ACTOR: ActorDoRegistro = { actorId: 'harvestapi~linkedin-profile-search', signalType: 'nova_lideranca', state: 'available', version: null, maxCostUsd: 0.2 }

interface Opcoes {
  pedidos?: PedidoManual[]
  abertura?: (accountId: string) => { outcome: ResultadoDaAbertura; reservationId: string | null }
  agora?: () => number
  monitoresDoRelogio?: MonitorReivindicado[]
  semRegistro?: boolean
  recordSignal?: (eventKey: string) => boolean
  apify?: Apify['run']
  actor?: ActorDoRegistro | null
}

function montar(opcoes: Opcoes = {}) {
  const c = {
    eventos: [] as string[],
    aberturas: [] as { accountId: string; origem: string | undefined; pedidoId: string | undefined; userId: string | null; slot: string }[],
    fechamentos: [] as { id: string; success: boolean }[],
    sinais: [] as { eventKey: string; monitorId: string; runId: string | null | undefined }[],
    rodadasAbertas: [] as { monitorId: string; slot: string; pedidoId?: string }[],
    somas: [] as { rodadaId: string; resumo: ResumoDaRodada }[],
    pedidos: [] as { pedidoId: string; estado: string; tentadas: number; erro: string | null }[],
    fins: [] as { monitorId: string; attempted: number; error: string | null; continuar: boolean }[],
    runs: 0,
    kicks: 0,
  }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => {
      c.eventos.push('claim-monitores')
      return Promise.resolve(opcoes.monitoresDoRelogio ?? [])
    },
    actorForType: () => Promise.resolve(opcoes.actor === undefined ? ACTOR : opcoes.actor),
    beginScan: (a) => {
      c.aberturas.push({ accountId: a.accountId, origem: a.origem, pedidoId: a.pedidoId, userId: a.userId, slot: a.slot })
      c.eventos.push(`abre:${a.accountId}`)
      return Promise.resolve(opcoes.abertura ? opcoes.abertura(a.accountId) : { outcome: 'go', reservationId: `res-${a.accountId}` })
    },
    endScan: (id, success) => (c.fechamentos.push({ id, success }), Promise.resolve()),
    recordSignal: (a) => {
      c.sinais.push({ eventKey: a.eventKey, monitorId: a.monitorId, runId: a.runId })
      return Promise.resolve(opcoes.recordSignal ? opcoes.recordSignal(a.eventKey) : true)
    },
    recordCost: () => Promise.resolve(),
    finish: (monitorId, attempted, error, continuar) => (c.fins.push({ monitorId, attempted, error, continuar }), Promise.resolve()),
    ...(opcoes.semRegistro
      ? {}
      : {
        abrirRodada: (a: { monitorId: string; slot: string; pedidoId?: string }) => {
          c.rodadasAbertas.push(a)
          c.eventos.push(`rodada:${a.pedidoId ? 'manual' : 'agenda'}`)
          return Promise.resolve(a.pedidoId ? `rodada-${a.pedidoId}` : `rodada-${a.monitorId}`)
        },
        somarRodada: (rodadaId: string, resumo: ResumoDaRodada) => (c.somas.push({ rodadaId, resumo }), Promise.resolve()),
      }),
  }
  const manuais: Manuais = {
    claim: () => {
      c.eventos.push('claim-pedidos')
      return Promise.resolve(opcoes.pedidos ?? [pedido()])
    },
    finish: (pedidoId, estado, tentadas, erro) => (c.pedidos.push({ pedidoId, estado, tentadas, erro }), Promise.resolve()),
    kick: () => (c.kicks++, Promise.resolve()),
  }
  const apify: Apify = { run: opcoes.apify ?? (() => (c.runs++, Promise.resolve({ runId: 'run-1', items: [{}] }))) }
  const handler = createHandler({
    db,
    apify,
    manuais,
    adaptadores: { nova_lideranca: adaptador },
    agora: opcoes.agora ?? (() => AGORA),
    log: () => {},
  })
  return { c, chamar: () => handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' })) }
}

Deno.test('o pedido manual roda nas Contas do escopo, em modo manual, sem tocar no horário do Monitoramento', async () => {
  const { c, chamar } = montar()
  const r = await chamar()
  assertEquals(r.status, 200)
  assertEquals((await r.json()).runRequests, { count: 1, scanned: 2, signals: 2 })
  assertEquals(c.aberturas.map((a) => [a.accountId, a.origem, a.pedidoId, a.userId, a.slot]), [
    ['conta-alfa', 'manual', 'pedido-1', 'user-1', PEDIDO_EM],
    ['conta-beta', 'manual', 'pedido-1', 'user-1', PEDIDO_EM],
  ])
  assertEquals(c.runs, 2, 'o actor roda uma vez por Conta verificada')
  assertEquals(c.fechamentos, [{ id: 'res-conta-alfa', success: true }, { id: 'res-conta-beta', success: true }])
  assertEquals(c.fins, [], 'o horário do Monitoramento é do relógio: o pedido nunca chama finish_signal_monitor_run')
})

Deno.test('a Rodada manual grava uma linha: Contas verificadas, Sinais, Contas sem dado, reservas e o motivo da parada', async () => {
  const { c, chamar } = montar()
  await chamar()
  assertEquals(c.rodadasAbertas, [{ monitorId: 'mon-1', slot: PEDIDO_EM, pedidoId: 'pedido-1' }])
  assertEquals(c.somas, [{
    rodadaId: 'rodada-pedido-1',
    resumo: { verificadas: 2, novos: 2, repetidos: 0, semDado: 1, reservas: ['res-conta-alfa', 'res-conta-beta'], motivo: 'concluida' },
  }])
  assertEquals(c.sinais.map((s) => [s.eventKey, s.runId]), [['conta-alfa|CTO', 'rodada-pedido-1'], ['conta-beta|CTO', 'rodada-pedido-1']])
  assertEquals(c.pedidos, [{
    pedidoId: 'pedido-1',
    estado: 'feita',
    tentadas: 3,
    erro: `${MOTIVO_SEM_PAGINA}: Gama.`,
  }])
})

Deno.test('a Conta sem dado não abre varredura, não roda o actor e não é cobrada', async () => {
  const { c, chamar } = montar({ pedidos: [pedido({ accounts: [GAMA] })] })
  await chamar()
  assertEquals(c.aberturas, [])
  assertEquals(c.runs, 0)
  assertEquals(c.fechamentos, [])
  assertEquals(c.somas[0].resumo.reservas, [])
  assertEquals(c.somas[0].resumo.verificadas, 0)
  assertEquals(c.somas[0].resumo.semDado, 1)
  assertEquals(c.pedidos[0].estado, 'feita')
})

Deno.test('o Sinal visto de novo conta como repetido, e a Rodada sem novidade cobra o que verificou', async () => {
  const { c, chamar } = montar({ recordSignal: () => false })
  await chamar()
  assertEquals(c.somas[0].resumo.novos, 0)
  assertEquals(c.somas[0].resumo.repetidos, 2)
  assertEquals(c.somas[0].resumo.reservas?.length, 2, 'as duas Contas verificadas foram cobradas, mesmo sem novidade')
})

Deno.test('sem créditos, a Rodada manual para com o motivo, sem rodar o actor, e o pedido termina', async () => {
  const { c, chamar } = montar({ abertura: () => ({ outcome: 'no_credits', reservationId: null }) })
  await chamar()
  assertEquals(c.runs, 0)
  assertEquals(c.somas[0].resumo.motivo, 'sem_creditos')
  assertEquals(c.pedidos, [{
    pedidoId: 'pedido-1',
    estado: 'feita',
    tentadas: 0,
    erro: 'Sem créditos ou no limite mensal de quem pediu: a rodada parou.',
  }])
})

Deno.test('o limite do mês e o contrato inativo viram os códigos "teto" e "contrato_inativo"', async () => {
  const limite = montar({ abertura: () => ({ outcome: 'teto_atingido', reservationId: null }) })
  await limite.chamar()
  assertEquals(limite.c.somas[0].resumo.motivo, 'teto')
  assert(limite.c.pedidos[0].erro?.startsWith('Limite do mês atingido. Ele volta na renovação'))
  const contrato = montar({ abertura: () => ({ outcome: 'contrato_inativo', reservationId: null }) })
  await contrato.chamar()
  assertEquals(contrato.c.somas[0].resumo.motivo, 'contrato_inativo')
})

Deno.test('uma Conta que falha não é cobrada; as outras seguem', async () => {
  let chamadas = 0
  const { c, chamar } = montar({
    apify: () => (++chamadas === 1 ? Promise.reject(new Error('Apify fora do ar')) : Promise.resolve({ runId: 'run-2', items: [{}] })),
  })
  await chamar()
  assertEquals(c.fechamentos, [{ id: 'res-conta-alfa', success: false }, { id: 'res-conta-beta', success: true }])
  assertEquals(c.somas[0].resumo.verificadas, 1)
  assertEquals(c.somas[0].resumo.reservas, ['res-conta-beta'])
  assert(c.pedidos[0].erro?.includes('Não foi possível varrer: Alfa.'))
})

Deno.test('se todas as Contas falham, a Rodada termina com erro e o pedido, como falhou', async () => {
  const { c, chamar } = montar({
    pedidos: [pedido({ accounts: [ALFA, BETA] })],
    apify: () => Promise.reject(new Error('Apify fora do ar')),
  })
  await chamar()
  assertEquals(c.somas[0].resumo.motivo, 'erro')
  assertEquals(c.pedidos[0].estado, 'falhou')
})

Deno.test('o tempo da função acaba no meio: o pedido volta à fila, a Rodada segue aberta e ninguém é cobrado duas vezes', async () => {
  let agora = AGORA
  const { c, chamar } = montar({
    pedidos: [pedido({ accounts: [ALFA, BETA, { ...GAMA, linkedinUrl: 'https://www.linkedin.com/company/gama' }] })],
    apify: () => {
      c.runs++
      agora += 80_000
      return Promise.resolve({ runId: 'run-1', items: [{}] })
    },
    agora: () => agora,
  })
  await chamar()
  assertEquals(c.aberturas.map((a) => a.accountId), ['conta-alfa'])
  assertEquals(c.somas[0].resumo.motivo, 'prazo')
  assertEquals(c.pedidos, [{
    pedidoId: 'pedido-1',
    estado: 'pendente',
    tentadas: 1,
    erro: 'Varridas 1 de 3 Contas; o resto na próxima rodada.',
  }])
  assertEquals(c.kicks, 1, 'o relógio é chamado de novo: quem clicou não espera mais 10 minutos')
})

Deno.test('a continuação reabre a mesma Rodada e a Conta já cobrada volta como "done", sem rodar o actor de novo', async () => {
  // A chave de cobrança é a do pedido: o banco devolve `done` para a Conta já liquidada, e o runner a pula.
  const { c, chamar } = montar({
    pedidos: [pedido({ accounts: [ALFA, BETA] })],
    abertura: (accountId) => (accountId === 'conta-alfa' ? { outcome: 'done', reservationId: 'res-conta-alfa' } : { outcome: 'go', reservationId: 'res-conta-beta' }),
  })
  await chamar()
  assertEquals(c.rodadasAbertas, [{ monitorId: 'mon-1', slot: PEDIDO_EM, pedidoId: 'pedido-1' }], 'a Rodada é a do pedido')
  assertEquals(c.runs, 1, 'só a Conta que faltava rodou o actor')
  assertEquals(c.somas[0].resumo.reservas, ['res-conta-beta'], 'e só ela entra na conta dos créditos desta volta')
  assertEquals(c.pedidos[0], { pedidoId: 'pedido-1', estado: 'feita', tentadas: 2, erro: null })
})

Deno.test('o tempo já acabou nos pedidos anteriores: o pedido nem abre Rodada e volta à fila', async () => {
  let agora = AGORA
  const { c, chamar } = montar({
    pedidos: [pedido({ pedidoId: 'pedido-1', accounts: [ALFA] }), pedido({ pedidoId: 'pedido-2', monitorId: 'mon-2', accounts: [ALFA] })],
    apify: () => {
      agora += 80_000
      return Promise.resolve({ runId: 'run-1', items: [{}] })
    },
    agora: () => agora,
  })
  await chamar()
  assertEquals(c.rodadasAbertas.map((r) => r.pedidoId), ['pedido-1'])
  assertEquals(c.pedidos.map((p) => [p.pedidoId, p.estado, p.tentadas]), [['pedido-1', 'feita', 1], ['pedido-2', 'pendente', 0]])
  assertEquals(c.kicks, 0, 'o pedido que voltou sem tentar nenhuma Conta espera a próxima volta: sem laço de chamadas')
})

Deno.test('o pedido vem antes dos Monitoramentos do relógio, e o relógio segue como sempre', async () => {
  const { c, chamar } = montar({
    monitoresDoRelogio: [{
      monitorId: 'mon-relogio',
      workspaceId: WS,
      signalType: 'nova_lideranca',
      criteria: { cargo: 'CTO' },
      createdBy: 'user-1',
      slot: PEDIDO_EM,
      accounts: [ALFA],
    }],
    pedidos: [pedido({ accounts: [BETA] })],
  })
  const r = await (await chamar()).json()
  assertEquals(c.eventos, ['claim-pedidos', 'rodada:manual', 'abre:conta-beta', 'claim-monitores', 'rodada:agenda', 'abre:conta-alfa'])
  assertEquals(r.monitors, 1)
  assertEquals(c.aberturas.map((a) => a.origem), ['manual', undefined], 'o relógio abre a varredura agendada, sem origem')
  assertEquals(c.fins.map((f) => f.monitorId), ['mon-relogio'], 'só o relógio mexe no horário do Monitoramento')
})

Deno.test('a Rodada agendada também grava a sua linha, ligada aos Sinais, e soma o que verificou', async () => {
  const { c, chamar } = montar({
    pedidos: [],
    monitoresDoRelogio: [{
      monitorId: 'mon-relogio',
      workspaceId: WS,
      signalType: 'nova_lideranca',
      criteria: { cargo: 'CTO' },
      createdBy: 'user-1',
      slot: PEDIDO_EM,
      accounts: [ALFA, GAMA],
    }],
  })
  await chamar()
  assertEquals(c.rodadasAbertas, [{ monitorId: 'mon-relogio', slot: PEDIDO_EM }])
  assertEquals(c.somas, [{
    rodadaId: 'rodada-mon-relogio',
    resumo: { verificadas: 1, novos: 1, repetidos: 0, semDado: 1, reservas: ['res-conta-alfa'], motivo: 'concluida' },
  }])
  assertEquals(c.sinais.map((s) => s.runId), ['rodada-mon-relogio'])
  assertEquals(c.fins, [{ monitorId: 'mon-relogio', attempted: 2, error: `${MOTIVO_SEM_PAGINA}: Gama.`, continuar: false }])
})

Deno.test('a Rodada agendada que para por falta de créditos ou de Teto grava o motivo', async () => {
  const monitor: MonitorReivindicado = {
    monitorId: 'mon-relogio', workspaceId: WS, signalType: 'nova_lideranca', criteria: {}, createdBy: null, slot: PEDIDO_EM, accounts: [ALFA],
  }
  const semTeto = montar({ pedidos: [], monitoresDoRelogio: [monitor], abertura: () => ({ outcome: 'sem_teto', reservationId: null }) })
  await semTeto.chamar()
  assertEquals(semTeto.c.somas[0].resumo.motivo, 'teto')
  const semSaldo = montar({ pedidos: [], monitoresDoRelogio: [monitor], abertura: () => ({ outcome: 'no_credits', reservationId: null }) })
  await semSaldo.chamar()
  assertEquals(semSaldo.c.somas[0].resumo.motivo, 'sem_creditos')
})

Deno.test('a Rodada agendada que continua na chamada seguinte diz "prazo" e pede a próxima volta já', async () => {
  let agora = AGORA
  const { c, chamar } = montar({
    pedidos: [],
    monitoresDoRelogio: [{
      monitorId: 'mon-relogio', workspaceId: WS, signalType: 'nova_lideranca', criteria: {}, createdBy: null, slot: PEDIDO_EM, accounts: [ALFA, BETA],
    }],
    apify: () => {
      agora += 80_000
      return Promise.resolve({ runId: 'run-1', items: [{}] })
    },
    agora: () => agora,
  })
  await chamar()
  assertEquals(c.somas[0].resumo.motivo, 'prazo')
  assertEquals(c.fins.map((f) => [f.attempted, f.continuar]), [[1, true]])
})

Deno.test('uma falha do registro da Rodada nunca derruba a varredura', async () => {
  const c = { sinais: [] as { eventKey: string; monitorId: string; runId: string | null | undefined }[] }
  // O banco que registra a Rodada cai: o pedido ainda roda, só não ganha linha.
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve([]),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: () => Promise.resolve({ outcome: 'go', reservationId: 'res-1' }),
    endScan: () => Promise.resolve(),
    recordSignal: (a) => (c.sinais.push({ eventKey: a.eventKey, monitorId: a.monitorId, runId: a.runId }), Promise.resolve(true)),
    recordCost: () => Promise.resolve(),
    finish: () => Promise.resolve(),
    abrirRodada: () => Promise.reject(new Error('banco fora do ar')),
    somarRodada: () => Promise.reject(new Error('banco fora do ar')),
  }
  const pedidos: string[] = []
  const handler = createHandler({
    db,
    apify: { run: () => Promise.resolve({ runId: 'run-1', items: [{}] }) },
    manuais: { claim: () => Promise.resolve([pedido({ accounts: [ALFA] })]), finish: (_id, estado) => (pedidos.push(estado), Promise.resolve()) },
    adaptadores: { nova_lideranca: adaptador },
    agora: () => AGORA,
    log: () => {},
  })
  assertEquals((await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))).status, 200)
  assertEquals(pedidos, ['feita'])
  assertEquals(c.sinais.length, 1)
  assertEquals(c.sinais[0].runId, undefined, 'sem Rodada, o Sinal é gravado como sempre')
})

Deno.test('um erro inesperado no pedido o encerra como falhou, com a mensagem neutra, sem derrubar a chamada', async () => {
  const { c, chamar } = montar({
    abertura: () => {
      throw new Error('segredo do banco: senha=123')
    },
  })
  const r = await chamar()
  assertEquals(r.status, 200)
  assertEquals(c.pedidos, [{ pedidoId: 'pedido-1', estado: 'falhou', tentadas: 0, erro: 'A rodada falhou. Tente de novo.' }])
  assertEquals(c.somas.at(-1)?.resumo.motivo, 'erro')
})

Deno.test('o pedido de um Monitoramento sem fonte disponível falha na hora, sem abrir varredura', async () => {
  const { c, chamar } = montar({ actor: { ...ACTOR, state: 'testing' } })
  await chamar()
  assertEquals(c.aberturas, [])
  assertEquals(c.pedidos, [{ pedidoId: 'pedido-1', estado: 'falhou', tentadas: 0, erro: 'A fonte de dados deste Sinal não está disponível.' }])
  assertEquals(c.somas[0].resumo.motivo, 'erro')
})

Deno.test('sem a fila ligada, a função segue como sempre e a resposta não muda', async () => {
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
  assertEquals(await (await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))).json(), { monitors: 0, scanned: 0, signals: 0 })
})

Deno.test('uma falha ao reivindicar os pedidos não derruba os Monitoramentos do relógio', async () => {
  const { c } = montar()
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => (c.eventos.push('claim-monitores'), Promise.resolve([])),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: () => Promise.reject(new Error('não devia abrir')),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: () => Promise.resolve(),
  }
  const handler = createHandler({
    db,
    apify: { run: () => Promise.reject(new Error('não devia rodar')) },
    manuais: { claim: () => Promise.reject(new Error('banco fora do ar')), finish: () => Promise.resolve() },
    adaptadores: {},
    log: () => {},
  })
  assertEquals((await handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' }))).status, 200)
  assertEquals(c.eventos, ['claim-monitores'])
})
