// A sugestão de template da Althius (ticket 07): só o Rhetor recebe a ferramenta, e só com o contrato do banco.
// Ela devolve o id que o servidor escolheu. Um id inventado na entrada é ignorado. Teto e falta de Sinal não escolhem.
// A chamada não propõe Sequência e não executa Aprovação.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type BancoDasFerramentas,
  bancoDasFerramentas,
  criarSessaoDeFerramentas,
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

function montar(resposta: { templateId: string | null; justificativa: string; outcome: string } | Error) {
  const contas: string[] = []
  const propostas: string[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.reject(new Error('não usado')),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporSequencia: () => {
      propostas.push('propos')
      return Promise.resolve({ approvalId: 'ap', outcome: 'pendente', conta: 'Alfa' })
    },
    contatosParaSequencia: () => Promise.resolve({ contatos: [] }),
    sugerirTemplate: (_runId, _agenteId, contaId) => {
      contas.push(contaId)
      return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
    },
  }
  const executou: string[] = []
  const sessao = criarSessaoDeFerramentas({
    banco,
    log: () => {},
    executarAprovacao: (id) => (executou.push(id), Promise.reject(new Error('não deveria executar'))),
    executarChamada: (id) => (executou.push(id), Promise.reject(new Error('não deveria executar'))),
  }, {
    runId: 'execucao-9',
    ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-bia', permissoes: [] },
  })
  return { sessao, contas, propostas, executou }
}

const nomes = (sessao: ReturnType<typeof montar>['sessao'], a: AgenteDoWorkspace) => sessao.paraOAgente(a).map((f) => f.nome)

Deno.test('as quatro Especialidades recebem sugerir_template_de_sequencia, e só com o contrato do banco', () => {
  const { sessao } = montar({ templateId: 'abertura-por-sinal', justificativa: 'A Conta Alfa tem o Sinal “vagas”.', outcome: 'ok' })
  assert(nomes(sessao, RHETOR).includes('sugerir_template_de_sequencia'))
  for (const outro of ['scopus', 'ethos', 'oraculum']) {
    assert(nomes(sessao, agente(outro)).includes('sugerir_template_de_sequencia'))
  }
  const semContrato = criarSessaoDeFerramentas({
    banco: {
      contexto: () => Promise.reject(new Error('não usado')),
      lerContas: () => Promise.resolve([]),
      pedirDescoberta: () => Promise.reject(new Error('não usado')),
      proporEnvio: () => Promise.reject(new Error('não usado')),
    },
    log: () => {},
    executarAprovacao: () => Promise.reject(new Error('não')),
    executarChamada: () => Promise.reject(new Error('não')),
  }, { runId: 'execucao-9', ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-bia', permissoes: [] } })
  assert(!nomes(semContrato, RHETOR).includes('sugerir_template_de_sequencia'))
})

Deno.test('a sugestão usa o id do servidor, ignora id inventado e não cria envio', async () => {
  const { sessao, contas, propostas, executou } = montar({
    templateId: 'abertura-por-sinal',
    justificativa: 'A Conta Alfa tem o Sinal “Abriu 12 vagas de vendas”. Não há medida de resultado deste template.',
    outcome: 'ok',
  })
  const r = await sessao.chamar(RHETOR, 'sugerir_template_de_sequencia', {
    conta_id: CONTA,
    template_id: 'template-inventado',
    justificativa: 'Este template aumenta a conversão em 40% e está comprovado.',
  })
  assertEquals(contas, [CONTA])
  assertEquals(propostas, [])
  assertEquals(executou, [])
  assert(!r.erro)
  assertStringIncludes(r.paraOAgente, 'abertura-por-sinal')
  assertStringIncludes(r.paraOAgente, 'Abriu 12 vagas de vendas')
  assertStringIncludes(r.paraOAgente, 'Nada foi criado e nada foi enviado')
  assert(!r.paraOAgente.includes('template-inventado'))
  assert(!r.paraOAgente.includes('40%'))
  assertEquals(r.passo?.estado, 'concluida')
  assert(r.passo?.link == null)
})

Deno.test('teto e falta de Sinal não escolhem template e a escolha manual continua', async () => {
  for (const outcome of ['teto_atingido', 'sem_teto', 'sem_espaco', 'sem_contexto']) {
    const { sessao, propostas } = montar({ templateId: null, justificativa: '', outcome })
    const r = await sessao.chamar(RHETOR, 'sugerir_template_de_sequencia', { conta_id: CONTA })
    assert(!r.erro, outcome)
    assertStringIncludes(r.paraOAgente, 'manualmente')
    assert(!r.paraOAgente.includes('abertura-por-sinal'))
    assertEquals(propostas, [], outcome)
  }
})

Deno.test('quem não é o responsável não recebe um template inventado no lugar da recusa', async () => {
  const { sessao, propostas } = montar(new ErroDoBanco('42501', 'sequence: the requester is not the responsible seller of the target account'))
  const r = await sessao.chamar(RHETOR, 'sugerir_template_de_sequencia', { conta_id: CONTA })
  assert(r.erro)
  assertStringIncludes(r.paraOAgente, 'Vendedor responsável')
  assertEquals(propostas, [])
})

Deno.test('o banco das ferramentas chama agent_suggest_althius_sequence_template', async () => {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const banco = bancoDasFerramentas((nome, parametros) => {
    chamadas.push({ nome, parametros })
    return Promise.resolve({
      data: [{ template_id: 'abertura-por-sinal', justification: 'A Conta Alfa tem o Sinal “vagas”.', outcome: 'ok' }],
      error: null,
    })
  })
  const r = await banco.sugerirTemplate!('execucao-9', 'agente-rhetor', CONTA)
  assertEquals(chamadas, [{
    nome: 'agent_suggest_althius_sequence_template',
    parametros: {
      p_run_id: 'execucao-9',
      p_agent_id: 'agente-rhetor',
      p_target_account_id: CONTA,
    },
  }])
  assertEquals(r, {
    templateId: 'abertura-por-sinal',
    justificativa: 'A Conta Alfa tem o Sinal “vagas”.',
    outcome: 'ok',
  })
})
