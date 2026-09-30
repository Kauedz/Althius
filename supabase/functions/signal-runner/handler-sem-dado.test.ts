import { assertEquals } from 'jsr:@std/assert@1'
import type { ActorDoRegistro, Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  type BuscaReivindicada,
  type Buscas,
  type ContaParaVarrer,
  createHandler,
  type Db,
  SemDadoParaVarrer,
} from './handler.ts'

// A Conta sem o dado que o actor precisa (sinais-reais 03 a 06): o adaptador diz o motivo em `entrada`, e a Conta é
// pulada antes de abrir a varredura, então nada é reservado nem cobrado, e o motivo aparece no Monitoramento e na busca.

const WS = '11111111-1111-4111-8111-111111111111'
const SLOT = '2026-09-30T12:00:00+00:00'
const COM_PAGINA: ContaParaVarrer = { id: 'conta-alfa', name: 'Alfa', domain: null, linkedinUrl: 'https://www.linkedin.com/company/alfa' }
const SEM_PAGINA: ContaParaVarrer = { id: 'conta-beta', name: 'Beta', domain: null, linkedinUrl: null }
const GAMA: ContaParaVarrer = { id: 'conta-gama', name: 'Gama', domain: null, linkedinUrl: null }
const MOTIVO = 'Contas sem a página da empresa no LinkedIn ficaram de fora'

const adaptador: AdaptadorDeSinal = {
  signalType: 'nova_lideranca',
  entrada(conta) {
    if (!conta.linkedinUrl) throw new SemDadoParaVarrer(MOTIVO)
    return { input: { empresa: conta.linkedinUrl }, maxItems: 5 }
  },
  sinais: (_itens, conta, criterios, agora) => [
    { eventKey: `${conta.id}|${String(criterios.cargo)}`, phrase: 'Nova liderança', firedAt: new Date(agora).toISOString() },
  ],
}

const ACTOR: ActorDoRegistro = { actorId: 'harvestapi~linkedin-profile-search', signalType: 'nova_lideranca', state: 'available', version: null, maxCostUsd: 0.2 }

function montar(contas: ContaParaVarrer[], busca?: BuscaReivindicada, comAdaptador = adaptador) {
  const c = { aberturas: [] as string[], runs: 0, sinais: [] as string[], fins: [] as (string | null)[], buscas: [] as { state: string; error: string | null }[] }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () =>
      Promise.resolve(busca ? [] : [{
        monitorId: 'mon-1', workspaceId: WS, signalType: 'nova_lideranca', criteria: { cargo: 'CTO' }, createdBy: null, slot: SLOT, accounts: contas,
      }]),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: (a) => (c.aberturas.push(a.accountId), Promise.resolve({ outcome: 'go', reservationId: `res-${a.accountId}` })),
    endScan: () => Promise.resolve(),
    recordSignal: (a) => (c.sinais.push(a.eventKey), Promise.resolve(true)),
    recordCost: () => Promise.resolve(),
    finish: (_m, _a, error) => (c.fins.push(error), Promise.resolve()),
  }
  const buscas: Buscas = {
    claim: () => Promise.resolve(busca ? [busca] : []),
    beginScan: ({ monitorId }) => (c.aberturas.push(monitorId), Promise.resolve({ outcome: 'go', reservationId: `res-${monitorId}` })),
    endScan: () => Promise.resolve(),
    finish: (_id, state, _n, error) => (c.buscas.push({ state, error }), Promise.resolve()),
    stopWorkspace: () => Promise.resolve(0),
    kick: () => Promise.resolve(),
  }
  const apify: Apify = { run: () => (c.runs++, Promise.resolve({ runId: 'run-1', items: [{}] })) }
  const handler = createHandler({
    db, apify, buscas, adaptadores: { nova_lideranca: comAdaptador }, agora: () => Date.parse('2026-09-30T12:00:00Z'), log: () => {},
  })
  return { c, chamar: () => handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' })) }
}

Deno.test('a Conta sem o dado não abre varredura nem roda o actor; as outras seguem e o motivo fica no Monitoramento', async () => {
  const { c, chamar } = montar([COM_PAGINA, SEM_PAGINA, GAMA])
  const r = await chamar()
  assertEquals((await r.json()).scanned, 1)
  assertEquals(c.aberturas, ['conta-alfa'])
  assertEquals(c.runs, 1)
  assertEquals(c.sinais, ['conta-alfa|CTO'], 'o adaptador recebe os critérios e a hora da varredura')
  assertEquals(c.fins, [`${MOTIVO}: Beta, Gama.`])
})

Deno.test('na busca de Sinais, o Monitoramento que não pode varrer a Conta é pulado sem cobrar e diz por quê', async () => {
  const busca: BuscaReivindicada = {
    rescanId: 'busca-1', workspaceId: WS, origin: 'manual', requestedBy: 'user-1', requestedAt: SLOT, account: SEM_PAGINA,
    monitors: [{ monitorId: 'mon-1', signalType: 'nova_lideranca', criteria: {} }],
  }
  const { c, chamar } = montar([], busca)
  await chamar()
  assertEquals(c.aberturas, [])
  assertEquals(c.runs, 0)
  assertEquals(c.buscas, [{ state: 'stopped', error: `${MOTIVO}.` }])
})

Deno.test('um adaptador que quebra na entrada é falha só daquela Conta: as outras seguem e nada é cobrado por ela', async () => {
  const quebrado: AdaptadorDeSinal = {
    ...adaptador,
    entrada(conta, criterios, agora) {
      if (conta.id === 'conta-gama') throw new TypeError('campo inesperado')
      return adaptador.entrada(conta, criterios, agora)
    },
  }
  const { c, chamar } = montar([COM_PAGINA, GAMA], undefined, quebrado)
  assertEquals((await (await chamar()).json()).scanned, 1)
  assertEquals(c.aberturas, ['conta-alfa'])
  assertEquals(c.fins, ['Não foi possível varrer: Gama.'])
})

