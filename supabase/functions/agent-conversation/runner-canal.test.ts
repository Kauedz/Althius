// A Execução do Canal Slack (slack-canal 03): um fio, um Agente. As Menções que o Agente escreve não puxam outro Agente
// para a rodada, e o pedido roda só com o Agente do fio, mesmo que a reserva traga Menções.
import { assertEquals } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { type AgenteDoWorkspace, createRunner, type Modelo, type Reserva, type RunDb, type TipoDeEvento } from './runner.ts'

type Mensagem = Anthropic.Beta.Messages.BetaMessage

const agente = (id: string, name: string, specialty: string): AgenteDoWorkspace =>
  ({ id, name, specialty, kind: 'padrao', instructions: '', voice_tone: '' })
const SCOPUS = agente('a-scopus', 'Scopus', 'scopus')
const RHETOR = agente('a-rhetor', 'Rhetor', 'rhetor')

const texto = (t: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] }) as unknown as Mensagem

function reserva(gatilho: string, extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'agente',
    trigger_kind: gatilho,
    workspace_name: 'Norte',
    request_text: '@Scopus quem são as contas quentes?',
    agent_id: SCOPUS.id,
    mentions: [],
    agents: [SCOPUS, RHETOR],
    history: [],
    ...extra,
  } as Reserva
}

async function rodar(reservada: Reserva, respostas: string[]) {
  const eventos: { kind: TipoDeEvento; agentId: string | null }[] = []
  const fechamentos: string[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, agentId) => (eventos.push({ kind, agentId }), Promise.resolve(eventos.length)),
    finish: (_r, status) => (fechamentos.push(status), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const fila = [...respostas]
  const modelo: Modelo = {
    nome: 'claude-opus-5-5',
    criar: () => {
      const proxima = fila.shift()
      return proxima === undefined ? Promise.reject(new Error('sem resposta roteirizada')) : Promise.resolve(texto(proxima))
    },
  }
  await createRunner({ db, modelo, log: () => {} })('r1')
  return { falas: eventos.filter((e) => e.kind === 'texto').map((e) => e.agentId), fechamentos }
}

Deno.test('Execução do Canal: a Menção escrita pelo Agente não faz outro Agente falar', async () => {
  const { falas, fechamentos } = await rodar(reserva('canal'), ['A Alfa. @Rhetor, escreva a mensagem.', 'Mensagem pronta.'])
  assertEquals(falas, [SCOPUS.id])
  assertEquals(fechamentos, ['succeeded'])
})

Deno.test('Execução do Canal: só o Agente do fio fala, mesmo com Menção na reserva', async () => {
  const { falas } = await rodar(reserva('canal', { mentions: [RHETOR.id] }), ['A Alfa.', 'Mensagem pronta.'])
  assertEquals(falas, [SCOPUS.id])
})

Deno.test('fora do Canal, o Agente continua chamando Agente (PR-11)', async () => {
  const { falas } = await rodar(reserva('conversa'), ['A Alfa. @Rhetor, escreva a mensagem.', 'Mensagem pronta.'])
  assertEquals(falas, [SCOPUS.id, RHETOR.id])
})
