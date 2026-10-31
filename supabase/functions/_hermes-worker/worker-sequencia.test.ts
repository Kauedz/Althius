// A Sequência proposta pelo Hermes (cadencia-pela-ia 01): o Rhetor pede `propor_sequencia` em JSON, o worker executa
// pelo mesmo catálogo da ponte, grava o passo com o link da Aprovação e devolve o resultado ao Hermes. O Ethos não
// recebe a ferramenta. Hermes, banco e ferramentas são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { BancoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import type { AgenteDoWorkspace, Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type FimDoHermes, type Hermes } from './worker.ts'

const RHETOR: AgenteDoWorkspace = { id: 'a-rhetor', name: 'Rhetor', specialty: 'rhetor', kind: 'padrao', instructions: '', voice_tone: '' }
const ETHOS: AgenteDoWorkspace = { ...RHETOR, id: 'a-ethos', name: 'Ethos', specialty: 'ethos' }
const CONTA = '11111111-1111-4111-8111-111111111111'
const MARIA = '22222222-2222-4222-8222-222222222222'

function montar(saidas: string[], agente: AgenteDoWorkspace, history: Reserva['history'] = []) {
  const reserva: Reserva = {
    run_id: 'r1',
    kind: 'agente',
    workspace_name: 'Norte',
    request_text: 'Monte uma Sequência para a Alfa',
    agent_id: agente.id,
    mentions: [],
    agents: [agente],
    history,
  }
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const chamadas: CorpoDoRun[] = []
  const propostas: string[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(reserva),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const fila = [...saidas]
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo) => (chamadas.push(corpo), Promise.resolve(`h${chamadas.length}`)),
    aguardar: (): Promise<FimDoHermes> => Promise.resolve({ status: 'completed', output: fila.shift() ?? '' }),
  }
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u-bia', permissoes: [] }),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporSequencia: (runId, agenteId, a) => (
      propostas.push(`${runId}:${agenteId}:${a.targetAccountId}:${a.contatos.join()}:${a.passos.length}`),
        Promise.resolve({ approvalId: 'ap-seq', outcome: 'pendente', conta: 'Alfa' })
    ),
    contatosParaSequencia: () => Promise.resolve({ contatos: [] }),
  }
  const worker = createWorker({ db, hermes, log: () => {}, porAgente: true, ferramentas: { banco, log: () => {} } })
  return { worker, eventos, fechamentos, chamadas, propostas }
}

const PEDIDO = JSON.stringify({
  ferramenta: 'propor_sequencia',
  entrada: {
    conta_id: CONTA,
    contatos: [MARIA],
    passos: [{ espera_em_dias: 0, assunto: '{{primeiro_nome}}, vi as vagas', corpo: 'Oi {{primeiro_nome}}.' }],
    justificativa: 'A Alfa abriu vagas.',
  },
})

Deno.test('o Rhetor propõe a Sequência pelo Hermes: o worker cria a Aprovação e grava o passo com o link', async () => {
  const m = montar([PEDIDO, 'Propus a Sequência; ela espera a sua Aprovação.\nSTATUS: pronto'], RHETOR)
  assertEquals(await m.worker.rodada(), 1)

  assertEquals(m.fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertEquals(m.propostas, [`r1:a-rhetor:${CONTA}:${MARIA}:1`])
  assertEquals(m.eventos.map((e) => e.kind), ['ferramenta', 'texto'])
  assertEquals(m.eventos[0].payload, {
    ferramenta: 'propor_sequencia',
    descricao: 'Rhetor propôs uma Sequência para a Alfa (1 Contato, 1 e-mail) — aguardando o Vendedor responsável',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-seq' },
  })
  assertStringIncludes(m.chamadas[0].instructions, '### propor_sequencia')
  assertStringIncludes(m.chamadas[0].instructions, 'Vendedor responsável aprovar')
  assertStringIncludes(m.chamadas[1].input, 'espera a decisão do Vendedor responsável')
})

Deno.test('o Ethos também recebe propor_sequencia: o pedido dele vai à RPC, e a guarda do banco decide', async () => {
  const m = montar([PEDIDO, 'Propus a Sequência; ela espera a sua Aprovação.\nSTATUS: pronto'], ETHOS)
  await m.worker.rodada()
  assert(m.chamadas[0].instructions.includes('### propor_sequencia'))
  assertEquals(m.propostas.length, 1)
  assert(m.propostas[0].includes(':a-ethos:'))
})

// A recusa chega ao Rhetor pelo histórico: o banco (`claim_agent_run`) termina a resposta da Execução que propôs com o
// desfecho da Aprovação, e o worker passa essa resposta ao Hermes como fala do assistente.
Deno.test('o Vendedor recusa e pede ajuste: o Rhetor recebe a recusa no histórico da Conversa', async () => {
  const recusada = 'Rhetor: Propus a Sequência para a Alfa.\n\n' +
    'Aprovação "Sequência de E-mail para Alfa": recusada por quem decide. Nada foi feito.'
  const m = montar(['Vou refazer o primeiro e-mail.\nSTATUS: pronto'], RHETOR, [
    { request: 'Monte uma Sequência para a Alfa', answer: recusada },
  ])
  assertEquals(await m.worker.rodada(), 1)

  assertEquals(m.chamadas[0].conversation_history, [
    { role: 'user', content: 'Monte uma Sequência para a Alfa' },
    { role: 'assistant', content: recusada },
  ])
  assertEquals(m.fechamentos, [{ status: 'succeeded', errorCode: null }])
})

// Em produção (d34d955a e a4ab8fe0), "Gerar Sequência" abre uma Conversa coordenada sem Menção (kind = 'coordenada',
// mentions = []) enquanto o worker da VPS tem HERMES_UMA_CHAMADA=true (porAgente = false). Com ferramentas ligadas,
// a Execução precisa ir pelo modo por Agente para que o Rhetor receba `propor_sequencia`, em vez de cair no modo de
// uma chamada sem ferramentas.
Deno.test('Conversa coordenada sem Menção (Gerar Sequência) com porAgente=false e ferramentas ligadas propõe a Sequência', async () => {
  const reserva: Reserva = {
    run_id: 'r-coord',
    kind: 'coordenada',
    workspace_name: 'Norte',
    request_text: `Monte uma Sequência de e-mail para a Conta-alvo Alfa (id ${CONTA}), a partir da Conta enriquecida, do ICP, do Comitê e da Cadência do Playbook.`,
    agent_id: null,
    mentions: [],
    agents: [ETHOS, RHETOR],
    history: [],
  }
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const propostas: string[] = []
  const fila = [
    JSON.stringify({ agentes: [RHETOR.id], resposta_direta: '' }),
    PEDIDO,
    'Propus a Sequência para a Alfa; ela espera a sua Aprovação.\nSTATUS: pergunta',
  ]
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r-coord']),
    claim: () => Promise.resolve(reserva),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: () => Promise.resolve('h-coord'),
    aguardar: (): Promise<FimDoHermes> => Promise.resolve({ status: 'completed', output: fila.shift() ?? '' }),
  }
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u-bia', permissoes: [] }),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporSequencia: (runId, agenteId, a) => (
      propostas.push(`${runId}:${agenteId}:${a.targetAccountId}:${a.contatos.join()}:${a.passos.length}`),
        Promise.resolve({ approvalId: 'ap-seq', outcome: 'pendente', conta: 'Alfa' })
    ),
    contatosParaSequencia: () => Promise.resolve({ contatos: [] }),
  }
  const worker = createWorker({ db, hermes, log: () => {}, porAgente: false, ferramentas: { banco, log: () => {} } })

  assertEquals(await worker.rodada(), 1)
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertEquals(propostas, [`r-coord:a-rhetor:${CONTA}:${MARIA}:1`])
  assertEquals(eventos.map((e) => e.kind), ['chamada', 'ferramenta', 'feito', 'resposta'])
})
