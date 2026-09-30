import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type AgenteDoWorkspace,
  type ContaEncontrada,
  type Reserva,
  type TipoDeEvento,
} from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type FimDoHermes, type Hermes } from './worker.ts'

const SCOPUS: AgenteDoWorkspace = {
  id: 'a-scopus',
  name: 'Scopus',
  specialty: 'scopus',
  kind: 'padrao',
  instructions: 'Priorize incorporadoras.',
  voice_tone: '',
}
const ETHOS: AgenteDoWorkspace = { ...SCOPUS, id: 'a-ethos', name: 'Ethos', specialty: 'ethos', instructions: '' }
const ALFA: ContaEncontrada = {
  name: 'Alfa',
  domain: 'alfa.com.br',
  segment: null,
  origin: 'manual',
  last_interaction_at: null,
}

function reserva(extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'coordenada',
    workspace_name: 'Norte',
    request_text: 'Montem o ICP e as Personas.',
    agent_id: null,
    mentions: [],
    agents: [SCOPUS, ETHOS],
    history: [{ request: 'Oi', answer: 'Olá.' }],
    ...extra,
  }
}

type Chamada = { corpo: CorpoDoRun; chave: string }

/** Um Hermes que responde pelo passo: escolha, síntese ou o Agente da instrução. */
function montar(
  responder: (chamada: Chamada, n: number) => FimDoHermes | Error,
  reservada: Reserva = reserva(),
) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const chamadas: Chamada[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(reservada),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([ALFA]),
  }
  let atual: Chamada | null = null
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo, chave) => ((atual = { corpo, chave }), chamadas.push(atual), Promise.resolve(`h${chamadas.length}`)),
    aguardar: () => {
      const fim = responder(atual!, chamadas.length)
      return fim instanceof Error ? Promise.reject(fim) : Promise.resolve(fim)
    },
  }
  return { worker: createWorker({ db, hermes, log: () => {}, porAgente: true }), eventos, fechamentos, chamadas }
}

const ok = (output: string): FimDoHermes => ({ status: 'completed', output })
const passoDe = (c: Chamada) =>
  c.chave.endsWith('-escolha') ? 'escolha' : c.chave.endsWith('-sintese') ? 'sintese' : c.chave.replace('althius-r1-', '')

Deno.test('por Agente: escolha, uma chamada ao Hermes por Agente na vez dele e a síntese, com os eventos do módulo', async () => {
  const { worker, eventos, fechamentos, chamadas } = montar((c) => {
    switch (passoDe(c)) {
      case 'escolha':
        return ok('```json\n{"agentes":["a-scopus","a-ethos"],"resposta_direta":""}\n```')
      case 'a-scopus-r1':
        return ok('ICP: incorporadoras de médio porte.\nSTATUS: pronto')
      case 'a-ethos-r1':
        return ok('<think>...</think>Persona: diretor comercial.\nSTATUS: pronto')
      default:
        return ok('O ICP são incorporadoras de médio porte e a Persona é o diretor comercial.')
    }
  })

  assertEquals(await worker.rodada(), 1)
  assertEquals(chamadas.map(passoDe), ['escolha', 'a-scopus-r1', 'a-ethos-r1', 'sintese'])
  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId ?? '-'}`), [
    'chamada:a-scopus',
    'feito:a-scopus',
    'chamada:a-ethos',
    'feito:a-ethos',
    'resposta:-',
  ])
  assertEquals(eventos[1].payload, { texto: 'ICP: incorporadoras de médio porte.' })
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])

  // O Ethos leu o que o Scopus disse, e cada Agente recebeu as próprias instruções e as Contas-alvo.
  assertStringIncludes(chamadas[2].corpo.input, 'Scopus: ICP: incorporadoras de médio porte.')
  assertStringIncludes(chamadas[1].corpo.instructions, 'Você é Scopus')
  assertStringIncludes(chamadas[1].corpo.instructions, 'Priorize incorporadoras.')
  assertStringIncludes(chamadas[1].corpo.instructions, '"alfa.com.br"')
  assertStringIncludes(chamadas[1].corpo.instructions, 'STATUS: pergunta')
  assertStringIncludes(chamadas[1].corpo.instructions, 'Nunca diga o nome do motor')
  assertEquals(chamadas[1].corpo.conversation_history, [
    { role: 'user', content: 'Oi' },
    { role: 'assistant', content: 'Olá.' },
  ])
})

Deno.test('por Agente: as chaves de idempotência são por passo, para uma nova tentativa não repetir o trabalho', async () => {
  const { worker, chamadas } = montar((c) =>
    passoDe(c) === 'escolha'
      ? ok('{"agentes":["a-scopus"],"resposta_direta":""}')
      : ok(passoDe(c) === 'sintese' ? 'Resumo.' : 'Trabalho feito.')
  )
  await worker.rodada()
  assertEquals(chamadas.map((c) => c.chave), ['althius-r1-escolha', 'althius-r1-a-scopus-r1', 'althius-r1-sintese'])
})

Deno.test('por Agente: quem pede para continuar volta na rodada seguinte, e a chave muda com a rodada', async () => {
  let vezes = 0
  const { worker, chamadas, eventos } = montar((c) => {
    if (passoDe(c) === 'escolha') return ok('{"agentes":["a-scopus","a-ethos"],"resposta_direta":""}')
    if (passoDe(c) === 'a-scopus-r1') return ok('Rascunho.\nSTATUS: continuar')
    if (passoDe(c) === 'sintese') return ok('Juntei tudo.')
    vezes++
    return ok('Persona pronta.')
  })
  await worker.rodada()
  assertEquals(chamadas.map(passoDe), ['escolha', 'a-scopus-r1', 'a-ethos-r1', 'a-scopus-r2', 'sintese'])
  assertEquals(vezes, 2)
  assertEquals(eventos[4].payload, { rodada: 2 })
})

Deno.test('por Agente: uma pergunta ao usuário encerra a Conversa sem síntese', async () => {
  const { worker, chamadas, eventos, fechamentos } = montar((c) =>
    passoDe(c) === 'escolha'
      ? ok('{"agentes":["a-scopus","a-ethos"],"resposta_direta":""}')
      : ok('Qual o ticket médio dos seus melhores clientes?\nSTATUS: pergunta')
  )
  await worker.rodada()
  assertEquals(chamadas.map(passoDe), ['escolha', 'a-scopus-r1'])
  assertEquals(eventos.at(-1), {
    kind: 'resposta',
    agentId: null,
    payload: { texto: 'Scopus precisa de uma informação sua para continuar: Qual o ticket médio dos seus melhores clientes?' },
  })
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
})

Deno.test('por Agente: na página do Agente, ele responde numa chamada só e o mencionado entra depois', async () => {
  const { worker, chamadas, eventos } = montar(
    (c) => ok(passoDe(c) === 'a-scopus-r1' ? 'ICP em uma linha.' : 'Persona em uma linha.'),
    reserva({ kind: 'agente', agent_id: SCOPUS.id, mentions: [ETHOS.id] }),
  )
  await worker.rodada()
  assertEquals(chamadas.map(passoDe), ['a-scopus-r1', 'a-ethos-r1'])
  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId}`), ['texto:a-scopus', 'texto:a-ethos'])
})

Deno.test('por Agente: escolha que não é JSON, etapa sem trabalho e Hermes fora viram falha com motivo', async () => {
  const casos: [(c: Chamada) => FimDoHermes | Error, string][] = [
    [() => ok('não sei escolher'), 'model_invalid_output'],
    [(c) => (passoDe(c) === 'escolha' ? ok('{"agentes":["a-scopus"],"resposta_direta":""}') : ok('Fui acionado.')), 'model_empty'],
    [() => new Error('conexão recusada'), 'hermes_unreachable'],
    [() => ({ status: 'timeout', error: 'prazo' }), 'timeout'],
    [() => ({ status: 'failed', error: 'provider' }), 'hermes_failed'],
  ]
  for (const [responder, codigo] of casos) {
    const { worker, eventos, fechamentos } = montar(responder)
    await worker.rodada()
    assertEquals(eventos.filter((e) => e.kind === 'resposta' || e.kind === 'feito'), [], codigo)
    assertEquals(fechamentos, [{ status: 'failed', errorCode: codigo }], codigo)
  }
})

Deno.test('por Agente: o Hermes recebe o Playbook da Especialidade de cada Agente nas instruções dele', async () => {
  const lidos: string[] = []
  const eventos: string[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(reserva()),
    append: (_r, kind) => (eventos.push(kind), Promise.resolve(eventos.length)),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([ALFA]),
    playbook: (_r, specialty) => (
      lidos.push(specialty),
      Promise.resolve(
        specialty === 'scopus'
          ? [
            { section: 'empresa', name: 'Empresa', content: { texto: 'A Norte vende software.' } },
            { section: 'icp', name: 'ICP', content: { texto: 'Incorporadoras de médio porte.' } },
          ]
          : [],
      )
    ),
  }
  const corpos: CorpoDoRun[] = []
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo) => (corpos.push(corpo), Promise.resolve('h')),
    aguardar: () =>
      Promise.resolve(ok(corpos.length === 1 ? '{"agentes":["a-scopus","a-ethos"],"resposta_direta":""}' : 'Feito.')),
  }
  await createWorker({ db, hermes, log: () => {}, porAgente: true }).rodada()

  assertEquals(lidos, ['scopus', 'ethos'])
  const doScopus = corpos.find((c) => c.instructions.includes('Você é Scopus'))!
  assertStringIncludes(doScopus.instructions, '### ICP\nIncorporadoras de médio porte.')
  assertStringIncludes(doScopus.instructions, '(Playbook, seção ICP)')
  const doEthos = corpos.find((c) => c.instructions.includes('Você é Ethos'))!
  assertStringIncludes(doEthos.instructions, 'ainda não tem a seção Empresa')
})

Deno.test('por Agente: o custo da Execução é registrado depois de fechá-la, no sucesso e na falha', async () => {
  for (const [responder, esperado] of [
    [(c: Chamada) => (passoDe(c) === 'escolha' ? ok('{"agentes":[],"resposta_direta":"Oi!"}') : ok('x')), 'succeeded'],
    [() => ({ status: 'failed', error: 'provider' }) as FimDoHermes, 'failed'],
  ] as const) {
    const passos: string[] = []
    const db: FilaDb = {
      listQueued: () => Promise.resolve(['r1']),
      claim: () => Promise.resolve(reserva()),
      append: () => Promise.resolve(1),
      finish: (_r, status) => (passos.push(`finish:${status}`), Promise.resolve()),
      searchAccounts: () => Promise.resolve([]),
      custo: (runId) => (passos.push(`custo:${runId}`), Promise.resolve()),
    }
    const chamadas: Chamada[] = []
    const hermes: Hermes = {
      vivo: () => Promise.resolve(true),
      iniciar: (corpo, chave) => (chamadas.push({ corpo, chave }), Promise.resolve('h')),
      aguardar: () => Promise.resolve(responder(chamadas.at(-1)!)),
    }
    await createWorker({ db, hermes, log: () => {}, porAgente: true }).rodada()
    assertEquals(passos, [`finish:${esperado}`, 'custo:r1'])
  }
})
