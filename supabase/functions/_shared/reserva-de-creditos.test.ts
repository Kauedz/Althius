import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  type AgenteDoWorkspace,
  codigoDoErro,
  conversarNaPagina,
  type Creditos,
  creditosDoBanco,
  type Executor,
  type Reserva,
  type RunDb,
  TetoAtingido,
  type TipoDeEvento,
} from './orquestracao.ts'

// A reserva de créditos na porta (orquestracao, ticket 02): o claim reserva a estimativa e a rodada a consome, então o
// motor só precisa fechar a rodada que o banco abriu e parar quando o teto de uma Rotina barra a rodada.

const agente = (id: string, name: string): AgenteDoWorkspace => ({
  id, name, specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '',
})
const SCOPUS = agente('a-scopus', 'Scopus')

const reserva = (extra: Partial<Reserva> = {}): Reserva => ({
  run_id: 'run-1', kind: 'agente', workspace_name: 'Norte', request_text: 'Reavalie as Contas.',
  agent_id: 'a-scopus', mentions: [], agents: [SCOPUS], history: [], ...extra,
})

function montar(creditos: Creditos) {
  const eventos: TipoDeEvento[] = []
  const trabalhos: string[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(null),
    append: (_r, kind) => (eventos.push(kind), Promise.resolve(eventos.length)),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
    creditos,
  }
  const executor: Executor = {
    escolher: () => Promise.resolve({ agentes: [], resposta_direta: '' }),
    trabalhar: (ag) => (trabalhos.push(ag.id), Promise.resolve({ texto: `${ag.name} fez.\nSTATUS: pronto` })),
    sintetizar: () => Promise.resolve({ texto: 'Resposta final.' }),
  }
  return { db, executor, eventos, trabalhos }
}

function rpcFalso(respostas: Record<string, { outcome: string; reservation_id: string | null }[]>, proxima: () => string) {
  const chamadas: [string, Record<string, unknown>][] = []
  // deno-lint-ignore no-explicit-any
  const rpc = ((nome: string, args: Record<string, unknown>) => {
    chamadas.push([nome, args])
    return Promise.resolve(nome === 'begin_agent_round' ? respostas[proxima()] : null)
  }) as any
  return { rpc, chamadas }
}

Deno.test('rodada barrada pelo teto da Rotina: o Agente nem roda e a Execução falha com "automation_cap_reached"', async () => {
  const creditos: Creditos = { abrir: () => Promise.reject(new TetoAtingido()), fechar: () => Promise.resolve() }
  const { db, executor, trabalhos, eventos } = montar(creditos)
  const erro = await assertRejects(() => conversarNaPagina({ reserva: reserva(), db, executor }), TetoAtingido)
  assertEquals(codigoDoErro(erro), 'automation_cap_reached')
  assertEquals(trabalhos, [], 'o modelo não foi chamado')
  assertEquals(eventos, [], 'e nenhuma resposta foi inventada')
})

Deno.test('o adaptador do banco traduz cap_reached e fecha a rodada que o banco contou com a cobrança desligada', async () => {
  let proxima = 'cap'
  const { rpc, chamadas } = rpcFalso({
    cap: [{ outcome: 'cap_reached', reservation_id: null }],
    livre: [{ outcome: 'free', reservation_id: 'rod-1' }],
    estimativa: [{ outcome: 'go', reservation_id: 'rod-2' }],
  }, () => proxima)
  const creditos = creditosDoBanco(rpc)

  await assertRejects(() => creditos.abrir('run-1', 'a-scopus', 1), TetoAtingido)
  proxima = 'livre'
  assertEquals(await creditos.abrir('run-1', 'a-scopus', 1), { id: 'rod-1' })
  proxima = 'estimativa'
  assertEquals(await creditos.abrir('run-1', 'a-scopus', 2), { id: 'rod-2' })
  await creditos.fechar('rod-1', true)
  assertEquals(chamadas.at(-1), ['end_agent_round', { p_reservation_id: 'rod-1', p_success: true }])
})

Deno.test('a rodada que o banco contou (cobrança desligada, Rotina) é fechada ao terminar', async () => {
  const fechados: { id: string; concluida: boolean }[] = []
  const creditos: Creditos = {
    abrir: (_run, agenteId, rodada) => Promise.resolve({ id: `rod-${agenteId}-${rodada}` }),
    fechar: (id, concluida) => (fechados.push({ id, concluida }), Promise.resolve()),
  }
  const { db, executor } = montar(creditos)
  await conversarNaPagina({ reserva: reserva(), db, executor })
  assertEquals(fechados, [{ id: 'rod-a-scopus-1', concluida: true }])
})
