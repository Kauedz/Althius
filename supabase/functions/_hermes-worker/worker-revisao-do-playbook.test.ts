// A proposta de mudança no Playbook pelo Hermes (CRM-09): o Ethos pede `propor_mudanca_no_playbook` em JSON, o worker
// executa pelo mesmo catálogo da ponte, grava o passo com o link da Aprovação e devolve o resultado ao Hermes. Sem as
// ferramentas (HERMES_FERRAMENTAS=off), nada é proposto. Hermes, banco e ferramentas são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { BancoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import type { AgenteDoWorkspace, Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type FimDoHermes, type Hermes } from './worker.ts'

const ETHOS: AgenteDoWorkspace = { id: 'a-ethos', name: 'Ethos', specialty: 'ethos', kind: 'padrao', instructions: '', voice_tone: '' }
const RESERVA: Reserva = {
  run_id: 'r1',
  kind: 'agente',
  workspace_name: 'Norte',
  request_text: 'O decisor agora é o diretor industrial; ajuste as Personas',
  agent_id: ETHOS.id,
  mentions: [],
  agents: [ETHOS],
  history: [],
}

function montar(saidas: string[], opcoes: { semFerramentas?: boolean } = {}) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const chamadas: CorpoDoRun[] = []
  const revisoes: string[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(RESERVA),
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
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u-1', permissoes: [] }),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporRevisao: (runId, agenteId, a) => (
      revisoes.push(`${runId}:${agenteId}:${a.secao}:${JSON.stringify(a.conteudo.linhas)}`),
        Promise.resolve({ approvalId: 'ap-personas', outcome: 'pendente', secao: 'Personas', versaoBase: 0 })
    ),
  }
  const worker = createWorker({
    db,
    hermes,
    log: () => {},
    porAgente: true,
    ...(opcoes.semFerramentas ? {} : { ferramentas: { banco, log: () => {} } }),
  })
  return { worker, eventos, fechamentos, chamadas, revisoes }
}

const PEDIDO = JSON.stringify({
  ferramenta: 'propor_mudanca_no_playbook',
  entrada: {
    secao: 'personas',
    conteudo: { linhas: [{ papel: 'Decisor', cargo: 'Diretor industrial' }] },
    justificativa: 'Nas duas últimas reuniões, quem decidiu foi o diretor industrial.',
  },
})

Deno.test('o Ethos propõe as Personas pelo Hermes: o worker cria a Aprovação e grava o passo com o link', async () => {
  const m = montar([PEDIDO, 'Propus as Personas novas; dependem da Aprovação de um Administrador.\nSTATUS: pronto'])
  assertEquals(await m.worker.rodada(), 1)

  assertEquals(m.fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertEquals(m.revisoes, ['r1:a-ethos:personas:[{"papel":"Decisor","cargo":"Diretor industrial"}]'])
  assertEquals(m.eventos.map((e) => e.kind), ['ferramenta', 'texto'])
  assertEquals(m.eventos[0].payload, {
    ferramenta: 'propor_mudanca_no_playbook',
    descricao: 'Ethos propôs uma nova versão das Personas — aguardando Aprovação de um Administrador',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-personas' },
  })
  assertStringIncludes(m.chamadas[0].instructions, 'propor_mudanca_no_playbook')
  assertStringIncludes(m.chamadas[0].instructions, 'mudança no Playbook que precisa de Aprovação')
  assertStringIncludes(m.chamadas[1].input, 'O Playbook não mudou ainda')
})

Deno.test('com as ferramentas desligadas, o Hermes não recebe a proposta e nada é criado', async () => {
  const m = montar([`${PEDIDO}\nSTATUS: pronto`], { semFerramentas: true })
  await m.worker.rodada()
  assertEquals(m.revisoes, [])
  assertEquals(m.eventos.map((e) => e.kind), ['texto'])
  assert(!m.chamadas[0].instructions.includes('propor_mudanca_no_playbook'))
})
