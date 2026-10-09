// A proposta de mudança no Playbook (CRM-09, ADR-0010): só o Scopus e o Ethos a recebem, e só nas seções da Especialidade
// deles; a chamada vira uma Aprovação de revisão pela RPC, com a Execução da vez, e o passo da Conversa leva até ela. O
// Playbook não muda aqui. O banco é um dublê, e a RPC é conferida pelo `bancoDasFerramentas` com um `rpc` falso.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type BancoDasFerramentas,
  bancoDasFerramentas,
  type ConteudoDoPlaybook,
  criarSessaoDeFerramentas,
  eventoDoPasso,
  type RevisaoProposta,
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
const ETHOS = agente('ethos')
const RHETOR = agente('rhetor')
const ORACULUM = agente('oraculum')

type Pedido = { runId: string; agenteId: string; secao: string; conteudo: ConteudoDoPlaybook; justificativa: string }

function montar(opcoes: { semRevisao?: boolean; resposta?: RevisaoProposta | Error; maxChamadas?: number } = {}) {
  const pedidos: Pedido[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'usuario-bruno', permissoes: [] }),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    ...(opcoes.semRevisao ? {} : {
      proporRevisao: (runId: string, agenteId: string, a: Omit<Pedido, 'runId' | 'agenteId'>) => {
        pedidos.push({ runId, agenteId, ...a })
        const resposta = opcoes.resposta ?? { approvalId: 'ap-icp', outcome: 'pendente', secao: 'ICP', versaoBase: 2 }
        return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
      },
    }),
  }
  const sessao = criarSessaoDeFerramentas({ banco, log: () => {} }, {
    runId: 'execucao-7',
    ctx: { workspaceId: 'ws-1', requestedBy: 'usuario-bruno', permissoes: [] },
    ...(opcoes.maxChamadas ? { maxChamadas: opcoes.maxChamadas } : {}),
  })
  return { sessao, pedidos }
}

const nomes = (sessao: ReturnType<typeof montar>['sessao'], a: AgenteDoWorkspace) => sessao.paraOAgente(a).map((f) => f.nome)
const ICP_NOVO = {
  secao: 'icp',
  conteudo: { texto: '  Indústrias de 200 a 500 pessoas no Sul  ' },
  justificativa: 'Os três últimos fechamentos foram nesse porte.',
}

Deno.test('só o Scopus e o Ethos recebem a proposta de mudança no Playbook, e só com o contrato do banco', () => {
  const { sessao } = montar()
  assert(nomes(sessao, SCOPUS).includes('propor_mudanca_no_playbook'))
  assert(nomes(sessao, ETHOS).includes('propor_mudanca_no_playbook'))
  assert(!nomes(sessao, RHETOR).includes('propor_mudanca_no_playbook'))
  assert(!nomes(sessao, ORACULUM).includes('propor_mudanca_no_playbook'))
  const semContrato = montar({ semRevisao: true }).sessao
  assert(!nomes(semContrato, SCOPUS).includes('propor_mudanca_no_playbook'))
})

Deno.test('a descrição lista só as seções da Especialidade da vez, com os campos das linhas', () => {
  const { sessao } = montar()
  const doScopus = sessao.paraOAgente(SCOPUS).find((f) => f.nome === 'propor_mudanca_no_playbook')!.descricao
  assertStringIncludes(doScopus, '- icp (ICP): só texto')
  assertStringIncludes(doScopus, '- mercado (Mercado): linhas com os campos segmento, tam, sam, som, complexidade')
  assert(!doScopus.includes('personas'))
  const doEthos = sessao.paraOAgente(ETHOS).find((f) => f.nome === 'propor_mudanca_no_playbook')!.descricao
  assertStringIncludes(doEthos, '- personas (Personas): linhas com os campos papel, cargo, dores, objecoes, gatilhos')
  assert(!doEthos.includes('- icp'))
})

Deno.test('o Scopus propõe o ICP: a RPC recebe a Execução da vez, e o passo leva à Aprovação pendente', async () => {
  const { sessao, pedidos } = montar()
  const r = await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', ICP_NOVO)

  assertEquals(pedidos, [{
    runId: 'execucao-7',
    agenteId: 'agente-scopus',
    secao: 'icp',
    conteudo: { texto: 'Indústrias de 200 a 500 pessoas no Sul', linhas: [] },
    justificativa: 'Os três últimos fechamentos foram nesse porte.',
  }])
  assert(!r.erro)
  assertEquals(r.passo, {
    descricao: 'Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-icp' },
  })
  assertStringIncludes(r.paraOAgente, 'O Playbook não mudou ainda')
  assertEquals(eventoDoPasso('propor_mudanca_no_playbook', r.passo).link, { tipo: 'aprovacao', id: 'ap-icp' })
})

Deno.test('o Ethos propõe as Personas com as linhas: só campos de texto preenchidos vão ao banco', async () => {
  const { sessao, pedidos } = montar({ resposta: { approvalId: 'ap-p', outcome: 'pendente', secao: 'Personas', versaoBase: 0 } })
  const r = await sessao.chamar(ETHOS, 'propor_mudanca_no_playbook', {
    secao: 'personas',
    conteudo: { linhas: [{ papel: 'Decisor', cargo: ' Diretor industrial ', idade: 42 }, { papel: '  ' }, 'solta'] },
    justificativa: 'O decisor mudou.',
  })
  assertEquals(pedidos[0].conteudo, { texto: '', linhas: [{ papel: 'Decisor', cargo: 'Diretor industrial' }] })
  assertEquals(r.passo.descricao, 'Ethos propôs uma nova versão das Personas — aguardando Aprovação de um Administrador')
})

Deno.test('a seção fora da Especialidade não chega ao banco', async () => {
  const { sessao, pedidos } = montar()
  const r = await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', { ...ICP_NOVO, secao: 'personas' })
  assert(r.erro)
  assertEquals(r.passo.estado, 'falhou')
  assertStringIncludes(r.paraOAgente, 'ICP, Mercado')
  assertEquals((await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', { ...ICP_NOVO, secao: 'empresa' })).erro, true)
  assertEquals(pedidos, [])
})

Deno.test('sem conteúdo ou sem justificativa, a proposta não chega ao banco', async () => {
  const { sessao, pedidos } = montar()
  const vazio = await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', { ...ICP_NOVO, conteudo: { texto: '   ' } })
  assertStringIncludes(vazio.paraOAgente, 'Escreva o conteúdo inteiro da seção')
  const semPorque = await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', { ...ICP_NOVO, justificativa: ' ' })
  assertStringIncludes(semPorque.paraOAgente, 'por que mudar a seção')
  assertEquals(pedidos, [])
})

Deno.test('a mesma proposta repetida não cria outra: o passo lembra a que já existe', async () => {
  const { sessao } = montar({ resposta: { approvalId: 'ap-icp', outcome: 'existente', secao: 'ICP', versaoBase: 2 } })
  const r = await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', ICP_NOVO)
  assert(!r.erro)
  assertEquals(r.passo, {
    descricao: 'Scopus lembrou a proposta do ICP que já está em Aprovações',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-icp' },
  })
})

Deno.test('a recusa do banco volta ao Agente em palavras, sem derrubar o pedido', async () => {
  const { sessao } = montar({
    resposta: new ErroDoBanco('22023', 'the revision does not change the playbook section'),
  })
  const r = await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', ICP_NOVO)
  assert(r.erro)
  assertEquals(r.passo, { descricao: 'Scopus tentou propor uma nova versão do ICP', estado: 'falhou' })
  assertStringIncludes(r.paraOAgente, 'igual à versão vigente')
})

Deno.test('a proposta conta no limite de chamadas do pedido', async () => {
  const { sessao, pedidos } = montar({ maxChamadas: 1 })
  await sessao.chamar(SCOPUS, 'propor_mudanca_no_playbook', ICP_NOVO)
  const segunda = await sessao.chamar(ETHOS, 'propor_mudanca_no_playbook', { ...ICP_NOVO, secao: 'objecoes' })
  assertStringIncludes(segunda.paraOAgente, 'limite de 1 chamadas')
  assertEquals(pedidos.length, 1)
})

Deno.test('o banco das ferramentas chama agent_propose_playbook_revision com a Execução, o Agente e a seção', async () => {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const banco = bancoDasFerramentas((nome, parametros) => {
    chamadas.push({ nome, parametros })
    return Promise.resolve({
      data: [{ approval_id: 'ap-9', outcome: 'pendente', section_name: 'Mercado', base_version: 3 }],
      error: null,
    })
  })
  const r = await banco.proporRevisao!('execucao-7', 'agente-scopus', {
    secao: 'mercado',
    conteudo: { texto: 'TAM de 4 mil', linhas: [] },
    justificativa: 'Novo corte.',
  })
  assertEquals(chamadas, [{
    nome: 'agent_propose_playbook_revision',
    parametros: {
      p_run_id: 'execucao-7',
      p_agent_id: 'agente-scopus',
      p_section: 'mercado',
      p_content: { texto: 'TAM de 4 mil', linhas: [] },
      p_justification: 'Novo corte.',
    },
  }])
  assertEquals(r, { approvalId: 'ap-9', outcome: 'pendente', secao: 'Mercado', versaoBase: 3 })
})
