// Menções com vários Agentes na mesma Conversa (PR-11): com o worker no modo de uma chamada (HERMES_UMA_CHAMADA=true),
// a Menção e a página de um Agente vão pelo modo por Agente, o mencionado fala, um Agente chama outro com "@Nome", os
// limites de rodadas e de participantes valem e cada fala cobra a rodada.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { AgenteDoWorkspace, Creditos, Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type FimDoHermes, type Hermes, precisaDoModoPorAgente } from './worker.ts'

const agente = (id: string, name: string, specialty: string): AgenteDoWorkspace =>
  ({ id, name, specialty, kind: 'padrao', instructions: '', voice_tone: '' })
const SCOPUS = agente('a-scopus', 'Scopus', 'scopus')
const RHETOR = agente('a-rhetor', 'Rhetor', 'rhetor')
const ETHOS = agente('a-ethos', 'Ethos', 'ethos')
const ORACULUM = agente('a-oraculum', 'Oraculum', 'oraculum')
const EXTRA = agente('a-extra', 'Scopus · Enterprise', 'scopus')

function reserva(extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'agente',
    workspace_name: 'Norte',
    request_text: 'Preciso de uma abordagem para a Alfa.',
    agent_id: SCOPUS.id,
    mentions: [],
    agents: [SCOPUS, RHETOR, ETHOS, ORACULUM, EXTRA],
    history: [],
    ...extra,
  }
}

type Chamada = { corpo: CorpoDoRun; chave: string }

/** O Agente da vez, pelas instruções: "Você é <Nome>, um Agente". */
const quem = (c: Chamada) => /Você é (.+?), um Agente/.exec(c.corpo.instructions)?.[1] ?? '-'

function montar(responder: (c: Chamada) => string, reservada: Reserva, { porAgente = false, saldo = Infinity } = {}) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const chamadas: Chamada[] = []
  const rodadas: string[] = []
  let restante = saldo
  const creditos: Creditos = {
    abrir: (_run, agenteId, rodada) => {
      if (restante <= 0) return Promise.reject(Object.assign(new Error('sem saldo'), { name: 'SemSaldo' }))
      restante--
      rodadas.push(`${agenteId}:r${rodada}`)
      return Promise.resolve({ id: `res-${rodadas.length}` })
    },
    fechar: () => Promise.resolve(),
  }
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
    creditos,
  }
  let atual: Chamada | null = null
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo, chave) => ((atual = { corpo, chave }), chamadas.push(atual), Promise.resolve(`h${chamadas.length}`)),
    aguardar: () => Promise.resolve<FimDoHermes>({ status: 'completed', output: responder(atual!) }),
  }
  // O padrão aqui é o da VPS: HERMES_UMA_CHAMADA=true (porAgente falso).
  return { worker: createWorker({ db, hermes, log: () => {}, porAgente }), eventos, fechamentos, chamadas, rodadas }
}

const falas = (eventos: { kind: TipoDeEvento; agentId: string | null }[]) =>
  eventos.filter((e) => e.kind === 'texto').map((e) => e.agentId)

Deno.test('roteamento: Menção ou página de Agente vão pelo modo por Agente; a Coordenação sem Menção segue o configurado', () => {
  assertEquals(precisaDoModoPorAgente({ kind: 'agente', mentions: [] }, false), true)
  assertEquals(precisaDoModoPorAgente({ kind: 'coordenada', mentions: ['a'] }, false), true)
  assertEquals(precisaDoModoPorAgente({ kind: 'coordenada', mentions: [] }, false), false)
  assertEquals(precisaDoModoPorAgente({ kind: 'coordenada', mentions: [] }, true), true)
})

Deno.test('Menção na página do Agente, com o worker em modo de uma chamada: o mencionado fala depois do anfitrião', async () => {
  const { worker, eventos, fechamentos, chamadas, rodadas } = montar(
    (c) => `${quem(c)}: minha parte.\nSTATUS: pronto`,
    reserva({ mentions: [RHETOR.id] }),
  )
  assertEquals(await worker.rodada(), 1)
  assertEquals(falas(eventos), [SCOPUS.id, RHETOR.id])
  assertEquals(chamadas.map(quem), ['Scopus', 'Rhetor'])
  assertEquals(rodadas, ['a-scopus:r1', 'a-rhetor:r1'])
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertStringIncludes(chamadas[0].corpo.instructions, '@Rhetor')
})

Deno.test('Agente menciona Agente: o chamado fala na rodada seguinte, na mesma Conversa', async () => {
  const { worker, eventos, chamadas, rodadas } = montar(
    (c) => quem(c) === 'Scopus' ? 'A Alfa tem aderência. @Rhetor, escreva a primeira mensagem.\nSTATUS: pronto' : 'Mensagem pronta.\nSTATUS: pronto',
    reserva(),
  )
  await worker.rodada()
  assertEquals(falas(eventos), [SCOPUS.id, RHETOR.id])
  assertEquals(chamadas.map((c) => c.chave), ['althius-r1-a-scopus-r1', 'althius-r1-a-rhetor-r2'])
  assertEquals(rodadas, ['a-scopus:r1', 'a-rhetor:r2'])
})

Deno.test('o nome mais longo vence e o Agente não chama a si mesmo', async () => {
  const { worker, eventos } = montar(
    (c) => quem(c) === 'Scopus' ? 'Eu, @Scopus, peço ao @Scopus · Enterprise.\nSTATUS: pronto' : 'Feito.\nSTATUS: pronto',
    reserva(),
  )
  await worker.rodada()
  assertEquals(falas(eventos), [SCOPUS.id, EXTRA.id])
})

Deno.test('limite de rodadas: quem se chama de volta para na terceira', async () => {
  const { worker, eventos } = montar(
    (c) => quem(c) === 'Scopus' ? 'Pergunto ao @Rhetor.\nSTATUS: pronto' : 'Devolvo ao @Scopus.\nSTATUS: pronto',
    reserva(),
  )
  await worker.rodada()
  assertEquals(falas(eventos), [SCOPUS.id, RHETOR.id, SCOPUS.id])
})

Deno.test('limite de participantes: no máximo 4 Agentes diferentes na Conversa', async () => {
  const { worker, eventos } = montar(
    (c) => quem(c) === 'Scopus' ? 'Chamo @Rhetor, @Ethos, @Oraculum e @Scopus · Enterprise.\nSTATUS: pronto' : 'Feito.\nSTATUS: pronto',
    reserva(),
  )
  await worker.rodada()
  assertEquals(falas(eventos), [SCOPUS.id, RHETOR.id, ETHOS.id, ORACULUM.id])
})

Deno.test('cobrança por fala: sem saldo para o mencionado, a Execução falha e ele não fala', async () => {
  const { worker, eventos, fechamentos, rodadas } = montar(
    () => 'Minha parte.\nSTATUS: pronto',
    reserva({ mentions: [RHETOR.id] }),
    { saldo: 1 },
  )
  await worker.rodada()
  assertEquals(falas(eventos), [SCOPUS.id])
  assertEquals(rodadas, ['a-scopus:r1'])
  assertEquals(fechamentos.length, 1)
  assertEquals(fechamentos[0].status, 'failed')
})

Deno.test('fallback de uma chamada: página do Agente com Menção grava uma fala por Agente, cada uma cobrada', async () => {
  const saida = JSON.stringify({
    etapas: [
      { agente: 'Scopus', texto: 'A Alfa tem aderência.' },
      { agente: 'Rhetor', texto: 'Primeira mensagem: olá.' },
      { agente: 'Ethos', texto: 'não foi mencionado' },
    ],
    resposta: '',
  })
  const { worker, eventos, fechamentos, chamadas, rodadas } = montar(() => saida, reserva({ mentions: [RHETOR.id] }))
  await worker.processar(reserva({ mentions: [RHETOR.id] }))
  assertEquals(eventos.map((e) => [e.kind, e.agentId, e.payload.texto]), [
    ['texto', SCOPUS.id, 'A Alfa tem aderência.'],
    ['texto', RHETOR.id, 'Primeira mensagem: olá.'],
  ])
  assertEquals(rodadas, ['a-scopus:r1', 'a-rhetor:r1'])
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertStringIncludes(chamadas[0].corpo.instructions, '"etapas"')
})

Deno.test('fallback de uma chamada sem o JSON: a saída fica com o anfitrião', async () => {
  const { worker, eventos } = montar(() => 'Texto solto.', reserva({ mentions: [RHETOR.id] }))
  await worker.processar(reserva({ mentions: [RHETOR.id] }))
  assertEquals(eventos.map((e) => [e.agentId, e.payload.texto]), [[SCOPUS.id, 'Texto solto.']])
})
