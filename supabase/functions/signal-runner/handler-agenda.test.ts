import { assertEquals } from 'jsr:@std/assert@1'
import type { ActorDoRegistro, Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  type ContaParaVarrer,
  createHandler,
  type Db,
  type MonitorReivindicado,
  type ResultadoDaAbertura,
} from './handler.ts'

// Agenda do Sinal (agente-de-sinal 03): o relógio do banco entrega o horário marcado da Rodada (`slot`) e o runner o repassa, sem
// derivar nada do próprio relógio. Durante a continuação o banco devolve o mesmo horário, então a chave de cobrança de cada Conta
// não muda e a Conta já cobrada volta como `done`: não vai ao fornecedor nem é cobrada de novo.

const WS = '11111111-1111-4111-8111-111111111111'
const HORARIO = '2026-10-26T11:00:00+00:00' // segunda 08:00 em Brasília
const AGORA = Date.parse('2026-10-26T11:04:00Z') // o relógio acordou 4 minutos depois
const ALFA: ContaParaVarrer = { id: 'conta-alfa', name: 'Alfa', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa' }
const BETA: ContaParaVarrer = { id: 'conta-beta', name: 'Beta', domain: 'beta.test', linkedinUrl: 'https://www.linkedin.com/company/beta' }

const monitor = (accounts: ContaParaVarrer[], slot = HORARIO): MonitorReivindicado => ({
  monitorId: 'mon-agenda', workspaceId: WS, signalType: 'nova_lideranca', criteria: { cargo: 'CTO' }, createdBy: 'user-1', slot, accounts,
})

const adaptador: AdaptadorDeSinal = {
  signalType: 'nova_lideranca',
  entrada: (conta) => ({ input: { empresa: conta.linkedinUrl }, maxItems: 5 }),
  sinais: (_itens, conta, criterios, agora) => [
    { eventKey: `${conta.id}|${String(criterios.cargo)}`, phrase: `Nova liderança em ${conta.name}`, firedAt: new Date(agora).toISOString() },
  ],
}

const ACTOR: ActorDoRegistro = { actorId: 'harvestapi~linkedin-profile-search', signalType: 'nova_lideranca', state: 'available', version: null, maxCostUsd: 0.2 }

/**
 * Um banco de mentira que faz o que o `begin_account_scan` faz com a chave de cobrança (Monitoramento, Conta e horário):
 * a primeira abertura da chave é `go`; a repetida, depois de liquidada, é `done`. Cada chamada ao runner recebe a lista de
 * Monitoramentos que o relógio entrega (a rotação das Contas muda entre uma chamada e outra, o horário não).
 */
function montar(chamadas: MonitorReivindicado[][], opcoes: { agora?: () => number; apify?: Apify['run'] } = {}) {
  const c = {
    aberturas: [] as { accountId: string; slot: string; outcome: ResultadoDaAbertura }[],
    cobradas: [] as string[],
    rodadasAbertas: [] as { monitorId: string; slot: string }[],
    fins: [] as { attempted: number; continuar: boolean }[],
    fornecedor: 0,
  }
  let chamada = 0
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve(chamadas[chamada++] ?? []),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: (a) => {
      const chave = `${a.monitorId}:${a.accountId}:${a.slot}`
      const outcome: ResultadoDaAbertura = c.cobradas.includes(chave) ? 'done' : 'go'
      if (outcome === 'go') c.cobradas.push(chave)
      c.aberturas.push({ accountId: a.accountId, slot: a.slot, outcome })
      return Promise.resolve({ outcome, reservationId: outcome === 'go' ? `res-${a.accountId}` : null })
    },
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_monitorId, attempted, _error, continuar) => (c.fins.push({ attempted, continuar }), Promise.resolve()),
    abrirRodada: (a) => (c.rodadasAbertas.push({ monitorId: a.monitorId, slot: a.slot }), Promise.resolve(`rodada-${a.monitorId}`)),
    somarRodada: () => Promise.resolve(),
  }
  const apify: Apify = { run: opcoes.apify ?? (() => (c.fornecedor++, Promise.resolve({ runId: 'run-1', items: [{}] }))) }
  const handler = createHandler({
    db,
    apify,
    adaptadores: { nova_lideranca: adaptador },
    agora: opcoes.agora ?? (() => AGORA),
    log: () => {},
  })
  return { c, chamar: () => handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' })) }
}

Deno.test('a Rodada agendada abre a Rodada e cada varredura com o horário marcado, não com a hora em que o relógio acordou', async () => {
  const { c, chamar } = montar([[monitor([ALFA, BETA])]])
  await chamar()
  assertEquals(c.rodadasAbertas, [{ monitorId: 'mon-agenda', slot: HORARIO }])
  assertEquals(c.aberturas.map((a) => [a.accountId, a.slot]), [['conta-alfa', HORARIO], ['conta-beta', HORARIO]])
  assertEquals(c.fins, [{ attempted: 2, continuar: false }])
})

Deno.test('a continuação traz o mesmo horário e não cobra de novo a Conta que a chamada anterior já cobrou', async () => {
  let agora = AGORA
  let fornecedor = 0
  // A primeira chamada tem tempo só para a Alfa (a consulta ao fornecedor gasta 80 s dos 150 da função); a segunda é rápida.
  let lenta = true
  const { c, chamar } = montar([[monitor([ALFA, BETA])], [monitor([BETA, ALFA])]], {
    agora: () => agora,
    apify: () => {
      fornecedor++
      if (lenta) agora += 80_000
      return Promise.resolve({ runId: `run-${fornecedor}`, items: [{}] })
    },
  })
  await chamar()
  assertEquals(c.fins, [{ attempted: 1, continuar: true }], 'a primeira chamada varre a Alfa e pede a próxima já')
  agora = AGORA + 1_000
  lenta = false
  await chamar()

  assertEquals(c.aberturas, [
    { accountId: 'conta-alfa', slot: HORARIO, outcome: 'go' },
    { accountId: 'conta-beta', slot: HORARIO, outcome: 'go' },
    { accountId: 'conta-alfa', slot: HORARIO, outcome: 'done' },
  ], 'a segunda chamada abre a Beta e reencontra a Alfa já feita naquele horário')
  assertEquals(c.cobradas.length, 2, 'cada Conta é cobrada uma vez só na Rodada inteira')
  assertEquals(fornecedor, 2, 'e o fornecedor só é consultado uma vez por Conta')
  assertEquals(c.rodadasAbertas.map((r) => r.slot), [HORARIO, HORARIO], 'as duas chamadas continuam a mesma Rodada, pelo mesmo horário')
  assertEquals(c.fins.at(-1), { attempted: 2, continuar: false }, 'a Rodada termina na segunda chamada e a rotação avança pelas duas Contas')
})

Deno.test('uma Rodada de outro horário é outra cobrança: o mesmo Monitoramento cobra de novo no horário seguinte', async () => {
  const OUTRO = '2026-10-26T17:00:00+00:00'
  const { c, chamar } = montar([[monitor([ALFA])], [monitor([ALFA], OUTRO)]])
  await chamar()
  await chamar()
  assertEquals(c.aberturas.map((a) => [a.accountId, a.slot, a.outcome]), [
    ['conta-alfa', HORARIO, 'go'],
    ['conta-alfa', OUTRO, 'go'],
  ])
  assertEquals(c.cobradas.length, 2)
})
