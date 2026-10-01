// Os Agentes agem pela ponte (Etapa 5b): o runner expõe ao Agente da vez as ferramentas que a Especialidade e a Permissão
// dele permitem, executa a chamada, grava o passo na Conversa e devolve o resultado para a próxima rodada; o Agente
// seguinte vê o que o anterior fez. Banco, modelo e ferramentas são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import type { BancoDasFerramentas, ContextoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import { type AgenteDoWorkspace, createRunner, type Modelo, type Reserva, type RunDb, type TipoDeEvento } from './runner.ts'

type Params = Parameters<Modelo['criar']>[0]
type Mensagem = Anthropic.Beta.Messages.BetaMessage

const SCOPUS: AgenteDoWorkspace = { id: 'a1', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
const RHETOR: AgenteDoWorkspace = { ...SCOPUS, id: 'a3', name: 'Rhetor', specialty: 'rhetor' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1'

const reserva: Reserva = {
  run_id: 'r1',
  kind: 'coordenada',
  workspace_name: 'Norte',
  request_text: 'Ache as contas quentes e leve a Acme ao HubSpot',
  agent_id: null,
  mentions: [],
  agents: [SCOPUS, RHETOR],
  history: [],
}

const nomes = (p: Params) => (p.tools ?? []).map((t) => ('name' in t ? t.name : ''))
const mensagem = (stop_reason: Mensagem['stop_reason'], content: unknown[]) => ({ stop_reason, content }) as unknown as Mensagem
const texto = (t: string) => mensagem('end_turn', [{ type: 'text', text: t }])
const usar = (name: string, input: unknown, id = 'tu1') => mensagem('tool_use', [{ type: 'tool_use', id, name, input }])

function montar(respostas: Mensagem[], opcoes: { contexto?: ContextoDasFerramentas | Error; semFerramentas?: boolean } = {}) {
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
  const fila = [...respostas]
  const modelo: Modelo = {
    nome: 'claude-opus-5-5',
    criar: (params) => {
      chamadas.push(structuredClone(params))
      const proxima = fila.shift()
      return proxima ? Promise.resolve(proxima) : Promise.reject(new Error('sem resposta roteirizada'))
    },
  }
  const ctx: ContextoDasFerramentas = {
    workspaceId: 'ws-1',
    requestedBy: 'usuario-ana',
    permissoes: [{ agentId: RHETOR.id, integrationId: 'hubspot', permission: 'propor', category: 'CRM', name: 'HubSpot' }],
  }
  const banco: BancoDasFerramentas = {
    contexto: () => opcoes.contexto instanceof Error ? Promise.reject(opcoes.contexto) : Promise.resolve(opcoes.contexto ?? ctx),
    lerContas: () => Promise.resolve([{ id: CONTA, nome: 'Acme', estagio: 'quente', sinais: [{ frase: 'Abriu vaga' }] }]),
    pedirDescoberta: () =>
      Promise.resolve({ discoveryRunId: 'b1', outcome: 'pedido', creditos: 5, saldo: 50, novasNaCaixa: 0, estadoDoActor: 'available' }),
    proporEnvio: (_r, agenteId, a) => (
      propostas.push(`${agenteId}:${a.targetAccountId}:${a.integrationId}`),
        Promise.resolve({ approvalId: 'ap-1', outcome: 'pendente', conta: 'Acme', crm: 'HubSpot' })
    ),
  }
  const rodar = createRunner({ db, modelo, log: () => {}, ...(opcoes.semFerramentas ? {} : { ferramentas: { banco, log: () => {} } }) })
  return { rodar, eventos, fechamentos, chamadas, propostas }
}

Deno.test('o Scopus lê as contas quentes, o Rhetor vê isso e propõe o envio; cada passo aparece na Conversa', async () => {
  const m = montar([
    texto(JSON.stringify({ agentes: [SCOPUS.id, RHETOR.id], resposta_direta: '' })),
    usar('ler_contas_e_sinais', { so_quentes: true }),
    texto('A Acme está quente: abriu vaga.\nSTATUS: pronto'),
    usar('propor_envio_ao_crm', { conta_id: CONTA, crm: 'hubspot', justificativa: 'Abriu vaga' }),
    texto('Propus enviar a Acme ao HubSpot; depende da Aprovação.\nSTATUS: pronto'),
    texto('A Acme está quente e o envio ao HubSpot aguarda Aprovação.'),
  ])
  await m.rodar('r1')
  assertEquals(m.fechamentos, ['succeeded'])
  const passos = m.eventos.filter((e) => e.kind === 'ferramenta')
  assertEquals(passos.map((e) => [e.agentId, e.payload.ferramenta, e.payload.estado]), [
    [SCOPUS.id, 'ler_contas_e_sinais', 'concluida'],
    [RHETOR.id, 'propor_envio_ao_crm', 'aguardando'],
  ])
  assertEquals(passos[1].payload.descricao, 'Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação')
  assertEquals(passos[1].payload.link, { tipo: 'aprovacao', id: 'ap-1' })
  assertEquals(m.propostas, [`${RHETOR.id}:${CONTA}:hubspot`])

  // O Scopus recebeu a ferramenta de leitura, mas não a de propor (não tem Permissão em CRM nenhum).
  const toolsDoScopus = nomes(m.chamadas[1])
  assert(toolsDoScopus.includes('ler_contas_e_sinais'))
  assert(toolsDoScopus.includes('buscar_contas_pelo_icp'))
  assert(!toolsDoScopus.includes('propor_envio_ao_crm'))
  // O resultado da leitura voltou ao Scopus na rodada seguinte.
  const resultado = JSON.stringify(m.chamadas[2].messages.at(-1))
  assertStringIncludes(resultado, 'Acme')
  // O Rhetor vê o que o Scopus fez com ferramentas ("como num Slack").
  const pedidoDoRhetor = JSON.stringify(m.chamadas[3].messages.at(-1))
  assertStringIncludes(pedidoDoRhetor, 'O que os Agentes já fizeram neste pedido')
  assertStringIncludes(pedidoDoRhetor, 'Scopus leu as Contas-alvo com Sinal ativo')
  assert(nomes(m.chamadas[3]).includes('propor_envio_ao_crm'))
})

Deno.test('uma ferramenta que o Agente não pode usar vira texto para ele, e o pedido segue', async () => {
  const m = montar([
    texto(JSON.stringify({ agentes: [SCOPUS.id], resposta_direta: '' })),
    usar('propor_envio_ao_crm', { conta_id: CONTA, crm: 'hubspot' }),
    texto('Não posso propor o envio.\nSTATUS: pronto'),
    texto('O Scopus não pode propor o envio.'),
  ])
  await m.rodar('r1')
  assertEquals(m.fechamentos, ['succeeded'])
  assertEquals(m.propostas, [])
  const resultado = JSON.stringify(m.chamadas[2].messages.at(-1))
  assertStringIncludes(resultado, 'não está disponível')
})

Deno.test('sem o contexto das ferramentas (o banco falhou), o pedido roda como antes, só com a consulta de Contas-alvo', async () => {
  const m = montar([
    texto(JSON.stringify({ agentes: [SCOPUS.id], resposta_direta: '' })),
    texto('Resposta.\nSTATUS: pronto'),
    texto('Resposta final.'),
  ], { contexto: new Error('fora do ar') })
  await m.rodar('r1')
  assertEquals(m.fechamentos, ['succeeded'])
  assertEquals(nomes(m.chamadas[1]), ['buscar_contas_alvo'])
})

Deno.test('o modo antigo, sem ferramentas, continua com a consulta de Contas-alvo só', async () => {
  const m = montar([
    texto(JSON.stringify({ agentes: [SCOPUS.id], resposta_direta: '' })),
    texto('Resposta.\nSTATUS: pronto'),
    texto('Resposta final.'),
  ], { semFerramentas: true })
  await m.rodar('r1')
  assertEquals(nomes(m.chamadas[1]), ['buscar_contas_alvo'])
  assertStringIncludes(String(m.chamadas[1].system), 'Nenhuma Integração externa está conectada')
})
