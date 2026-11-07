// Só um Administrador altera o Contexto da empresa (contexto-da-empresa 06): a antiga proposta de mudança no Playbook
// (CRM-09) saiu do catálogo, e um Agente que ainda a peça em JSON não cria Aprovação nem grava nada. Hermes, banco e
// ferramentas são dublês.
import { assert, assertEquals } from 'jsr:@std/assert@1'
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
  }
  const worker = createWorker({
    db,
    hermes,
    log: () => {},
    porAgente: true,
    ...(opcoes.semFerramentas ? {} : { ferramentas: { banco, log: () => {} } }),
  })
  return { worker, eventos, fechamentos, chamadas }
}

const PEDIDO = JSON.stringify({
  ferramenta: 'propor_mudanca_no_playbook',
  entrada: {
    secao: 'personas',
    conteudo: { linhas: [{ papel: 'Decisor', cargo: 'Diretor industrial' }] },
    justificativa: 'Nas duas últimas reuniões, quem decidiu foi o diretor industrial.',
  },
})

Deno.test('o Ethos não recebe a proposta de mudança no Playbook e é avisado de que só um Administrador altera o contexto', async () => {
  const m = montar(['As Personas mudariam assim: ...\nSTATUS: pronto'])
  await m.worker.rodada()
  assert(!m.chamadas[0].instructions.includes('propor_mudanca_no_playbook'))
  assert(!m.chamadas[0].instructions.includes('mudança no Playbook'))
})

Deno.test('um pedido da ferramenta antiga em JSON é recusado à vista: nenhuma Aprovação nasce', async () => {
  const m = montar([PEDIDO, 'Não consigo alterar o contexto; um Administrador salva em Configurações.\nSTATUS: pronto'])
  await m.worker.rodada()
  assertEquals(m.eventos.filter((e) => e.kind === 'ferramenta').map((e) => e.payload), [{
    ferramenta: 'invalida',
    descricao: 'Ethos pediu uma ferramenta que não pode usar (propor_mudanca_no_playbook)',
    estado: 'falhou',
  }])
  assertEquals(m.fechamentos.length, 1)
})
