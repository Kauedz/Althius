// O Enviar ao CRM pelo conector (ADR-0023): o Agente usa as ferramentas do PRÓPRIO servidor MCP do CRM pelo `usar_conector`
// e declara o efeito `empresa_no_crm` na chamada que leva a empresa. Com Aprovação, o efeito vai no payload guardado (e a
// Conta junto); liberada sem Aprovação, a chamada que executou fecha o envio pelo banco. Nenhum código por app: o servidor
// é o falso, com nomes de ferramenta quaisquer.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { DesfechoDaChamadaAprovada } from './executor-de-aprovacoes.ts'
import {
  type BancoDasFerramentas,
  type ChamadaComEfeito,
  COMO_ENVIAR_AO_CRM,
  type ContextoDasFerramentas,
  criarSessaoDeFerramentas,
  type DepsDasFerramentas,
} from './ferramentas-dos-agentes.ts'
import { type BancoDeAcessos, ErroDoBanco, type Permissao, type RegrasDaIntegracao } from './integration-access.ts'
import type { FerramentaMcp } from './integracoes/mcp-cliente.ts'
import { servidorMcpFalso } from './integracoes/servidor-mcp-falso.ts'
import type { AgenteDoWorkspace } from './orquestracao.ts'

const RHETOR: AgenteDoWorkspace = { id: 'agente-rhetor', name: 'Rhetor', specialty: 'rhetor', kind: 'padrao', instructions: '', voice_tone: '' }
const ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'

const FERRAMENTAS: FerramentaMcp[] = [
  { name: 'procurar_empresas', description: 'Procura empresas.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'criar_empresa', description: 'Cria uma empresa.', inputSchema: { type: 'object', properties: { nome: { type: 'string' } } } },
]

function contexto(permissao: Permissao): ContextoDasFerramentas {
  return {
    workspaceId: 'ws-1',
    requestedBy: 'usuario-ana',
    permissoes: [{ agentId: RHETOR.id, integrationId: 'hubspot', permission: permissao, category: 'CRM', name: 'HubSpot' }],
  }
}

function montar(opcoes: {
  permissao?: Permissao
  regras?: RegrasDaIntegracao
  outcome?: string
  recusaDoApp?: boolean
  executar?: (approvalId: string) => Promise<DesfechoDaChamadaAprovada>
  fechar?: (a: ChamadaComEfeito) => Promise<string>
  semFechar?: boolean
} = {}) {
  const permissao = opcoes.permissao ?? 'executar'
  const servidor = servidorMcpFalso({
    token: 'acc-ana-111',
    ferramentas: FERRAMENTAS,
    resultados: {
      criar_empresa: opcoes.recusaDoApp
        ? { content: [{ type: 'text', text: 'Domínio já existe' }], isError: true }
        : { content: [{ type: 'text', text: '{"id":"empresa-99"}' }] },
    },
  })
  const propostas: Record<string, unknown>[] = []
  const fechamentos: { runId: string; agenteId: string; a: ChamadaComEfeito }[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve(contexto(permissao)),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporChamada: (_runId, _agenteId, a) => (
      propostas.push(a as unknown as Record<string, unknown>), Promise.resolve({ approvalId: 'ap-9', outcome: opcoes.outcome ?? 'pendente' })
    ),
    ...(opcoes.semFechar ? {} : {
      fecharEnvioPelaChamada: (runId: string, agenteId: string, a: ChamadaComEfeito) => (
        fechamentos.push({ runId, agenteId, a }), (opcoes.fechar ?? (() => Promise.resolve(a.ok ? 'enviado' : 'falhou')))(a)
      ),
    }),
  }
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-ana',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ access_token: 'acc-ana-111' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(permissao),
    regrasDasFerramentas: () => Promise.resolve(opcoes.regras ?? {}),
  }
  const executadas: string[] = []
  const deps: DepsDasFerramentas = {
    banco,
    acesso: { banco: acessos, ambiente: () => undefined, fetch: servidor.fetch },
    executarChamada: opcoes.executar ??
      ((id) => (executadas.push(id), Promise.resolve({ status: 'executada', mensagem: 'ok', resultado: '"feito"', envioAoCrm: 'enviado' }))),
    log: () => {},
  }
  const sessao = criarSessaoDeFerramentas(deps, { runId: 'run-envio', ctx: contexto(permissao) })
  const chamadasAoApp = () =>
    servidor.chamadas.filter((c) => c.rpc === 'tools/call').map((c) => (c.corpo?.params as { name: string }).name)
  return { sessao, propostas, fechamentos, executadas, chamadasAoApp }
}

const criarComEfeito = { integracao: 'hubspot', ferramenta: 'criar_empresa', argumentos: { nome: 'Alfa' }, efeito: 'empresa_no_crm', conta_id: ALFA }

Deno.test('as instruções do usar_conector ensinam o Enviar ao CRM a quem escreve num CRM, e só a ele', () => {
  const descricao = (permissao: Permissao) =>
    montar({ permissao }).sessao.paraOAgente(RHETOR).find((f) => f.nome === 'usar_conector')!.descricao
  assertStringIncludes(descricao('propor'), COMO_ENVIAR_AO_CRM)
  assertStringIncludes(COMO_ENVIAR_AO_CRM, 'procure a empresa antes de criar')
  assertStringIncludes(COMO_ENVIAR_AO_CRM, 'associe-os à empresa e crie a nota')
  assertStringIncludes(COMO_ENVIAR_AO_CRM, 'efeito "empresa_no_crm"')
  assert(!descricao('ler').includes(COMO_ENVIAR_AO_CRM), 'com Ler, o Agente não escreve no CRM')
  const esquema = montar().sessao.paraOAgente(RHETOR).find((f) => f.nome === 'usar_conector')!.esquema as {
    properties: Record<string, { enum?: string[] }>
  }
  assertEquals(esquema.properties.efeito.enum, ['empresa_no_crm'])
})

Deno.test('com Aprovação, o efeito e a Conta vão na proposta, e nada chega ao app nem fecha o envio', async () => {
  const { sessao, propostas, fechamentos, chamadasAoApp } = montar({ permissao: 'propor' })
  const r = await sessao.chamar(RHETOR, 'usar_conector', { ...criarComEfeito, justificativa: 'Enviar a Alfa ao CRM.' })
  assert(!r.erro, r.paraOAgente)
  assertEquals(propostas.length, 1)
  assertEquals(propostas[0].payload, {
    tipo: 'ferramenta',
    integration_id: 'hubspot',
    ferramenta: 'criar_empresa',
    argumentos: { nome: 'Alfa' },
    efeito: 'empresa_no_crm',
  })
  assertEquals(propostas[0].targetAccountId, ALFA)
  assertEquals(chamadasAoApp(), [])
  assertEquals(fechamentos, [])
  assertEquals(r.passo.estado, 'aguardando')
})

Deno.test('sem o efeito, a proposta continua exatamente como antes', async () => {
  const { sessao, propostas } = montar({ permissao: 'propor' })
  await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'hubspot', ferramenta: 'criar_empresa', argumentos: { nome: 'Alfa' } })
  assertEquals(propostas[0].payload, { tipo: 'ferramenta', integration_id: 'hubspot', ferramenta: 'criar_empresa', argumentos: { nome: 'Alfa' } })
  assert(!('targetAccountId' in propostas[0]))
})

Deno.test('o efeito é recusado numa leitura, sem a Conta, com outro nome ou onde o banco não sabe fechar', async () => {
  const casos: [Record<string, unknown>, string, { semFechar?: boolean }][] = [
    [{ ...criarComEfeito, ferramenta: 'procurar_empresas' }, 'ferramenta que escreve', {}],
    [{ ...criarComEfeito, conta_id: 'alfa' }, 'conta_id', {}],
    [{ ...criarComEfeito, efeito: 'contato_no_crm' }, 'empresa_no_crm', {}],
    [criarComEfeito, 'não está disponível', { semFechar: true }],
  ]
  for (const [entrada, motivo, extra] of casos) {
    const { sessao, propostas, chamadasAoApp, fechamentos } = montar({ permissao: 'propor', ...extra })
    const r = await sessao.chamar(RHETOR, 'usar_conector', entrada)
    assert(r.erro, JSON.stringify(entrada))
    assertStringIncludes(r.paraOAgente, motivo)
    assertEquals(propostas, [])
    assertEquals(chamadasAoApp(), [])
    assertEquals(fechamentos, [])
  }
})

Deno.test('liberada sem Aprovação (Executar e "sempre"), a chamada executa e fecha o envio da Execução como enviado', async () => {
  const { sessao, propostas, fechamentos, chamadasAoApp } = montar({ permissao: 'executar', regras: { criar_empresa: 'sempre' } })
  const r = await sessao.chamar(RHETOR, 'usar_conector', criarComEfeito)
  assert(!r.erro, r.paraOAgente)
  assertEquals(propostas, [])
  assertEquals(chamadasAoApp(), ['criar_empresa'])
  assertEquals(fechamentos, [{
    runId: 'run-envio',
    agenteId: RHETOR.id,
    a: { integrationId: 'hubspot', ferramenta: 'criar_empresa', targetAccountId: ALFA, ok: true, erro: null },
  }])
  assertStringIncludes(r.paraOAgente, 'empresa-99')
  assertStringIncludes(r.paraOAgente, 'No CRM')
})

Deno.test('liberada sem Aprovação, o app que recusa fecha o envio como falha e o Agente sabe', async () => {
  const { sessao, fechamentos } = montar({ permissao: 'executar', regras: { criar_empresa: 'sempre' }, recusaDoApp: true })
  const r = await sessao.chamar(RHETOR, 'usar_conector', criarComEfeito)
  assert(r.erro)
  assertEquals(fechamentos.map((f) => f.a.ok), [false])
  assertStringIncludes(r.paraOAgente, 'recusou')
})

Deno.test('o banco que não fecha (outra Conta, outra Execução) não desfaz a chamada: o Agente é avisado', async () => {
  const { sessao } = montar({
    permissao: 'executar',
    regras: { criar_empresa: 'sempre' },
    fechar: () => Promise.reject(new ErroDoBanco('P0002', 'crm handoff attempt not found for this run')),
  })
  const r = await sessao.chamar(RHETOR, 'usar_conector', criarComEfeito)
  assert(!r.erro, r.paraOAgente)
  assertStringIncludes(r.paraOAgente, 'não registrou o Envio ao CRM')
})

Deno.test('a chamada com o efeito que nasce liberada vai ao executor, que fecha o envio, e o Agente lê que foi a No CRM', async () => {
  const { sessao, executadas, fechamentos } = montar({ permissao: 'executar', outcome: 'liberada', regras: { criar_empresa: 'aprovacao' } })
  const r = await sessao.chamar(RHETOR, 'usar_conector', criarComEfeito)
  assert(!r.erro, r.paraOAgente)
  assertEquals(executadas, ['ap-9'])
  assertEquals(fechamentos, [], 'quem fecha, pela Aprovação, é o executor')
  assertStringIncludes(r.paraOAgente, 'No CRM')
})
