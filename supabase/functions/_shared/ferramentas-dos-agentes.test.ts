// O catálogo das ferramentas dos Agentes (Etapa 5b): quem pode usar cada uma (Especialidade + Permissão), o que cada uma
// faz no banco e como o resultado volta ao Agente e à tela. O banco, o Acesso e o executor das Aprovações são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type BancoDasFerramentas,
  CATALOGO,
  type ContextoDasFerramentas,
  criarSessaoDeFerramentas,
  type DepsDasFerramentas,
} from './ferramentas-dos-agentes.ts'
import { type BancoDeAcessos, ErroDoBanco, type Permissao } from './integration-access.ts'
import type { AgenteDoWorkspace } from './orquestracao.ts'

const agente = (specialty: string, id = `agente-${specialty}`): AgenteDoWorkspace => ({
  id,
  name: specialty[0].toUpperCase() + specialty.slice(1),
  specialty,
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
})
const SCOPUS = agente('scopus')
const RHETOR = agente('rhetor')
const ORACULUM = agente('oraculum')

function contexto(permissoes: { agente: AgenteDoWorkspace; integracao: string; permissao: Permissao; categoria?: string }[]): ContextoDasFerramentas {
  return {
    workspaceId: 'ws-1',
    requestedBy: 'usuario-ana',
    permissoes: permissoes.map((p) => ({
      agentId: p.agente.id,
      integrationId: p.integracao,
      permission: p.permissao,
      category: p.categoria ?? 'CRM',
      name: p.integracao === 'hubspot' ? 'HubSpot' : p.integracao,
    })),
  }
}

function montar(opcoes: {
  ctx?: ContextoDasFerramentas
  banco?: Partial<BancoDasFerramentas>
  executar?: DepsDasFerramentas['executarAprovacao']
  acesso?: { permissao: Permissao }
  maxChamadas?: number
} = {}) {
  const chamadasAoBanco: string[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve(opcoes.ctx ?? contexto([])),
    lerContas: (_r, a) => (chamadasAoBanco.push(`ler:${a.termo}`), Promise.resolve([{ id: '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1', nome: 'Alfa', sinais: [] }])),
    pedirDescoberta: (_r, _a, p) => (
      chamadasAoBanco.push(`descoberta:${p.maxResults}`),
        Promise.resolve({ discoveryRunId: 'busca-1', outcome: 'pedido', creditos: 5, saldo: 100, novasNaCaixa: 12, estadoDoActor: 'available' })
    ),
    proporEnvio: (_r, _a, p) => (
      chamadasAoBanco.push(`propor:${p.targetAccountId}:${p.integrationId}`),
        Promise.resolve({ approvalId: 'ap-1', outcome: 'pendente', conta: 'Acme', crm: 'HubSpot' })
    ),
    ...opcoes.banco,
  }
  const chamadasAoCrm: string[] = []
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'a-1',
        kind: 'api_key',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ api_key: 'pat-segredo-1' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(opcoes.acesso?.permissao ?? 'ler'),
  }
  const fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada))
    chamadasAoCrm.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    return new Response(JSON.stringify({ results: [{ id: 'hs-1', properties: { name: 'Acme' } }] }), { status: 200 })
  }) as typeof globalThis.fetch
  const deps: DepsDasFerramentas = {
    banco,
    acesso: { banco: acessos, ambiente: () => undefined, fetch },
    ...(opcoes.executar ? { executarAprovacao: opcoes.executar } : {}),
    log: () => {},
  }
  const sessao = criarSessaoDeFerramentas(deps, {
    runId: 'r1',
    ctx: opcoes.ctx ?? contexto([]),
    ...(opcoes.maxChamadas ? { maxChamadas: opcoes.maxChamadas } : {}),
  })
  return { sessao, chamadasAoBanco, chamadasAoCrm }
}

Deno.test('cada ferramenta do catálogo declara as Especialidades que a usam e o que exige', () => {
  assertEquals(CATALOGO.map((f) => f.nome).sort(), [
    'buscar_contas_pelo_icp',
    'consultar_integracao',
    'ler_contas_e_sinais',
    'propor_envio_ao_crm',
  ])
  for (const f of CATALOGO) assert(f.especialidades.length > 0, f.nome)
  const porNome = Object.fromEntries(CATALOGO.map((f) => [f.nome, f]))
  assertEquals(porNome.buscar_contas_pelo_icp.especialidades, ['scopus'])
  assertEquals(porNome.propor_envio_ao_crm.exige, { categoria: 'CRM', permissao: 'propor' })
  assertEquals(porNome.consultar_integracao.exige, { permissao: 'ler' })
  assertEquals(porNome.ler_contas_e_sinais.exige, null)
})

Deno.test('o Agente da vez só vê o que a Especialidade e a Permissão dele permitem', () => {
  const ctx = contexto([
    { agente: SCOPUS, integracao: 'hubspot', permissao: 'propor' },
    { agente: RHETOR, integracao: 'hubspot', permissao: 'ler' },
  ])
  const { sessao } = montar({ ctx })
  assertEquals(sessao.paraOAgente(SCOPUS).map((f) => f.nome).sort(), [
    'buscar_contas_pelo_icp',
    'consultar_integracao',
    'ler_contas_e_sinais',
    'propor_envio_ao_crm',
  ])
  // Rhetor com Ler no HubSpot lê, mas não propõe, e não busca contas (é do Scopus).
  assertEquals(sessao.paraOAgente(RHETOR).map((f) => f.nome).sort(), ['consultar_integracao', 'ler_contas_e_sinais'])
  // Oraculum sem Permissão em Integração nenhuma: só a leitura do Workspace.
  assertEquals(sessao.paraOAgente(ORACULUM).map((f) => f.nome), ['ler_contas_e_sinais'])
})

Deno.test('a Permissão Ler não propõe: a chamada vira texto para o Agente e o banco nem é tocado', async () => {
  const ctx = contexto([{ agente: RHETOR, integracao: 'hubspot', permissao: 'ler' }])
  const { sessao, chamadasAoBanco } = montar({ ctx })
  const r = await sessao.chamar(RHETOR, 'propor_envio_ao_crm', { conta_id: '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1', crm: 'hubspot' })
  assert(r.erro)
  assertStringIncludes(r.paraOAgente, 'não está disponível')
  assertEquals(chamadasAoBanco, [])
})

Deno.test('propor com Propor: a Aprovação nasce pendente e o passo leva à Aprovação', async () => {
  const ctx = contexto([{ agente: RHETOR, integracao: 'hubspot', permissao: 'propor' }])
  let executou = 0
  const { sessao, chamadasAoBanco } = montar({ ctx, executar: () => (executou++, Promise.reject(new Error('não deveria'))) })
  const r = await sessao.chamar(RHETOR, 'propor_envio_ao_crm', { conta_id: '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1', crm: 'hubspot', justificativa: 'Sinal novo' })
  assert(!r.erro)
  assertEquals(chamadasAoBanco, ['propor:6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1:hubspot'])
  assertEquals(r.passo.descricao, 'Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação')
  assertEquals(r.passo.estado, 'aguardando')
  assertEquals(r.passo.link, { tipo: 'aprovacao', id: 'ap-1' })
  assertEquals(executou, 0)
  assertStringIncludes(r.paraOAgente, 'Aprovação')
})

Deno.test('propor com Executar: a Aprovação nasce liberada e o executor envia na hora', async () => {
  const ctx = contexto([{ agente: SCOPUS, integracao: 'hubspot', permissao: 'executar' }])
  const executadas: string[] = []
  const { sessao } = montar({
    ctx,
    banco: { proporEnvio: () => Promise.resolve({ approvalId: 'ap-9', outcome: 'liberada', conta: 'Acme', crm: 'HubSpot' }) },
    executar: (id) => (executadas.push(id), Promise.resolve({ status: 'enviado', mensagem: 'Enviada ao HubSpot.', pendencias: [] })),
  })
  const r = await sessao.chamar(SCOPUS, 'propor_envio_ao_crm', { conta_id: '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1', crm: 'hubspot' })
  assertEquals(executadas, ['ap-9'])
  assertEquals(r.passo.estado, 'concluida')
  assertEquals(r.passo.descricao, 'Scopus enviou a Acme ao HubSpot')
})

Deno.test('buscar contas pelo ICP: o pedido espera a confirmação na Caixa de Descobertas, com o custo', async () => {
  const { sessao, chamadasAoBanco } = montar()
  const r = await sessao.chamar(SCOPUS, 'buscar_contas_pelo_icp', { setores: ['Logística'], motivo: 'ICP' })
  assert(!r.erro)
  assertEquals(chamadasAoBanco, ['descoberta:50'])
  assertEquals(r.passo.link, { tipo: 'descobertas' })
  assertEquals(r.passo.estado, 'aguardando')
  assertStringIncludes(r.passo.descricao, 'Scopus pediu uma busca de contas pelo ICP')
  assertStringIncludes(r.passo.descricao, '5 Créditos')
  assertStringIncludes(r.passo.descricao, '12 candidatas na Caixa de Descobertas')
})

Deno.test('buscar contas sem setor nem palavra-chave volta ao Agente sem pedir nada', async () => {
  const { sessao, chamadasAoBanco } = montar()
  const r = await sessao.chamar(SCOPUS, 'buscar_contas_pelo_icp', { regioes: ['SP'] })
  assert(r.erro)
  assertEquals(chamadasAoBanco, [])
})

Deno.test('uma falha do banco vira texto para o Agente, nunca derruba o pedido', async () => {
  const { sessao } = montar({
    banco: { lerContas: () => Promise.reject(new ErroDoBanco('55000', 'run is not running')) },
  })
  const r = await sessao.chamar(SCOPUS, 'ler_contas_e_sinais', { termo: 'alfa' })
  assert(r.erro)
  assertEquals(r.passo.estado, 'falhou')
  assertStringIncludes(r.paraOAgente, 'falhou')
})

Deno.test('o limite de chamadas por pedido vale para todos os Agentes juntos', async () => {
  const { sessao, chamadasAoBanco } = montar({ maxChamadas: 2 })
  await sessao.chamar(SCOPUS, 'ler_contas_e_sinais', { termo: 'a' })
  await sessao.chamar(RHETOR, 'ler_contas_e_sinais', { termo: 'b' })
  const terceira = await sessao.chamar(SCOPUS, 'ler_contas_e_sinais', { termo: 'c' })
  assert(terceira.erro)
  assertStringIncludes(terceira.paraOAgente, 'limite')
  assertEquals(chamadasAoBanco, ['ler:a', 'ler:b'])
})

Deno.test('consultar uma Integração só chama ferramentas de leitura, com o Acesso de quem pediu', async () => {
  const ctx = contexto([{ agente: RHETOR, integracao: 'hubspot', permissao: 'ler' }])
  const { sessao, chamadasAoCrm } = montar({ ctx, acesso: { permissao: 'executar' } })
  const leitura = await sessao.chamar(RHETOR, 'consultar_integracao', {
    integracao: 'hubspot',
    ferramenta: 'search_companies',
    argumentos: { query: 'Acme' },
  })
  assert(!leitura.erro, leitura.paraOAgente)
  assertEquals(chamadasAoCrm, ['POST /crm/v3/objects/companies/search'])
  assertStringIncludes(leitura.passo.descricao, 'Rhetor consultou o HubSpot')
  const escrita = await sessao.chamar(RHETOR, 'consultar_integracao', {
    integracao: 'hubspot',
    ferramenta: 'create_company',
    argumentos: { properties: { name: 'X' } },
  })
  assert(escrita.erro)
  assertEquals(chamadasAoCrm.length, 1)
  assert(!JSON.stringify([leitura, escrita]).includes('pat-segredo-1'))
})

Deno.test('o mural mostra o que cada Agente fez, para o próximo Agente ver', async () => {
  const ctx = contexto([{ agente: RHETOR, integracao: 'hubspot', permissao: 'propor' }])
  const { sessao } = montar({ ctx })
  await sessao.chamar(SCOPUS, 'buscar_contas_pelo_icp', { setores: ['Logística'] })
  await sessao.chamar(RHETOR, 'propor_envio_ao_crm', { conta_id: '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1', crm: 'hubspot' })
  assertEquals(sessao.mural().length, 2)
  assertStringIncludes(sessao.mural()[1], 'Rhetor propôs enviar a Acme ao HubSpot')
})
