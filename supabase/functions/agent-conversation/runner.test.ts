import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import {
  type AgenteDoWorkspace,
  type ContaEncontrada,
  createRunner,
  ErroDoModelo,
  type Modelo,
  type Reserva,
  type RunDb,
  type TipoDeEvento,
} from './runner.ts'

type Params = Parameters<Modelo['criar']>[0]
type Mensagem = Anthropic.Beta.Messages.BetaMessage

const SCOPUS: AgenteDoWorkspace = {
  id: 'a0000000-0000-0000-0000-000000000001',
  name: 'Scopus',
  specialty: 'scopus',
  kind: 'padrao',
  instructions: 'Priorize incorporadoras.',
  voice_tone: 'direto',
}
const RHETOR: AgenteDoWorkspace = {
  ...SCOPUS,
  id: 'a0000000-0000-0000-0000-000000000003',
  name: 'Rhetor',
  specialty: 'rhetor',
  instructions: '',
}
const ALFA: ContaEncontrada = {
  name: 'Alfa Incorporadora',
  domain: 'alfa.com.br',
  segment: 'Incorporação',
  origin: 'manual',
  last_interaction_at: null,
}

function reserva(extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'coordenada',
    workspace_name: 'Norte',
    request_text: 'Quais Contas da Alfa temos?',
    agent_id: null,
    mentions: [],
    agents: [SCOPUS, RHETOR],
    history: [],
    ...extra,
  }
}

function mensagem(stop_reason: Mensagem['stop_reason'], content: unknown[]): Mensagem {
  return { stop_reason, content } as unknown as Mensagem
}
const texto = (t: string) => mensagem('end_turn', [{ type: 'text', text: t }])
const busca = (termo: unknown, id = 'tu1') =>
  mensagem('tool_use', [{ type: 'tool_use', id, name: 'buscar_contas_alvo', input: { termo } }])

function montar({
  reservada = reserva() as Reserva | null,
  respostas = [] as (Mensagem | Error)[],
  contas = [ALFA] as ContaEncontrada[] | Error,
} = {}) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null; model: string | null }[] = []
  const chamadas: Params[] = []
  const buscas: string[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(reservada),
    append: (_runId, kind, agentId, payload) => {
      eventos.push({ kind, agentId, payload })
      return Promise.resolve(eventos.length)
    },
    finish: (_runId, status, errorCode, model) => {
      fechamentos.push({ status, errorCode, model })
      return Promise.resolve()
    },
    searchAccounts: (_runId, termo) => {
      buscas.push(termo)
      return contas instanceof Error ? Promise.reject(contas) : Promise.resolve(contas)
    },
  }
  const fila = [...respostas]
  const modelo: Modelo = {
    nome: 'claude-opus-5-5',
    criar: (params) => {
      chamadas.push(structuredClone(params))
      const proxima = fila.shift()
      if (!proxima) return Promise.reject(new Error('sem resposta roteirizada'))
      return proxima instanceof Error ? Promise.reject(proxima) : Promise.resolve(proxima)
    },
  }
  return { rodar: createRunner({ db, modelo, log: () => {} }), eventos, fechamentos, chamadas, buscas }
}

Deno.test('a Coordenação chama o Agente escolhido, que consulta as Contas-alvo, e junta a resposta', async () => {
  const { rodar, eventos, fechamentos, chamadas, buscas } = montar({
    respostas: [
      texto(JSON.stringify({ agentes: [SCOPUS.id], resposta_direta: '' })),
      busca('Alfa'),
      texto('Achei a Alfa Incorporadora.'),
      texto('Temos a Alfa Incorporadora (Scopus).'),
    ],
  })
  await rodar('r1')
  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId ?? '-'}`), [
    `chamada:${SCOPUS.id}`,
    `ferramenta:${SCOPUS.id}`,
    `feito:${SCOPUS.id}`,
    'resposta:-',
  ])
  assertEquals(eventos[1].payload, {
    ferramenta: 'buscar_contas_alvo',
    descricao: 'Consultou as Contas-alvo: "Alfa"',
    estado: 'concluida',
    resultados: 1,
  })
  assertEquals(eventos[2].payload, { texto: 'Achei a Alfa Incorporadora.' })
  assertEquals(eventos[3].payload, { texto: 'Temos a Alfa Incorporadora (Scopus).' })
  assertEquals(buscas, ['Alfa'])
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null, model: 'claude-opus-5-5' }])
  // A escolha só aceita ids de Agentes do Workspace; o Agente vê as instruções dele e recebe o resultado da consulta.
  const formato = chamadas[0].output_config?.format as unknown as {
    schema: { properties: { agentes: { items: { enum: string[] } } } }
  }
  assertEquals(formato.schema.properties.agentes.items.enum, [SCOPUS.id, RHETOR.id])
  assertStringIncludes(String(chamadas[1].system), 'Priorize incorporadoras.')
  const resultado = (chamadas[2].messages.at(-1)!.content as { type: string; content: string }[])[0]
  assertEquals([resultado.type, JSON.parse(resultado.content)], ['tool_result', [ALFA]])
})

Deno.test('o @mencionado é chamado mesmo que a Coordenação não o escolha', async () => {
  const { rodar, eventos } = montar({
    reservada: reserva({ mentions: [RHETOR.id] }),
    respostas: [
      texto(JSON.stringify({ agentes: [SCOPUS.id], resposta_direta: '' })),
      texto('Rhetor aqui.'),
      texto('Scopus aqui.'),
      texto('Junto.'),
    ],
  })
  await rodar('r1')
  assertEquals(eventos.filter((e) => e.kind === 'chamada').map((e) => e.agentId), [RHETOR.id, SCOPUS.id])
})

Deno.test('sem Agente necessário, a Coordenação responde direto, sem etapas', async () => {
  const { rodar, eventos, fechamentos } = montar({
    respostas: [texto(JSON.stringify({ agentes: [], resposta_direta: 'Olá! Como posso ajudar?' }))],
  })
  await rodar('r1')
  assertEquals(eventos.map((e) => e.kind), ['resposta'])
  assertEquals(fechamentos[0].status, 'succeeded')
})

Deno.test('uma escolha que não é JSON válido fecha como falha, sem resposta', async () => {
  const { rodar, eventos, fechamentos } = montar({ respostas: [texto('não sei')] })
  await rodar('r1')
  assertEquals(eventos, [])
  assertEquals(fechamentos, [{ status: 'failed', errorCode: 'model_invalid_output', model: 'claude-opus-5-5' }])
})

Deno.test('na página do Agente, ele responde e o mencionado entra em seguida, com o que o primeiro disse', async () => {
  const { rodar, eventos, chamadas } = montar({
    reservada: reserva({
      kind: 'agente',
      agent_id: SCOPUS.id,
      mentions: [RHETOR.id, SCOPUS.id],
      history: [{ request: 'Oi', answer: 'Scopus: Olá.' }],
    }),
    respostas: [texto('A Alfa tem aderência.'), texto('Segue o e-mail.')],
  })
  await rodar('r1')
  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId}`), [`texto:${SCOPUS.id}`, `texto:${RHETOR.id}`])
  assertEquals(chamadas[0].messages.slice(0, 2), [
    { role: 'user', content: 'Oi' },
    { role: 'assistant', content: 'Scopus: Olá.' },
  ])
  assertStringIncludes(String(chamadas[1].messages.at(-1)!.content), 'Scopus: A Alfa tem aderência.')
})

Deno.test('a falha da consulta aparece como falha e o modelo sabe que não pode usar o dado', async () => {
  const { rodar, eventos, chamadas } = montar({
    reservada: reserva({ kind: 'agente', agent_id: SCOPUS.id }),
    respostas: [busca(''), texto('Não consegui consultar agora.')],
    contas: new Error('banco fora'),
  })
  await rodar('r1')
  assertEquals(eventos[0].payload, {
    ferramenta: 'buscar_contas_alvo',
    descricao: 'Consultou as Contas-alvo mais recentes',
    estado: 'falhou',
  })
  const resultado = (chamadas[1].messages.at(-1)!.content as { is_error?: boolean }[])[0]
  assertEquals(resultado.is_error, true)
})

Deno.test('recusa, corte por tamanho e erro da API viram falhas com motivo', async () => {
  const casos: [Mensagem | Error, string][] = [
    [mensagem('refusal', []), 'model_refusal'],
    [mensagem('max_tokens', [{ type: 'text', text: 'pela met' }]), 'model_incomplete'],
    [new ErroDoModelo('model_rate_limited'), 'model_rate_limited'],
    [texto('   '), 'model_empty'],
    [new Error('inesperado'), 'internal_error'],
  ]
  for (const [resposta, codigo] of casos) {
    const { rodar, eventos, fechamentos } = montar({
      reservada: reserva({ kind: 'agente', agent_id: SCOPUS.id }),
      respostas: [resposta],
    })
    await rodar('r1')
    assertEquals(eventos, [], codigo)
    assertEquals(fechamentos, [{ status: 'failed', errorCode: codigo, model: 'claude-opus-5-5' }])
  }
})

Deno.test('um Agente que só consulta, sem parar, fecha como falha', async () => {
  const { rodar, fechamentos, buscas } = montar({
    reservada: reserva({ kind: 'agente', agent_id: SCOPUS.id }),
    respostas: [busca('a', '1'), busca('b', '2'), busca('c', '3'), busca('d', '4')],
  })
  await rodar('r1')
  assertEquals(buscas, ['a', 'b', 'c', 'd'])
  assertEquals(fechamentos[0].errorCode, 'tool_loop_limit')
})

Deno.test('uma consulta com entrada inválida não chega ao banco', async () => {
  const { rodar, eventos, buscas } = montar({
    reservada: reserva({ kind: 'agente', agent_id: SCOPUS.id }),
    respostas: [busca(42), texto('Ok.')],
  })
  await rodar('r1')
  assertEquals(buscas, [])
  assertEquals(eventos[0].payload.estado, 'falhou')
})

Deno.test('sem reserva, nada roda', async () => {
  const { rodar, chamadas, fechamentos } = montar({ reservada: null })
  await rodar('r1')
  assertEquals([chamadas.length, fechamentos.length], [0, 0])
})
