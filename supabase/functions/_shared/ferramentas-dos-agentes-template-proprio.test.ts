// A sugestão de template próprio (ticket 08): só o Rhetor, só com o contrato do banco.
// O id vem do servidor. Um id inventado na entrada é ignorado. Não propõe Sequência e não executa Aprovação.
// A sugestão da Althius continua disponível quando o contrato dela existe.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type BancoDasFerramentas,
  bancoDasFerramentas,
  criarSessaoDeFerramentas,
} from './ferramentas-dos-agentes.ts'
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
const DA_BIA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DA_ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function montar(resposta: { templateId: string | null; justificativa: string; outcome: string }) {
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
    sugerirTemplate: () => Promise.resolve({
      templateId: 'abertura-por-sinal',
      justificativa: 'A Conta Alfa tem o Sinal “vagas”.',
      outcome: 'ok',
    }),
    sugerirTemplateProprio: (_runId, _agenteId, contaId) => {
      contas.push(contaId)
      return Promise.resolve(resposta)
    },
  }
  const executou: string[] = []
  const sessao = criarSessaoDeFerramentas({
    banco,
    log: () => {},
    executarAprovacao: (id) => (executou.push(id), Promise.reject(new Error('não deveria executar'))),
    executarChamada: (id) => (executou.push(id), Promise.reject(new Error('não deveria executar'))),
  }, {
    runId: 'execucao-8',
    ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-bia', permissoes: [] },
  })
  return { sessao, contas, propostas, executou }
}

const nomes = (sessao: ReturnType<typeof montar>['sessao'], a: AgenteDoWorkspace) => sessao.paraOAgente(a).map((f) => f.nome)

Deno.test('só o Rhetor recebe sugerir_template_proprio, e a sugestão da Althius continua', () => {
  const { sessao } = montar({ templateId: DA_BIA, justificativa: 'A Conta Alfa tem o Sinal “vagas”.', outcome: 'ok' })
  const doRhetor = nomes(sessao, RHETOR)
  assert(doRhetor.includes('sugerir_template_proprio'))
  assert(doRhetor.includes('sugerir_template_de_sequencia'))
  for (const outro of ['scopus', 'ethos', 'oraculum']) {
    assert(!nomes(sessao, agente(outro)).includes('sugerir_template_proprio'))
  }
  const semContrato = criarSessaoDeFerramentas({
    banco: {
      contexto: () => Promise.reject(new Error('não usado')),
      lerContas: () => Promise.resolve([]),
      pedirDescoberta: () => Promise.reject(new Error('não usado')),
      proporEnvio: () => Promise.reject(new Error('não usado')),
      sugerirTemplate: () => Promise.resolve({ templateId: 'abertura-por-sinal', justificativa: '', outcome: 'ok' }),
    },
    log: () => {},
    executarAprovacao: () => Promise.reject(new Error('não')),
    executarChamada: () => Promise.reject(new Error('não')),
  }, { runId: 'execucao-8', ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-bia', permissoes: [] } })
  assert(!nomes(semContrato, RHETOR).includes('sugerir_template_proprio'))
  assert(nomes(semContrato, RHETOR).includes('sugerir_template_de_sequencia'))
})

Deno.test('a sugestão própria usa o id do servidor e não o de outra pessoa', async () => {
  const { sessao, contas, propostas, executou } = montar({
    templateId: DA_BIA,
    justificativa: 'A Conta Alfa tem o Sinal “Abriu 12 vagas de vendas”. O seu template Minha abertura é uma estrutura sua, sem destinatário e sem autorização. Não há medida de resultado deste template.',
    outcome: 'ok',
  })
  const r = await sessao.chamar(RHETOR, 'sugerir_template_proprio', {
    conta_id: CONTA,
    template_id: DA_ANA,
    justificativa: 'Este template aumenta a conversão em 40% e está comprovado.',
  })
  assertEquals(contas, [CONTA])
  assertEquals(propostas, [])
  assertEquals(executou, [])
  assert(!r.erro)
  assertStringIncludes(r.paraOAgente, DA_BIA)
  assertStringIncludes(r.paraOAgente, 'Abriu 12 vagas de vendas')
  assertStringIncludes(r.paraOAgente, 'Nada foi criado e nada foi enviado')
  assertStringIncludes(r.paraOAgente, 'sugerir_template_de_sequencia')
  assert(!r.paraOAgente.includes(DA_ANA))
  assert(!r.paraOAgente.includes('40%'))
  assertEquals(r.passo?.estado, 'concluida')
})

Deno.test('sem template legível a escolha manual e a da Althius continuam', async () => {
  const { sessao, propostas } = montar({ templateId: null, justificativa: '', outcome: 'indisponivel' })
  const r = await sessao.chamar(RHETOR, 'sugerir_template_proprio', { conta_id: CONTA, template_id: DA_ANA })
  assert(!r.erro)
  assertStringIncludes(r.paraOAgente, 'manualmente')
  assertStringIncludes(r.paraOAgente, 'Althius')
  assert(!r.paraOAgente.includes(DA_ANA))
  assert(!r.paraOAgente.includes(DA_BIA))
  assertEquals(propostas, [])
})

Deno.test('o banco das ferramentas chama agent_suggest_own_sequence_template', async () => {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const banco = bancoDasFerramentas((nome, parametros) => {
    chamadas.push({ nome, parametros })
    return Promise.resolve({
      data: [{ template_id: DA_BIA, justification: 'A Conta Alfa tem o Sinal “vagas”.', outcome: 'ok' }],
      error: null,
    })
  })
  const r = await banco.sugerirTemplateProprio!('execucao-8', 'agente-rhetor', CONTA)
  assertEquals(chamadas, [{
    nome: 'agent_suggest_own_sequence_template',
    parametros: {
      p_run_id: 'execucao-8',
      p_agent_id: 'agente-rhetor',
      p_target_account_id: CONTA,
    },
  }])
  assertEquals(r.templateId, DA_BIA)
  assert(r.templateId !== DA_ANA)
})
