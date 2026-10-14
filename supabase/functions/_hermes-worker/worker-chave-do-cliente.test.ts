import { assertEquals } from 'jsr:@std/assert@1'
import type { AgenteDoWorkspace, Reserva } from '../agent-conversation/runner.ts'
import { createWorker, type FilaDb, type Hermes } from './worker.ts'

// A chave de IA do cliente (creditos-e-planos, ticket 08) e o worker do Hermes: o Hermes tem o modelo próprio e não sabe
// usar a chave do cliente. Um Workspace com chave ligada falha com o motivo, em vez de rodar no modelo da Althius e
// cobrar 20% como se usasse o do cliente.

const SCOPUS: AgenteDoWorkspace = { id: 'a-scopus', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
const reserva = (runId: string): Reserva => ({
  run_id: runId,
  // A Coordenação sem Menção: o pedido que ainda vai pelo modo de uma chamada (PR-11).
  kind: 'coordenada',
  workspace_name: 'Norte',
  request_text: 'Oi',
  agent_id: null,
  mentions: [],
  agents: [SCOPUS],
  history: [],
})

function montar(comChave: Record<string, boolean | Error>) {
  const fechamentos: { runId: string; status: string; errorCode: string | null }[] = []
  const iniciados: string[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r-com-chave', 'r-sem-chave']),
    claim: (runId) => Promise.resolve(reserva(runId)),
    append: () => Promise.resolve(1),
    finish: (runId, status, errorCode) => (fechamentos.push({ runId, status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
    usaChaveDoCliente: (runId) => {
      const r = comChave[runId] ?? false
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    },
  }
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (_corpo, chave) => (iniciados.push(chave), Promise.resolve('hermes-run')),
    aguardar: () => Promise.resolve({ status: 'completed', output: 'Ok.' }),
  }
  return { worker: createWorker({ db, hermes, log: () => {} }), fechamentos, iniciados }
}

Deno.test('o Workspace com chave de IA própria falha com o motivo e nem chega ao Hermes; o outro roda normalmente', async () => {
  const { worker, fechamentos, iniciados } = montar({ 'r-com-chave': true })
  assertEquals(await worker.rodada(), 2)
  assertEquals(fechamentos, [
    { runId: 'r-com-chave', status: 'failed', errorCode: 'workspace_ai_key_unsupported' },
    { runId: 'r-sem-chave', status: 'succeeded', errorCode: null },
  ])
  assertEquals(iniciados, ['althius-r-sem-chave'])
})

Deno.test('se não der para saber se há chave, a Execução falha em vez de rodar e cobrar errado', async () => {
  const { worker, fechamentos, iniciados } = montar({ 'r-com-chave': new Error('banco fora do ar') })
  await worker.rodada()
  assertEquals(fechamentos[0], { runId: 'r-com-chave', status: 'failed', errorCode: 'internal_error' })
  assertEquals(iniciados, ['althius-r-sem-chave'])
})
