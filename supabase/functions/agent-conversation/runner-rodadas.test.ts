import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import {
  type AgenteDoWorkspace,
  createRunner,
  type Modelo,
  type Reserva,
  type RunDb,
  type TipoDeEvento,
} from './runner.ts'

type Params = Parameters<Modelo['criar']>[0]
type Mensagem = Anthropic.Beta.Messages.BetaMessage

const SCOPUS: AgenteDoWorkspace = {
  id: 'a-scopus',
  name: 'Scopus',
  specialty: 'scopus',
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
}
const ETHOS: AgenteDoWorkspace = { ...SCOPUS, id: 'a-ethos', name: 'Ethos', specialty: 'ethos' }

const reserva = (extra: Partial<Reserva> = {}): Reserva => ({
  run_id: 'r1',
  kind: 'coordenada',
  workspace_name: 'Norte',
  request_text: 'Montem o ICP e as Personas.',
  agent_id: null,
  mentions: [],
  agents: [SCOPUS, ETHOS],
  history: [],
  ...extra,
})

const resposta = (t: string, usage?: { input_tokens: number; output_tokens: number }): Mensagem =>
  ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage }) as unknown as Mensagem

function montar(reservada: Reserva, respostas: Mensagem[]) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const chamadas: Params[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const fila = [...respostas]
  const modelo: Modelo = {
    nome: 'claude-opus-5-5',
    criar: (params) => {
      chamadas.push(structuredClone(params))
      const proxima = fila.shift()
      return proxima ? Promise.resolve(proxima) : Promise.reject(new Error('sem resposta roteirizada'))
    },
  }
  return { rodar: createRunner({ db, modelo, log: () => {} }), eventos, fechamentos, chamadas }
}

const escolha = (...ids: string[]) => resposta(JSON.stringify({ agentes: ids, resposta_direta: '' }))

Deno.test('a ponte: cada Agente recebe a instrução de desfecho, e o consumo de cada chamada vai para o evento', async () => {
  const { rodar, eventos, chamadas, fechamentos } = montar(reserva(), [
    resposta(JSON.stringify({ agentes: [SCOPUS.id, ETHOS.id], resposta_direta: '' }), { input_tokens: 10, output_tokens: 5 }),
    resposta('ICP: incorporadoras.\nSTATUS: pronto', { input_tokens: 100, output_tokens: 20 }),
    resposta('Persona: diretor.\nSTATUS: pronto', { input_tokens: 150, output_tokens: 30 }),
    resposta('Tudo junto.', { input_tokens: 200, output_tokens: 40 }),
  ])
  await rodar('r1')

  assertStringIncludes(String(chamadas[1].system), 'STATUS: pergunta')
  assertEquals(eventos[1].payload, { texto: 'ICP: incorporadoras.', uso: { entrada: 100, saida: 20 } })
  assertEquals(eventos[3].payload, { texto: 'Persona: diretor.', uso: { entrada: 150, saida: 30 } })
  assertEquals(eventos[4].payload, { texto: 'Tudo junto.', uso: { entrada: 210, saida: 45 } })
  assertStringIncludes(String(chamadas[2].messages.at(-1)!.content), 'Scopus: ICP: incorporadoras.')
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
})

Deno.test('a ponte: quem pede para continuar volta na rodada seguinte e vê a fala do outro Agente', async () => {
  const { rodar, eventos, chamadas } = montar(reserva(), [
    escolha(SCOPUS.id, ETHOS.id),
    resposta('Rascunho do ICP.\nSTATUS: continuar'),
    resposta('Persona a partir do rascunho.'),
    resposta('ICP final, com a Persona.'),
    resposta('Resumo.'),
  ])
  await rodar('r1')

  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId ?? '-'}`), [
    `chamada:${SCOPUS.id}`, `feito:${SCOPUS.id}`,
    `chamada:${ETHOS.id}`, `feito:${ETHOS.id}`,
    `chamada:${SCOPUS.id}`, `feito:${SCOPUS.id}`,
    'resposta:-',
  ])
  assertStringIncludes(String(chamadas[3].messages.at(-1)!.content), 'Ethos: Persona a partir do rascunho.')
  assertEquals(eventos[4].payload, { rodada: 2 })
})

Deno.test('a ponte: a pergunta de um Agente vira a resposta, sem juntar nem chamar os outros', async () => {
  const { rodar, eventos, chamadas, fechamentos } = montar(reserva(), [
    escolha(SCOPUS.id, ETHOS.id),
    resposta('Qual é o ticket médio?\nSTATUS: pergunta'),
  ])
  await rodar('r1')

  assertEquals(chamadas.length, 2)
  assertEquals(eventos.at(-1)?.payload, { texto: 'Scopus precisa de uma informação sua para continuar: Qual é o ticket médio?' })
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
})

Deno.test('a ponte: "fui acionado" no lugar do trabalho fecha como falha model_empty', async () => {
  const { rodar, fechamentos, eventos } = montar(reserva(), [escolha(SCOPUS.id), resposta('Fui acionado para ajudar.')])
  await rodar('r1')

  assertEquals(fechamentos, [{ status: 'failed', errorCode: 'model_empty' }])
  assertEquals(eventos.map((e) => e.kind), ['chamada'])
})

Deno.test('a ponte: o Agente recebe o Playbook da Especialidade dele, e sem Empresa é mandado perguntar', async () => {
  const eventos: string[] = []
  const pedidos: string[] = []
  const secoes = [{ section: 'icp', name: 'ICP', content: { texto: 'Incorporadoras de médio porte.' } }]
  const db: RunDb = {
    claim: () => Promise.resolve(reserva()),
    append: (_r, kind) => (eventos.push(kind), Promise.resolve(eventos.length)),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
    playbook: (_r, specialty) => (pedidos.push(specialty), Promise.resolve(secoes)),
  }
  const chamadas: Params[] = []
  const fila = [escolha(SCOPUS.id), resposta('Sem a Empresa, o que vocês vendem?\nSTATUS: pergunta')]
  const modelo: Modelo = {
    nome: 'm',
    criar: (params) => (chamadas.push(structuredClone(params)), Promise.resolve(fila.shift()!)),
  }
  await createRunner({ db, modelo, log: () => {} })('r1')

  assertEquals(pedidos, ['scopus'])
  const sistema = String(chamadas[1].system)
  assertStringIncludes(sistema, '### ICP\nIncorporadoras de médio porte.')
  assertStringIncludes(sistema, 'ainda não tem a seção Empresa')
  assertStringIncludes(sistema, '(Playbook, seção ICP)')
  assertEquals(eventos.at(-1), 'resposta')
})
