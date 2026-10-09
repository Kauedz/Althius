// A proposta de mudança no Playbook pela ponte (CRM-09): o Scopus recebe `propor_mudanca_no_playbook`, a chamada vira uma
// Aprovação de revisão pela RPC com a Execução da vez, e o passo da Conversa mostra a proposta e leva à Aprovação. O
// Rhetor não recebe a ferramenta. Banco, modelo e ferramentas são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import type { BancoDasFerramentas, ConteudoDoPlaybook } from '../_shared/ferramentas-dos-agentes.ts'
import { type AgenteDoWorkspace, createRunner, type Modelo, type Reserva, type RunDb, type TipoDeEvento } from './runner.ts'

type Params = Parameters<Modelo['criar']>[0]
type Mensagem = Anthropic.Beta.Messages.BetaMessage

const SCOPUS: AgenteDoWorkspace = { id: 'a1', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
const RHETOR: AgenteDoWorkspace = { ...SCOPUS, id: 'a3', name: 'Rhetor', specialty: 'rhetor' }

const reserva: Reserva = {
  run_id: 'r1',
  kind: 'coordenada',
  workspace_name: 'Norte',
  request_text: 'Ajuste o ICP: estamos fechando com indústrias de 200 a 500 pessoas',
  agent_id: null,
  mentions: [],
  agents: [SCOPUS, RHETOR],
  history: [],
}

const nomes = (p: Params) => (p.tools ?? []).map((t) => ('name' in t ? t.name : ''))
const mensagem = (stop_reason: Mensagem['stop_reason'], content: unknown[]) => ({ stop_reason, content }) as unknown as Mensagem
const texto = (t: string) => mensagem('end_turn', [{ type: 'text', text: t }])
const usar = (name: string, input: unknown, id = 'tu1') => mensagem('tool_use', [{ type: 'tool_use', id, name, input }])

function montar(respostas: Mensagem[]) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: string[] = []
  const chamadas: Params[] = []
  const revisoes: { runId: string; agenteId: string; secao: string; conteudo: ConteudoDoPlaybook }[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(reserva),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status) => (fechamentos.push(status), Promise.resolve()),
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
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'usuario-bruno', permissoes: [] }),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporRevisao: (runId, agenteId, a) => (
      revisoes.push({ runId, agenteId, secao: a.secao, conteudo: a.conteudo }),
        Promise.resolve({ approvalId: 'ap-icp', outcome: 'pendente', secao: 'ICP', versaoBase: 1 })
    ),
  }
  const rodar = createRunner({ db, modelo, log: () => {}, ferramentas: { banco, log: () => {} } })
  return { rodar, eventos, fechamentos, chamadas, revisoes }
}

Deno.test('o Scopus propõe uma nova versão do ICP na Conversa: nasce a Aprovação, e o passo leva até ela', async () => {
  const m = montar([
    texto(JSON.stringify({ agentes: [SCOPUS.id, RHETOR.id], resposta_direta: '' })),
    usar('propor_mudanca_no_playbook', {
      secao: 'icp',
      conteudo: { texto: 'Indústrias de 200 a 500 pessoas no Sul e no Sudeste' },
      justificativa: 'Os três últimos fechamentos foram nesse porte.',
    }),
    texto('Propus o ICP novo; ele só vale depois da Aprovação de um Administrador.\nSTATUS: pronto'),
    texto('Sem nada a acrescentar.\nSTATUS: pronto'),
    texto('O Scopus propôs o ICP novo, que espera a Aprovação de um Administrador.'),
  ])
  await m.rodar('r1')

  assertEquals(m.fechamentos, ['succeeded'])
  assertEquals(m.revisoes, [{
    runId: 'r1',
    agenteId: SCOPUS.id,
    secao: 'icp',
    conteudo: { texto: 'Indústrias de 200 a 500 pessoas no Sul e no Sudeste', linhas: [] },
  }])
  const passos = m.eventos.filter((e) => e.kind === 'ferramenta')
  assertEquals(passos.map((e) => [e.agentId, e.payload]), [[SCOPUS.id, {
    ferramenta: 'propor_mudanca_no_playbook',
    descricao: 'Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-icp' },
  }]])
  // O resultado volta ao Scopus dizendo que o Playbook não mudou; o Rhetor não recebe a ferramenta.
  assertStringIncludes(JSON.stringify(m.chamadas[2].messages.at(-1)), 'O Playbook não mudou ainda')
  assert(nomes(m.chamadas[1]).includes('propor_mudanca_no_playbook'))
  assert(!nomes(m.chamadas[3]).includes('propor_mudanca_no_playbook'))
  assertStringIncludes(String(m.chamadas[1].system), 'propor mudanças no Playbook')
})
