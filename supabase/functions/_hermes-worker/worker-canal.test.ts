// A Execução do Canal Slack (slack-canal 03): um fio, um Agente. No worker do Hermes, as Menções que o Agente escreve não
// puxam outro Agente, as instruções não oferecem outro Agente para chamar e o pedido roda só com o Agente do fio.
import { assertEquals } from 'jsr:@std/assert@1'
import type { AgenteDoWorkspace, AnexoDaExecucao, Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type FimDoHermes, type Hermes } from './worker.ts'

const agente = (id: string, name: string, specialty: string): AgenteDoWorkspace =>
  ({ id, name, specialty, kind: 'padrao', instructions: '', voice_tone: '' })
const SCOPUS = agente('a-scopus', 'Scopus', 'scopus')
const RHETOR = agente('a-rhetor', 'Rhetor', 'rhetor')

function reserva(gatilho: string, extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'agente',
    trigger_kind: gatilho,
    origin: 'slack',
    workspace_name: 'Norte',
    request_text: '@Scopus quem são as contas quentes?',
    agent_id: SCOPUS.id,
    mentions: [],
    agents: [SCOPUS, RHETOR],
    history: [],
    ...extra,
  } as Reserva
}

/** O Agente da vez, pelas instruções: "Você é <Nome>, um Agente". */
const quem = (corpo: CorpoDoRun) => /Você é (.+?), um Agente/.exec(corpo.instructions)?.[1] ?? '-'

function montar(reservada: Reserva, porAgente = false, anexos: AnexoDaExecucao[] = []) {
  const eventos: { kind: TipoDeEvento; agentId: string | null }[] = []
  const fechamentos: string[] = []
  const chamadas: CorpoDoRun[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, agentId) => (eventos.push({ kind, agentId }), Promise.resolve(eventos.length)),
    finish: (_r, status) => (fechamentos.push(status), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
    anexos: () => Promise.resolve(anexos),
  }
  let atual: CorpoDoRun | null = null
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo) => ((atual = corpo), chamadas.push(corpo), Promise.resolve(`h${chamadas.length}`)),
    aguardar: () =>
      Promise.resolve<FimDoHermes>({
        status: 'completed',
        output: atual!.instructions.includes('Você coordena:')
          ? '{"etapas":[{"agente":"Scopus","texto":"A Alfa."},{"agente":"Rhetor","texto":"A Beta."}],"resposta":"Resumo."}'
          : quem(atual!) === 'Scopus' ? 'A Alfa. @Rhetor, escreva a mensagem.\nSTATUS: pronto' : 'Mensagem pronta.\nSTATUS: pronto',
      }),
  }
  const worker = createWorker({ db, hermes, log: () => {}, porAgente })
  const falas = () => eventos.filter((e) => e.kind === 'texto' || e.kind === 'feito').map((e) => e.agentId)
  return { worker, falas, fechamentos, chamadas }
}

Deno.test('Execução do Canal: a Menção escrita pelo Agente não faz outro Agente falar', async () => {
  for (const porAgente of [false, true]) {
    const { worker, falas, fechamentos, chamadas } = montar(reserva('canal'), porAgente)
    assertEquals(await worker.rodada(), 1)
    assertEquals(falas(), [SCOPUS.id])
    assertEquals(fechamentos, ['succeeded'])
    assertEquals(chamadas.map(quem), ['Scopus'])
    assertEquals(chamadas[0].instructions.includes('@Rhetor'), false, 'as instruções não oferecem outro Agente')
  }
})

Deno.test('Execução do Canal: só o Agente do fio fala, mesmo com Menção na reserva', async () => {
  const { worker, falas } = montar(reserva('canal', { mentions: [RHETOR.id] }))
  await worker.rodada()
  assertEquals(falas(), [SCOPUS.id])
})

Deno.test('Execução do Canal no modo de uma chamada: a saída fica com o Agente do fio', async () => {
  const { worker, falas } = montar(reserva('canal', { mentions: [RHETOR.id] }))
  await worker.processar(reserva('canal', { mentions: [RHETOR.id] }))
  assertEquals(falas(), [SCOPUS.id])
})

Deno.test('fora do Canal, o Agente continua chamando Agente (PR-11)', async () => {
  const { worker, falas } = montar(reserva('conversa'))
  await worker.rodada()
  assertEquals(falas(), [SCOPUS.id, RHETOR.id])
})

Deno.test('Execução do Canal com anexo: roda só com o Agente do fio e o anexo chega ao Hermes', async () => {
  const anexo: AnexoDaExecucao = { id: 'x1', nome: 'tabela.csv', mime: 'text/csv', texto: 'conta;nota\nAlfa;9' }
  for (const porAgente of [false, true]) {
    const { worker, falas, fechamentos, chamadas } = montar(reserva('canal', { mentions: [RHETOR.id] }), porAgente, [anexo])
    assertEquals(await worker.rodada(), 1)
    assertEquals(falas(), [SCOPUS.id])
    assertEquals(fechamentos, ['succeeded'])
    assertEquals(chamadas.map(quem), ['Scopus'])
    assertEquals(chamadas[0].instructions.includes('@Rhetor'), false, 'as instruções não oferecem outro Agente')
    assertEquals(chamadas[0].input.includes('--- Início do anexo tabela.csv ---\nconta;nota\nAlfa;9'), true, 'o anexo segue no pedido')
  }
})

Deno.test('Execução canal WhatsApp coordenada oferece todos os Agentes elegíveis ao Hermes', async () => {
  const run = reserva('canal', { kind: 'coordenada', origin: 'whatsapp', agent_id: null, mentions: [] })
  const { worker, falas } = montar(run)
  await worker.processar(run)
  assertEquals(falas(), [SCOPUS.id, RHETOR.id])
})
