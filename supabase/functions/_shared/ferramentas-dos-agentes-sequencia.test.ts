// A Sequência proposta pelo Rhetor (cadencia-pela-ia 01): só o Rhetor recebe `propor_sequencia`; a chamada vira uma
// Aprovação da categoria sequencia pela RPC, sempre esperando o Vendedor responsável, mesmo com a Permissão Executar, e
// o passo da Conversa leva até ela. Sem Contatos, a ferramenta lista os da Conta. Cada recusa do banco volta ao Rhetor
// em palavras. O banco é um dublê, e as RPCs são conferidas pelo `bancoDasFerramentas` com um `rpc` falso.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type BancoDasFerramentas,
  bancoDasFerramentas,
  criarSessaoDeFerramentas,
  eventoDoPasso,
  type PassoProposto,
  type PermissaoNaIntegracao,
  type SequenciaProposta,
  variaveisDesconhecidas,
} from './ferramentas-dos-agentes.ts'
import { ErroDoBanco } from './integration-access.ts'
import type { AgenteDoWorkspace } from './orquestracao.ts'

const agente = (specialty: string): AgenteDoWorkspace => ({
  id: `agente-${specialty}`,
  name: specialty[0].toUpperCase() + specialty.slice(1),
  specialty,
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
})
const RHETOR = agente('rhetor')

const CONTA = '11111111-1111-4111-8111-111111111111'
const MARIA = '22222222-2222-4222-8222-222222222222'
const JOAO = '33333333-3333-4333-8333-333333333333'

type Pedido = { runId: string; agenteId: string; targetAccountId: string; contatos: string[]; passos: PassoProposto[]; justificativa: string }

function montar(opcoes: {
  semContrato?: boolean
  resposta?: SequenciaProposta | Error
  permissoes?: PermissaoNaIntegracao[]
  executar?: () => Promise<never>
} = {}) {
  const pedidos: Pedido[] = []
  const leituras: string[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.reject(new Error('não usado')),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    ...(opcoes.semContrato ? {} : {
      proporSequencia: (runId: string, agenteId: string, a: Omit<Pedido, 'runId' | 'agenteId'>) => {
        pedidos.push({ runId, agenteId, ...a })
        const resposta = opcoes.resposta ?? { approvalId: 'ap-seq', outcome: 'pendente', conta: 'Alfa' }
        return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
      },
      contatosParaSequencia: (runId: string, agenteId: string, contaId: string) => {
        leituras.push(`${runId}:${agenteId}:${contaId}`)
        return Promise.resolve({ conta: 'Alfa', contatos: [{ id: MARIA, nome: 'Maria Souza', pode_entrar: true }] })
      },
    }),
  }
  const executou: string[] = []
  const sessao = criarSessaoDeFerramentas({
    banco,
    log: () => {},
    executarAprovacao: (id) => (executou.push(id), Promise.reject(new Error('não deveria executar'))),
    executarChamada: (id) => (executou.push(id), Promise.reject(new Error('não deveria executar'))),
  }, {
    runId: 'execucao-9',
    ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-bia', permissoes: opcoes.permissoes ?? [] },
  })
  return { sessao, pedidos, leituras, executou }
}

const nomes = (sessao: ReturnType<typeof montar>['sessao'], a: AgenteDoWorkspace) => sessao.paraOAgente(a).map((f) => f.nome)
const TRES_PASSOS = [
  { canal: 'email', espera_em_dias: 0, assunto: '{{primeiro_nome}}, vi as vagas na {{empresa}}', corpo: ' Oi {{primeiro_nome}}, a {{empresa}} abriu 12 vagas. ' },
  { espera_em_dias: 3, assunto: 'Re: {{empresa}}', corpo: 'Retomando, {{contato.nome}}.' },
  { espera_em_dias: 4, assunto: 'Última ideia', corpo: 'Fico à disposição. {{remetente.nome}}' },
]
const PROPOSTA = { conta_id: CONTA, contatos: [MARIA, JOAO], passos: TRES_PASSOS, justificativa: 'A Alfa abriu 12 vagas de vendas.' }

Deno.test('só o Rhetor recebe propor_sequencia, e só com o contrato do banco', () => {
  const { sessao } = montar()
  assert(nomes(sessao, RHETOR).includes('propor_sequencia'))
  for (const outro of ['scopus', 'ethos', 'oraculum']) assert(!nomes(sessao, agente(outro)).includes('propor_sequencia'))
  assert(!nomes(montar({ semContrato: true }).sessao, RHETOR).includes('propor_sequencia'))
})

Deno.test('a descrição ensina o Sinal no primeiro e-mail, a Cadência do Playbook, o padrão e as variáveis', () => {
  const descricao = montar().sessao.paraOAgente(RHETOR).find((f) => f.nome === 'propor_sequencia')!.descricao
  assertStringIncludes(descricao, 'ler_contas_e_sinais')
  assertStringIncludes(descricao, 'Use o Sinal no primeiro e-mail')
  assertStringIncludes(descricao, 'seção Cadência do Playbook')
  assertStringIncludes(descricao, '3 passos de E-mail (dia 0, 3 e 7')
  assertStringIncludes(descricao, '{{primeiro_nome}}')
  assertStringIncludes(descricao, 'Ativar envios')
})

Deno.test('a proposta válida vai ao banco com a Execução da vez e o passo leva à Aprovação pendente', async () => {
  const { sessao, pedidos } = montar()
  const r = await sessao.chamar(RHETOR, 'propor_sequencia', PROPOSTA)
  assertEquals(pedidos, [{
    runId: 'execucao-9',
    agenteId: 'agente-rhetor',
    targetAccountId: CONTA,
    contatos: [MARIA, JOAO],
    passos: [
      { esperaEmDias: 0, assunto: '{{primeiro_nome}}, vi as vagas na {{empresa}}', corpo: 'Oi {{primeiro_nome}}, a {{empresa}} abriu 12 vagas.' },
      { esperaEmDias: 3, assunto: 'Re: {{empresa}}', corpo: 'Retomando, {{contato.nome}}.' },
      { esperaEmDias: 4, assunto: 'Última ideia', corpo: 'Fico à disposição. {{remetente.nome}}' },
    ],
    justificativa: 'A Alfa abriu 12 vagas de vendas.',
  }])
  assert(!r.erro)
  assertEquals(r.passo, {
    descricao: 'Rhetor propôs uma Sequência para a Alfa (2 Contatos, 3 e-mails) — aguardando o Vendedor responsável',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-seq' },
  })
  assertStringIncludes(r.paraOAgente, 'Proposta criada: a Sequência para a Alfa')
  assertStringIncludes(r.paraOAgente, 'espera a decisão do Vendedor responsável')
  assertStringIncludes(r.paraOAgente, 'Nada foi enviado')
  // O passo que a tela lê não leva o assunto nem o corpo.
  const evento = JSON.stringify(eventoDoPasso('propor_sequencia', r.passo))
  assert(!evento.includes('vagas na'))
  assertEquals(eventoDoPasso('propor_sequencia', r.passo).link, { tipo: 'aprovacao', id: 'ap-seq' })
})

Deno.test('com a Permissão Executar, a proposta continua por Aprovação: nenhum executor roda', async () => {
  const { sessao, executou } = montar({
    permissoes: [{ agentId: 'agente-rhetor', integrationId: 'hubspot', permission: 'executar', category: 'CRM', name: 'HubSpot' }],
  })
  const r = await sessao.chamar(RHETOR, 'propor_sequencia', PROPOSTA)
  assertEquals(r.passo.estado, 'aguardando')
  assertEquals(executou, [])
})

Deno.test('sem Contatos, a ferramenta lista os da Conta e não propõe nada', async () => {
  const { sessao, pedidos, leituras } = montar()
  const r = await sessao.chamar(RHETOR, 'propor_sequencia', { conta_id: CONTA })
  assertEquals(leituras, [`execucao-9:${RHETOR.id}:${CONTA}`])
  assertEquals(pedidos, [])
  assertEquals(r.passo, { descricao: 'Rhetor viu os Contatos que podem entrar na Sequência', estado: 'concluida' })
  assertStringIncludes(r.paraOAgente, MARIA)
  assertStringIncludes(r.paraOAgente, 'chame propor_sequencia de novo')
})

Deno.test('a mesma proposta repetida não cria outra: o passo lembra a que já existe nesta Conversa', async () => {
  const { sessao } = montar({ resposta: { approvalId: 'ap-seq', outcome: 'existente', conta: 'Alfa' } })
  const r = await sessao.chamar(RHETOR, 'propor_sequencia', PROPOSTA)
  assert(!r.erro)
  assertStringIncludes(r.paraOAgente, 'já existe nesta Conversa')
  assertEquals(r.passo, {
    descricao: 'Rhetor lembrou a Sequência proposta para a Alfa',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-seq' },
  })
})

Deno.test('canal que não é E-mail, variável desconhecida e passos fora do limite não chegam ao banco', async () => {
  const { sessao, pedidos } = montar()
  const linkedin = await sessao.chamar(RHETOR, 'propor_sequencia', {
    ...PROPOSTA,
    passos: [{ canal: 'linkedin', espera_em_dias: 0, assunto: 'Oi', corpo: 'Oi' }],
  })
  assertStringIncludes(linkedin.paraOAgente, 'só de E-mail')
  const variavel = await sessao.chamar(RHETOR, 'propor_sequencia', {
    ...PROPOSTA,
    passos: [{ espera_em_dias: 0, assunto: 'Sobre {{conta.sinal}}', corpo: 'Oi {{persona}}' }],
  })
  assert(variavel.erro)
  assertStringIncludes(variavel.paraOAgente, 'A variável {{conta.sinal}}, {{persona}} não existe no envio')
  const semPassos = await sessao.chamar(RHETOR, 'propor_sequencia', { ...PROPOSTA, passos: [] })
  assertStringIncludes(semPassos.paraOAgente, 'de 1 a 8 passos')
  const espera = await sessao.chamar(RHETOR, 'propor_sequencia', {
    ...PROPOSTA,
    passos: [{ espera_em_dias: -1, assunto: 'Oi', corpo: 'Oi' }],
  })
  assertStringIncludes(espera.paraOAgente, 'de 0 a 60')
  assertEquals(pedidos, [])
})

Deno.test('cada recusa do banco volta ao Rhetor com o próprio motivo', async () => {
  const casos: [string, string, string][] = [
    ['42501', 'sequence: the requester is not the responsible seller of the target account', 'Só o Vendedor responsável'],
    ['23505', 'sequence: the target account already has a sequence in progress', 'já tem uma Sequência em andamento'],
    ['22023', 'sequence: contact is not linked to the target account', 'não é desta Conta-alvo'],
    ['22023', 'sequence: contact is suppressed', 'se descadastrou'],
    ['22023', 'sequence: contact has no e-mail', 'não tem e-mail'],
    ['22023', 'sequence: contact is in another active sequence', 'outra Sequência ativa'],
    ['22023', 'sequence: unknown variable: cupom', 'A variável {{cupom}} não existe'],
    ['22023', 'sequence: only e-mail steps', 'só de E-mail'],
    ['42501', 'sequence: only the cadence specialist proposes sequences', 'Só o Rhetor'],
  ]
  for (const [codigo, mensagem, esperado] of casos) {
    const { sessao } = montar({ resposta: new ErroDoBanco(codigo, mensagem) })
    const r = await sessao.chamar(RHETOR, 'propor_sequencia', PROPOSTA)
    assert(r.erro, mensagem)
    assertEquals(r.passo, { descricao: 'Rhetor tentou propor uma Sequência', estado: 'falhou' })
    assertStringIncludes(r.paraOAgente, esperado)
  }
})

Deno.test('com o Playbook vazio, a proposta tem 3 e-mails no dia 0, 3 e 7, e o Rhetor avisa', async () => {
  const { sessao, pedidos } = montar()
  const r = await sessao.chamar(RHETOR, 'propor_sequencia', { ...PROPOSTA, playbook_vazio: true })
  assert(!r.erro)
  assertStringIncludes(r.paraOAgente, 'a seção Cadência do Playbook está vazia')
  assertStringIncludes(pedidos[0].justificativa, 'O Playbook não tem a seção Cadência')
  const doisPassos = await sessao.chamar(RHETOR, 'propor_sequencia', {
    ...PROPOSTA,
    playbook_vazio: true,
    passos: TRES_PASSOS.slice(0, 2),
  })
  assert(doisPassos.erro)
  assertStringIncludes(doisPassos.paraOAgente, 'proponha 3 passos de E-mail: no dia 0, 3 e 7')
  assertEquals(pedidos.length, 1)
})

Deno.test('as variáveis desconhecidas seguem a lista do envio', () => {
  assertEquals(variaveisDesconhecidas('{{ primeiro_nome }} {{EMPRESA}} {{conta.dominio}} {{remetente}}'), [])
  assertEquals(variaveisDesconhecidas('{{conta.sinal}} {{persona}} {{conta.sinal}}'), ['conta.sinal', 'persona'])
})

Deno.test('o banco das ferramentas chama agent_propose_sequence e agent_read_sequence_contacts', async () => {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const banco = bancoDasFerramentas((nome, parametros) => {
    chamadas.push({ nome, parametros })
    return Promise.resolve({
      data: nome === 'agent_propose_sequence'
        ? [{ approval_id: 'ap-1', outcome: 'pendente', account_name: 'Alfa' }]
        : { conta: 'Alfa', contatos: [] },
      error: null,
    })
  })
  const passos = [{ esperaEmDias: 0, assunto: 'Oi', corpo: 'Oi' }]
  const r = await banco.proporSequencia!('execucao-9', 'agente-rhetor', {
    targetAccountId: CONTA,
    contatos: [MARIA],
    passos,
    justificativa: 'Sinal.',
  })
  await banco.contatosParaSequencia!('execucao-9', 'agente-rhetor', CONTA)
  assertEquals(chamadas, [
    {
      nome: 'agent_propose_sequence',
      parametros: {
        p_run_id: 'execucao-9',
        p_agent_id: 'agente-rhetor',
        p_target_account_id: CONTA,
        p_contacts: [MARIA],
        p_steps: passos,
        p_justification: 'Sinal.',
      },
    },
    {
      nome: 'agent_read_sequence_contacts',
      parametros: { p_run_id: 'execucao-9', p_agent_id: 'agente-rhetor', p_target_account_id: CONTA },
    },
  ])
  assertEquals(r, { approvalId: 'ap-1', outcome: 'pendente', conta: 'Alfa' })
})
