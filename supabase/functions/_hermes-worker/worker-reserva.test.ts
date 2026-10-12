// A reserva de créditos na porta (orquestracao, ticket 02) vista do worker do Hermes: o claim que recusa por falta de
// saldo deixa o pedido de fora sem tocar no Hermes, e a rodada que o teto da Rotina barra fecha a Execução sem chamar o
// modelo. O Hermes é dublê só na fronteira, e o banco é falso.
import { assertEquals } from 'jsr:@std/assert@1'
import { type AgenteDoWorkspace, type Creditos, type Reserva, TetoAtingido, type TipoDeEvento } from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type Hermes } from './worker.ts'

const SCOPUS: AgenteDoWorkspace = {
  id: 'a-scopus', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '',
}
const RESERVA: Reserva = {
  run_id: 'r1', kind: 'agente', workspace_name: 'Norte', request_text: 'Reavalie as Contas-alvo.',
  agent_id: 'a-scopus', mentions: [], agents: [SCOPUS], history: [],
}

function montar(reservada: Reserva | null, creditos?: Creditos) {
  const eventos: TipoDeEvento[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const corpos: CorpoDoRun[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(reservada),
    append: (_r, kind) => (eventos.push(kind), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
    ...(creditos ? { creditos } : {}),
  }
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo) => (corpos.push(corpo), Promise.resolve('h1')),
    aguardar: () => Promise.resolve({ status: 'completed', output: 'Feito.\nSTATUS: pronto' }),
  }
  return { worker: createWorker({ db, hermes, log: () => {}, porAgente: true }), eventos, fechamentos, corpos }
}

Deno.test('sem saldo na porta o claim devolve null: o worker não chama o Hermes nem grava nada', async () => {
  const { worker, eventos, fechamentos, corpos } = montar(null)
  assertEquals(await worker.rodada(), 0)
  assertEquals(corpos, [])
  assertEquals(eventos, [])
  assertEquals(fechamentos, [])
})

Deno.test('o teto da Rotina barra a rodada: a Execução falha com automation_cap_reached e o Hermes não é chamado', async () => {
  const creditos: Creditos = { abrir: () => Promise.reject(new TetoAtingido()), fechar: () => Promise.resolve() }
  const { worker, eventos, fechamentos, corpos } = montar(RESERVA, creditos)
  assertEquals(await worker.rodada(), 1)
  assertEquals(corpos, [])
  assertEquals(eventos.filter((e) => e === 'texto' || e === 'resposta' || e === 'feito'), [])
  assertEquals(fechamentos, [{ status: 'failed', errorCode: 'automation_cap_reached' }])
})
