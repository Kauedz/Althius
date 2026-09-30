import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  type AgenteDoWorkspace,
  codigoDoErro,
  coordenarPedido,
  conversarNaPagina,
  type Creditos,
  creditosDoBanco,
  type Executor,
  type Reserva,
  type RunDb,
  SemSaldo,
  type TipoDeEvento,
} from './orquestracao.ts'

const agente = (id: string, name: string): AgenteDoWorkspace => ({
  id, name, specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '',
})
const SCOPUS = agente('a-scopus', 'Scopus')
const ETHOS = agente('a-ethos', 'Ethos')

const reserva = (extra: Partial<Reserva> = {}): Reserva => ({
  run_id: 'run-1', kind: 'coordenada', workspace_name: 'Norte', request_text: 'Montem o ICP.',
  agent_id: null, mentions: [], agents: [SCOPUS, ETHOS], history: [], ...extra,
})

function montar(opcoes: { creditos?: Creditos; falhaDe?: string } = {}) {
  const eventos: { kind: TipoDeEvento; agentId: string | null }[] = []
  const trabalhos: string[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(null),
    append: (_r, kind, agentId) => (eventos.push({ kind, agentId }), Promise.resolve(eventos.length)),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
    ...(opcoes.creditos ? { creditos: opcoes.creditos } : {}),
  }
  const executor: Executor = {
    escolher: () => Promise.resolve({ agentes: ['a-scopus', 'a-ethos'], resposta_direta: '' }),
    trabalhar: (ag) => {
      trabalhos.push(ag.id)
      return ag.id === opcoes.falhaDe ? Promise.reject(new Error('modelo caiu')) : Promise.resolve({ texto: `${ag.name} fez.\nSTATUS: pronto` })
    },
    sintetizar: () => Promise.resolve({ texto: 'Resposta final.' }),
  }
  return { db, executor, eventos, trabalhos }
}

function creditosFalsos(abrir?: (agenteId: string, rodada: number) => 'go' | 'free' | 'sem_saldo') {
  const c = {
    abertos: [] as { runId: string; agenteId: string; rodada: number }[],
    fechados: [] as { id: string; concluida: boolean }[],
  }
  const creditos: Creditos = {
    abrir: (runId, agenteId, rodada) => {
      c.abertos.push({ runId, agenteId, rodada })
      const r = abrir ? abrir(agenteId, rodada) : 'go'
      if (r === 'sem_saldo') return Promise.reject(new SemSaldo())
      return Promise.resolve({ id: r === 'go' ? `res-${agenteId}-${rodada}` : null })
    },
    fechar: (id, concluida) => (c.fechados.push({ id, concluida }), Promise.resolve()),
  }
  return { creditos, c }
}

Deno.test('cada Agente por rodada abre e fecha uma rodada de crédito na Coordenação', async () => {
  const { creditos, c } = creditosFalsos()
  const { db, executor } = montar({ creditos })
  await coordenarPedido({ reserva: reserva(), db, executor })
  assertEquals(c.abertos, [
    { runId: 'run-1', agenteId: 'a-scopus', rodada: 1 },
    { runId: 'run-1', agenteId: 'a-ethos', rodada: 1 },
  ])
  assertEquals(c.fechados, [
    { id: 'res-a-scopus-1', concluida: true },
    { id: 'res-a-ethos-1', concluida: true },
  ])
})

Deno.test('na página de um Agente, a rodada dele também é um débito', async () => {
  const { creditos, c } = creditosFalsos()
  const { db, executor } = montar({ creditos })
  await conversarNaPagina({ reserva: reserva({ kind: 'agente', agent_id: 'a-scopus' }), db, executor })
  assertEquals(c.abertos.map((a) => a.agenteId), ['a-scopus'])
  assertEquals(c.fechados, [{ id: 'res-a-scopus-1', concluida: true }])
})

Deno.test('o Agente que falha não é cobrado e a falha continua sendo a do modelo', async () => {
  const { creditos, c } = creditosFalsos()
  const { db, executor } = montar({ creditos, falhaDe: 'a-scopus' })
  await assertRejects(() => coordenarPedido({ reserva: reserva(), db, executor }), Error, 'modelo caiu')
  assertEquals(c.fechados, [{ id: 'res-a-scopus-1', concluida: false }])
  assertEquals(c.abertos.length, 1, 'não abre a rodada do Agente seguinte')
})

Deno.test('sem saldo: o Agente nem roda e a Execução falha com o motivo "insufficient_credits", sem resposta', async () => {
  const { creditos } = creditosFalsos(() => 'sem_saldo')
  const { db, executor, trabalhos, eventos } = montar({ creditos })
  const erro = await assertRejects(() => coordenarPedido({ reserva: reserva(), db, executor }), SemSaldo)
  assertEquals(codigoDoErro(erro), 'insufficient_credits')
  assertEquals(trabalhos, [])
  assertEquals(eventos.filter((e) => e.kind === 'resposta' || e.kind === 'texto' || e.kind === 'feito'), [])
})

Deno.test('cobrança desligada ou rodada já paga: o Agente roda sem reservar nem fechar nada', async () => {
  const { creditos, c } = creditosFalsos(() => 'free')
  const { db, executor, trabalhos } = montar({ creditos })
  await coordenarPedido({ reserva: reserva(), db, executor })
  assertEquals(trabalhos, ['a-scopus', 'a-ethos'])
  assertEquals(c.fechados, [])
})

Deno.test('um motor sem créditos no banco roda como antes', async () => {
  const { db, executor, trabalhos } = montar()
  await coordenarPedido({ reserva: reserva(), db, executor })
  assertEquals(trabalhos, ['a-scopus', 'a-ethos'])
})

Deno.test('o adaptador do banco traduz as respostas de begin_agent_round e fecha pelo end_agent_round', async () => {
  const chamadas: [string, Record<string, unknown>][] = []
  const respostas: Record<string, { outcome: string; reservation_id: string | null }[]> = {
    go: [{ outcome: 'go', reservation_id: 'res-1' }],
    free: [{ outcome: 'free', reservation_id: null }],
    paid: [{ outcome: 'paid', reservation_id: 'res-2' }],
    no_credits: [{ outcome: 'no_credits', reservation_id: null }],
  }
  let proxima = 'go'
  // deno-lint-ignore no-explicit-any
  const rpc = ((nome: string, args: Record<string, unknown>) => {
    chamadas.push([nome, args])
    return Promise.resolve(nome === 'begin_agent_round' ? respostas[proxima] : null)
  }) as any
  const creditos = creditosDoBanco(rpc)

  assertEquals(await creditos.abrir('run-1', 'a-scopus', 2), { id: 'res-1' })
  assertEquals(chamadas[0], ['begin_agent_round', { p_run_id: 'run-1', p_agent_id: 'a-scopus', p_round: 2, p_own_ai_key: false }])
  proxima = 'free'
  assertEquals(await creditos.abrir('run-1', 'a-scopus', 1), { id: null })
  proxima = 'paid'
  assertEquals(await creditos.abrir('run-1', 'a-scopus', 1), { id: null })
  proxima = 'no_credits'
  await assertRejects(() => creditos.abrir('run-1', 'a-scopus', 1), SemSaldo)
  await creditos.fechar('res-1', true)
  assertEquals(chamadas.at(-1), ['end_agent_round', { p_reservation_id: 'res-1', p_success: true }])
})
