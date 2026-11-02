// A Sequência proposta pela ponte (cadencia-pela-ia 01): o Rhetor recebe `propor_sequencia`, a chamada vira uma
// Aprovação da categoria sequencia pela RPC com a Execução da vez, e o passo da Conversa leva até ela. O Scopus não
// recebe a ferramenta. Banco, modelo e ferramentas são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import type { BancoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import { type AgenteDoWorkspace, createRunner, type Modelo, type Reserva, type RunDb, type TipoDeEvento } from './runner.ts'

type Params = Parameters<Modelo['criar']>[0]
type Mensagem = Anthropic.Beta.Messages.BetaMessage

const SCOPUS: AgenteDoWorkspace = { id: 'a1', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
const RHETOR: AgenteDoWorkspace = { ...SCOPUS, id: 'a3', name: 'Rhetor', specialty: 'rhetor' }
const CONTA = '11111111-1111-4111-8111-111111111111'
const MARIA = '22222222-2222-4222-8222-222222222222'

const reserva: Reserva = {
  run_id: 'r1',
  kind: 'coordenada',
  workspace_name: 'Norte',
  request_text: 'Monte uma Sequência para a Alfa',
  agent_id: null,
  mentions: [],
  agents: [SCOPUS, RHETOR],
  history: [],
}

const nomes = (p: Params) => (p.tools ?? []).map((t) => ('name' in t ? t.name : ''))
const mensagem = (stop_reason: Mensagem['stop_reason'], content: unknown[]) => ({ stop_reason, content }) as unknown as Mensagem
const texto = (t: string) => mensagem('end_turn', [{ type: 'text', text: t }])
const usar = (name: string, input: unknown, id = 'tu1') => mensagem('tool_use', [{ type: 'tool_use', id, name, input }])

Deno.test('o Rhetor propõe a Sequência na Conversa: nasce a Aprovação, e o passo leva até ela', async () => {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: string[] = []
  const chamadas: Params[] = []
  const propostas: string[] = []
  const db: RunDb = {
    claim: () => Promise.resolve(reserva),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status) => (fechamentos.push(status), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const fila = [
    texto(JSON.stringify({ agentes: [RHETOR.id, SCOPUS.id], resposta_direta: '' })),
    usar('propor_sequencia', {
      conta_id: CONTA,
      contatos: [MARIA],
      passos: [{ espera_em_dias: 0, assunto: 'Oi {{primeiro_nome}}', corpo: 'Vi as vagas da {{empresa}}.' }],
      justificativa: 'Sinal de vagas.',
    }),
    texto('Propus a Sequência; ela espera a sua Aprovação.\nSTATUS: pronto'),
    texto('Sem nada a acrescentar.\nSTATUS: pronto'),
    texto('O Rhetor propôs a Sequência da Alfa, que espera a sua Aprovação.'),
  ]
  const modelo: Modelo = {
    nome: 'claude-opus-5-5',
    criar: (params) => {
      chamadas.push(structuredClone(params))
      const proxima = fila.shift()
      return proxima ? Promise.resolve(proxima) : Promise.reject(new Error('sem resposta roteirizada'))
    },
  }
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u-bia', permissoes: [] }),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporSequencia: (runId, agenteId, a) => (
      propostas.push(`${runId}:${agenteId}:${a.targetAccountId}`),
        Promise.resolve({ approvalId: 'ap-seq', outcome: 'pendente', conta: 'Alfa' })
    ),
    contatosParaSequencia: () => Promise.resolve({ contatos: [] }),
  }
  await createRunner({ db, modelo, log: () => {}, ferramentas: { banco, log: () => {} } })('r1')

  assertEquals(fechamentos, ['succeeded'])
  assertEquals(propostas, [`r1:${RHETOR.id}:${CONTA}`])
  const passos = eventos.filter((e) => e.kind === 'ferramenta')
  assertEquals(passos.map((e) => [e.agentId, e.payload]), [[RHETOR.id, {
    ferramenta: 'propor_sequencia',
    descricao: 'Rhetor propôs uma Sequência para a Alfa (1 Contato, 1 e-mail) — aguardando o Vendedor responsável',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-seq' },
  }]])
  assertStringIncludes(JSON.stringify(chamadas[2].messages.at(-1)), 'Nada foi enviado')
  assert(nomes(chamadas[1]).includes('propor_sequencia'))
  assert(!nomes(chamadas[3]).includes('propor_sequencia'))
  assertStringIncludes(String(chamadas[1].system), 'Vendedor responsável aprovar')
})
