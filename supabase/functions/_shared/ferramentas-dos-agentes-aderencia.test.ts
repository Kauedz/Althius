// A Aderência proposta pelo Scopus (kanban-de-prospeccao 08): a ferramenta é só do Scopus; a chamada vira uma Aprovação
// da categoria aderencia pela RPC, sempre esperando o Vendedor responsável, e o passo da Conversa leva até ela. Não fit
// sem motivo é recusado antes do banco. Cada recusa do banco volta ao Scopus em palavras. O banco é um dublê, e a RPC é
// conferida pelo `bancoDasFerramentas` com um `rpc` falso.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type AderenciaProposta,
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
const SCOPUS = agente('scopus')
const RHETOR = agente('rhetor')

const CONTA = '11111111-1111-4111-8111-111111111111'

type Pedido = { runId: string; agenteId: string; targetAccountId: string; aderencia: string; motivo: string }

function montar(opcoes: { semContrato?: boolean; resposta?: AderenciaProposta | Error } = {}) {
  const pedidos: Pedido[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.reject(new Error('não usado')),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    ...(opcoes.semContrato ? {} : {
      proporAderencia: (runId: string, agenteId: string, a: Omit<Pedido, 'runId' | 'agenteId'>) => {
        pedidos.push({ runId, agenteId, ...a })
        const resposta = opcoes.resposta ?? { approvalId: 'ap-fit', outcome: 'pendente', conta: 'Alfa' }
        return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
      },
    }),
  }
  const sessao = criarSessaoDeFerramentas({ banco, log: () => {} }, {
    runId: 'execucao-9',
    ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-caio', permissoes: [] },
  })
  return { sessao, pedidos }
}

const nomes = (sessao: ReturnType<typeof montar>['sessao'], a: AgenteDoWorkspace) => sessao.paraOAgente(a).map((f) => f.nome)

Deno.test('propor_aderencia é só do Scopus, e só com o contrato do banco', () => {
  const { sessao } = montar()
  assert(nomes(sessao, SCOPUS).includes('propor_aderencia'))
  assert(!nomes(sessao, RHETOR).includes('propor_aderencia'))
  assert(!nomes(montar({ semContrato: true }).sessao, SCOPUS).includes('propor_aderencia'))
})

Deno.test('o Scopus propõe Fit: nasce a Aprovação, e o passo leva até ela', async () => {
  const { sessao, pedidos } = montar()
  const r = await sessao.chamar(SCOPUS, 'propor_aderencia', { conta_id: CONTA, aderencia: 'fit', motivo: ' Setor e porte do ICP ' })
  assert(!r.erro)
  assertEquals(pedidos, [{
    runId: 'execucao-9',
    agenteId: 'agente-scopus',
    targetAccountId: CONTA,
    aderencia: 'fit',
    motivo: 'Setor e porte do ICP',
  }])
  assertEquals(r.passo, {
    descricao: 'Scopus propôs Fit para a Alfa — aguardando o Vendedor responsável',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-fit' },
  })
  assertStringIncludes(r.paraOAgente, 'espera a decisão do Vendedor responsável')
})

Deno.test('Não fit sem motivo e entradas inválidas não chegam ao banco', async () => {
  const { sessao, pedidos } = montar()
  const semMotivo = await sessao.chamar(SCOPUS, 'propor_aderencia', { conta_id: CONTA, aderencia: 'nao_fit', motivo: '  ' })
  assert(semMotivo.erro)
  assertStringIncludes(semMotivo.paraOAgente, 'Não fit precisa do motivo')
  const talvez = await sessao.chamar(SCOPUS, 'propor_aderencia', { conta_id: CONTA, aderencia: 'talvez' })
  assert(talvez.erro)
  assertStringIncludes(talvez.paraOAgente, 'fit ou nao_fit')
  const semConta = await sessao.chamar(SCOPUS, 'propor_aderencia', { conta_id: 'Alfa', aderencia: 'fit' })
  assert(semConta.erro)
  assertStringIncludes(semConta.paraOAgente, 'ler_contas_e_sinais')
  assertEquals(pedidos.length, 0)
})

Deno.test('a mesma proposta na mesma Execução não cria outra', async () => {
  const { sessao } = montar({ resposta: { approvalId: 'ap-fit', outcome: 'existente', conta: 'Alfa' } })
  const r = await sessao.chamar(SCOPUS, 'propor_aderencia', { conta_id: CONTA, aderencia: 'fit' })
  assert(!r.erro)
  assertStringIncludes(r.paraOAgente, 'já existe nesta Conversa')
  assertEquals(r.passo.link, { tipo: 'aprovacao', id: 'ap-fit' })
})

Deno.test('as recusas do banco voltam ao Scopus em palavras', async () => {
  const casos: [string, string, string][] = [
    ['22023', 'fit: the target account already has this fit', 'já tem essa Aderência'],
    ['55000', 'fit: the target account has no responsible seller', 'não tem Vendedor responsável'],
    ['42501', 'fit: only the ICP specialist proposes the fit', 'Só o Scopus'],
    ['P0002', 'target account not found', 'não existe no Workspace'],
  ]
  for (const [codigo, mensagem, esperado] of casos) {
    const { sessao } = montar({ resposta: new ErroDoBanco(codigo, mensagem) })
    const r = await sessao.chamar(SCOPUS, 'propor_aderencia', { conta_id: CONTA, aderencia: 'fit' })
    assert(r.erro, mensagem)
    assertEquals(r.passo, { descricao: 'Scopus tentou propor a Aderência de uma Conta', estado: 'falhou' })
    assertStringIncludes(r.paraOAgente, esperado)
  }
})

Deno.test('o banco das ferramentas chama agent_propose_account_fit', async () => {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const banco = bancoDasFerramentas((nome, parametros) => {
    chamadas.push({ nome, parametros })
    return Promise.resolve({ data: [{ approval_id: 'ap-1', outcome: 'pendente', account_name: 'Alfa' }], error: null })
  })
  const r = await banco.proporAderencia!('execucao-9', 'agente-scopus', {
    targetAccountId: CONTA,
    aderencia: 'nao_fit',
    motivo: 'Só atende o setor público',
  })
  assertEquals(chamadas, [{
    nome: 'agent_propose_account_fit',
    parametros: {
      p_run_id: 'execucao-9',
      p_agent_id: 'agente-scopus',
      p_target_account_id: CONTA,
      p_fit: 'nao_fit',
      p_reason: 'Só atende o setor público',
    },
  }])
  assertEquals(r, { approvalId: 'ap-1', outcome: 'pendente', conta: 'Alfa' })
})
