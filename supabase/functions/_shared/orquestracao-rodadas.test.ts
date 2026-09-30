import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  type AgenteDoWorkspace,
  conversarNaPagina,
  coordenarPedido,
  ErroDoModelo,
  type Executor,
  lerDesfecho,
  MAX_RODADAS_DO_PEDIDO,
  type Reserva,
  type ResultadoDoAgente,
  rodarRodadas,
  somarUso,
  textoDeEtapaValido,
  type TipoDeEvento,
  type UsoDeTokens,
} from './orquestracao.ts'

const agente = (id: string, specialty: string): AgenteDoWorkspace => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  specialty,
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
})
const SCOPUS = agente('scopus', 'scopus')
const ETHOS = agente('ethos', 'ethos')

function reserva(extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'coordenada',
    workspace_name: 'Norte',
    request_text: 'Montem o ICP e as Personas.',
    agent_id: null,
    mentions: [],
    agents: [SCOPUS, ETHOS],
    history: [],
    ...extra,
  }
}

function banco() {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  return {
    eventos,
    db: {
      claim: () => Promise.resolve(null),
      append: (_r: string, kind: TipoDeEvento, agentId: string | null, payload: Record<string, unknown>) =>
        (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
      finish: () => Promise.resolve(),
      searchAccounts: () => Promise.resolve([]),
    },
  }
}

/** Um executor de mentira: cada Agente responde o que o roteiro manda, na ordem em que é chamado. */
function executor(
  roteiro: Record<string, (ResultadoDoAgente | string)[]>,
  extra: Partial<Executor> = {},
) {
  const vistas: { agente: string; rodada: number; falas: string[] }[] = []
  const usados: Record<string, number> = {}
  const e: Executor = {
    escolher: () => Promise.resolve({ agentes: ['scopus', 'ethos'], resposta_direta: '' }),
    trabalhar: (a, falas, rodada) => {
      vistas.push({ agente: a.id, rodada, falas: falas.map((f) => `${f.agente.name}:${f.texto}`) })
      const i = usados[a.id] ?? 0
      usados[a.id] = i + 1
      const passo = roteiro[a.id][i]
      return Promise.resolve(typeof passo === 'string' ? { texto: passo } : passo)
    },
    sintetizar: (falas) => Promise.resolve({ texto: `Resumo de ${falas.length} falas.` }),
    ...extra,
  }
  return { e, vistas }
}

Deno.test('lerDesfecho: a última linha STATUS sai do texto e diz como o Agente terminou', () => {
  assertEquals(lerDesfecho('ICP pronto.\nSTATUS: pronto'), { texto: 'ICP pronto.', desfecho: 'pronto' })
  assertEquals(lerDesfecho('Qual o ticket médio?\n**STATUS: PERGUNTA**'), {
    texto: 'Qual o ticket médio?',
    desfecho: 'pergunta',
  })
  assertEquals(lerDesfecho('Falta ver o Ethos.\nstatus: continuar.'), { texto: 'Falta ver o Ethos.', desfecho: 'continuar' })
  assertEquals(lerDesfecho('Sem linha de status.'), { texto: 'Sem linha de status.', desfecho: 'pronto' })
  assertEquals(lerDesfecho('STATUS: talvez'), { texto: 'STATUS: talvez', desfecho: 'pronto' })
})

Deno.test('etapa sem trabalho: vazia ou só o aviso de que foi acionado não vale', () => {
  for (const ruim of ['', '   ', 'Fui acionado.', 'Fui acionado para ajudar com o ICP.', 'Os agentes conversaram sobre o ICP.', 'Conversamos sobre isso']) {
    assertEquals(textoDeEtapaValido(ruim), false, ruim)
  }
  assertEquals(textoDeEtapaValido('O ICP são incorporadoras de médio porte.'), true)
  assertEquals(textoDeEtapaValido('Vi que a Norte foi acionada pela Alfa, e a resposta é a seguinte: ...'), true)
})

Deno.test('cada Agente fala na sua vez e vê o que os anteriores disseram', async () => {
  const { e, vistas } = executor({ scopus: ['ICP: incorporadoras.'], ethos: ['Persona: diretor comercial.'] })
  const { eventos, db } = banco()
  await coordenarPedido({ reserva: reserva(), db, executor: e })

  assertEquals(vistas, [
    { agente: 'scopus', rodada: 1, falas: [] },
    { agente: 'ethos', rodada: 1, falas: ['Scopus:ICP: incorporadoras.'] },
  ])
  assertEquals(eventos.map((ev) => `${ev.kind}:${ev.agentId ?? '-'}`), [
    'chamada:scopus',
    'feito:scopus',
    'chamada:ethos',
    'feito:ethos',
    'resposta:-',
  ])
  assertEquals(eventos[4].payload, { texto: 'Resumo de 2 falas.' })
})

Deno.test('quem pede para continuar volta a falar na rodada seguinte, vendo todas as falas', async () => {
  const { e, vistas } = executor({
    scopus: ['Rascunho do ICP.\nSTATUS: continuar', 'ICP final, já com a Persona.\nSTATUS: pronto'],
    ethos: ['Persona baseada no ICP.'],
  })
  const { eventos, db } = banco()
  await coordenarPedido({ reserva: reserva(), db, executor: e })

  assertEquals(vistas.map((v) => `${v.agente}@${v.rodada}`), ['scopus@1', 'ethos@1', 'scopus@2'])
  assertEquals(vistas[2].falas, ['Scopus:Rascunho do ICP.', 'Ethos:Persona baseada no ICP.'])
  assertEquals(eventos.map((ev) => `${ev.kind}:${ev.agentId ?? '-'}`), [
    'chamada:scopus', 'feito:scopus', 'chamada:ethos', 'feito:ethos', 'chamada:scopus', 'feito:scopus', 'resposta:-',
  ])
  assertEquals(eventos[4].payload, { rodada: 2 })
  assertEquals(eventos[5].payload, { texto: 'ICP final, já com a Persona.' })
})

Deno.test('no máximo 3 rodadas, mesmo que o Agente peça para continuar sempre', async () => {
  const sempre = 'Ainda falta.\nSTATUS: continuar'
  const { e, vistas } = executor({ scopus: [sempre, sempre, sempre, sempre, sempre], ethos: ['Pronto.'] })
  const { db } = banco()
  await coordenarPedido({ reserva: reserva(), db, executor: e })

  assertEquals(MAX_RODADAS_DO_PEDIDO, 3)
  assertEquals(vistas.filter((v) => v.agente === 'scopus').length, 3)
  assertEquals(Math.max(...vistas.map((v) => v.rodada)), 3)
})

Deno.test('um Agente que precisa de informação encerra a Conversa com a pergunta ao usuário', async () => {
  const { e, vistas } = executor({
    scopus: ['Qual é o ticket médio dos seus melhores clientes?\nSTATUS: pergunta'],
    ethos: ['nunca deve falar'],
  })
  const { eventos, db } = banco()
  await coordenarPedido({ reserva: reserva(), db, executor: e })

  assertEquals(vistas.map((v) => v.agente), ['scopus'])
  assertEquals(eventos.map((ev) => `${ev.kind}:${ev.agentId ?? '-'}`), ['chamada:scopus', 'feito:scopus', 'resposta:-'])
  assertEquals(eventos[2].payload, {
    texto: 'Scopus precisa de uma informação sua para continuar: Qual é o ticket médio dos seus melhores clientes?',
  })
})

Deno.test('etapa sem conteúdo ("fui acionado") é falha model_empty, não resposta', async () => {
  for (const ruim of ['Fui acionado.', '', 'Os agentes conversaram sobre o assunto.']) {
    const { e } = executor({ scopus: [ruim], ethos: ['x'] })
    const { eventos, db } = banco()
    const erro = await assertRejects(() => coordenarPedido({ reserva: reserva(), db, executor: e }), ErroDoModelo)
    assertEquals(erro.codigo, 'model_empty')
    assertEquals(eventos.map((ev) => ev.kind), ['chamada'])
  }
})

Deno.test('o consumo de cada chamada fica no evento, e o da Coordenação na resposta', async () => {
  const uso = (entrada: number, saida: number): UsoDeTokens => ({ entrada, saida })
  const { e } = executor(
    { scopus: [{ texto: 'ICP.', uso: uso(100, 20) }], ethos: [{ texto: 'Persona.', uso: uso(150, 30) }] },
    {
      escolher: () => Promise.resolve({ agentes: ['scopus', 'ethos'], resposta_direta: '', uso: uso(10, 5) }),
      sintetizar: () => Promise.resolve({ texto: 'Junto.', uso: uso(200, 40) }),
    },
  )
  const { eventos, db } = banco()
  await coordenarPedido({ reserva: reserva(), db, executor: e })

  assertEquals(eventos[1].payload, { texto: 'ICP.', uso: uso(100, 20) })
  assertEquals(eventos[3].payload, { texto: 'Persona.', uso: uso(150, 30) })
  assertEquals(eventos[4].payload, { texto: 'Junto.', uso: uso(210, 45) })
  assertEquals(somarUso(undefined, undefined), undefined)
})

Deno.test('sem Agente escolhido, a Coordenação responde direto; sem resposta direta, é falha', async () => {
  const direto = executor({}, { escolher: () => Promise.resolve({ agentes: [], resposta_direta: ' Oi! ' }) })
  const a = banco()
  await coordenarPedido({ reserva: reserva(), db: a.db, executor: direto.e })
  assertEquals(a.eventos, [{ kind: 'resposta', agentId: null, payload: { texto: 'Oi!' } }])

  const vazio = executor({}, { escolher: () => Promise.resolve({ agentes: [], resposta_direta: '' }) })
  await assertRejects(
    () => coordenarPedido({ reserva: reserva(), db: banco().db, executor: vazio.e }),
    ErroDoModelo,
    'model_empty',
  )
})

Deno.test('na página do Agente, cada um grava um texto e quem pede continua na rodada seguinte', async () => {
  const { e, vistas } = executor({
    scopus: ['Primeira parte.\nSTATUS: continuar', 'Parte final.'],
    ethos: ['Contribuição da persona.'],
  })
  const { eventos, db } = banco()
  await conversarNaPagina({
    reserva: reserva({ kind: 'agente', agent_id: 'scopus', mentions: ['ethos'] }),
    db,
    executor: e,
  })

  assertEquals(vistas.map((v) => `${v.agente}@${v.rodada}`), ['scopus@1', 'ethos@1', 'scopus@2'])
  assertEquals(eventos.map((ev) => `${ev.kind}:${ev.agentId}`), ['texto:scopus', 'texto:ethos', 'texto:scopus'])
})

Deno.test('rodarRodadas sem Agentes não chama ninguém', async () => {
  const { e, vistas } = executor({})
  const resultado = await rodarRodadas({ agentes: [], executor: e, aoFalar: () => Promise.resolve() })
  assertEquals([resultado.falas.length, resultado.pergunta, vistas.length], [0, null, 0])
})
