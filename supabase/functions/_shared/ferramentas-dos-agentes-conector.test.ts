// A ferramenta genérica `usar_conector` (ADR-0022): o Agente lista as ferramentas que o servidor do conector oferece, lidas
// pelo Acesso de quem pediu, e chama uma delas. A leitura permitida executa; a escrita segue a regra do Administrador
// somada à Permissão do Agente, e com "pedir Aprovação" nasce a Aprovação com a chamada exata. O banco, o Acesso e o
// executor são dublês; o servidor MCP é o falso, sem nenhum código específico por app.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { DesfechoDaChamadaAprovada } from './executor-de-aprovacoes.ts'
import {
  type BancoDasFerramentas,
  CATALOGO,
  type ContextoDasFerramentas,
  criarSessaoDeFerramentas,
  type DepsDasFerramentas,
} from './ferramentas-dos-agentes.ts'
import type { BancoDeAcessos, Permissao, RegrasDaIntegracao } from './integration-access.ts'
import type { FerramentaMcp } from './integracoes/mcp-cliente.ts'
import { servidorMcpFalso } from './integracoes/servidor-mcp-falso.ts'
import type { AgenteDoWorkspace } from './orquestracao.ts'

const RHETOR: AgenteDoWorkspace = { id: 'agente-rhetor', name: 'Rhetor', specialty: 'rhetor', kind: 'padrao', instructions: '', voice_tone: '' }

const FERRAMENTAS: FerramentaMcp[] = [
  { name: 'buscar_paginas', description: 'Busca páginas.', inputSchema: { type: 'object', properties: { q: { type: 'string' } } }, annotations: { readOnlyHint: true } },
  { name: 'criar_pagina', description: 'Cria uma página.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' } } } },
  { name: 'apagar_pagina', description: 'Apaga uma página.', inputSchema: { type: 'object' } },
]

function contexto(permissao: Permissao): ContextoDasFerramentas {
  return {
    workspaceId: 'ws-1',
    requestedBy: 'usuario-bruno',
    permissoes: [{ agentId: RHETOR.id, integrationId: 'notion', permission: permissao, category: 'Conhecimento', name: 'Notion' }],
  }
}

function montar(opcoes: {
  permissao?: Permissao
  regras?: RegrasDaIntegracao
  outcome?: string
  resultado?: string
  executar?: (approvalId: string) => Promise<DesfechoDaChamadaAprovada>
  semRegras?: boolean
} = {}) {
  const permissao = opcoes.permissao ?? 'executar'
  const servidor = servidorMcpFalso({
    token: 'acc-bruno-111',
    ferramentas: FERRAMENTAS,
    resultados: { buscar_paginas: { content: [{ type: 'text', text: opcoes.resultado ?? 'Pauta da Alfa' }] } },
  })
  const propostas: { agenteId: string; a: Record<string, unknown> }[] = []
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve(contexto(permissao)),
    lerContas: () => Promise.resolve([]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
    proporChamada: (_runId, agenteId, a) => (
      propostas.push({ agenteId, a: a as unknown as Record<string, unknown> }),
        Promise.resolve({ approvalId: 'ap-7', outcome: opcoes.outcome ?? 'pendente' })
    ),
  }
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-bruno',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ access_token: 'acc-bruno-111' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(permissao),
    ...(opcoes.semRegras ? {} : { regrasDasFerramentas: () => Promise.resolve(opcoes.regras ?? {}) }),
  }
  const executadas: string[] = []
  const deps: DepsDasFerramentas = {
    banco,
    acesso: { banco: acessos, ambiente: () => undefined, fetch: servidor.fetch },
    executarChamada: opcoes.executar ?? ((id) => (executadas.push(id), Promise.resolve({ status: 'executada', mensagem: 'ok', resultado: '"feito"' }))),
    log: () => {},
  }
  const sessao = criarSessaoDeFerramentas(deps, { runId: 'run-1', ctx: contexto(permissao) })
  const chamadasAoApp = () =>
    servidor.chamadas.filter((c) => c.rpc === 'tools/call').map((c) => (c.corpo?.params as { name: string }).name)
  return { sessao, propostas, executadas, chamadasAoApp }
}

Deno.test('usar_conector entra para quem tem Permissão num conector e o banco das regras; o catálogo antigo não muda', () => {
  const { sessao } = montar({ permissao: 'ler' })
  assert(sessao.paraOAgente(RHETOR).some((f) => f.nome === 'usar_conector'))
  assert(sessao.conhece('usar_conector'))
  const descricao = sessao.paraOAgente(RHETOR).find((f) => f.nome === 'usar_conector')!.descricao
  assertStringIncludes(descricao, 'notion (Notion): Ler')
  assert(!CATALOGO.some((f) => f.nome === 'usar_conector'))
  // Sem o banco saber ler as regras, a ferramenta não é oferecida (não há como aplicar a Permissão por ferramenta).
  assert(!montar({ semRegras: true }).sessao.paraOAgente(RHETOR).some((f) => f.nome === 'usar_conector'))
})

Deno.test('listar devolve as ferramentas do servidor com o que acontece em cada uma, sem as bloqueadas', async () => {
  const { sessao } = montar({ permissao: 'executar', regras: { apagar_pagina: 'bloqueada', buscar_paginas: 'sempre' } })
  const r = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'listar' })
  assert(!r.erro, r.paraOAgente)
  const lista = JSON.parse(r.paraOAgente) as { nome: string; escreve: boolean; uso: string; esquema: unknown }[]
  assertEquals(lista.map((f) => [f.nome, f.escreve, f.uso]), [
    ['buscar_paginas', false, 'executa'],
    ['criar_pagina', true, 'pede Aprovação'],
  ])
  assertEquals(lista[0].esquema, { type: 'object', properties: { q: { type: 'string' } } })
  assertEquals(r.passo, { descricao: 'Rhetor viu as ferramentas do Notion', estado: 'concluida' })
})

Deno.test('com Ler, a lista só tem leitura, e a escrita é recusada sem propor nem chamar o app', async () => {
  const { sessao, propostas, chamadasAoApp } = montar({ permissao: 'ler' })
  const lista = JSON.parse((await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'listar' })).paraOAgente)
  assertEquals(lista.map((f: { nome: string }) => f.nome), ['buscar_paginas'])
  const r = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'criar_pagina', argumentos: { titulo: 'X' } })
  assert(r.erro)
  assertStringIncludes(r.paraOAgente, 'Ler')
  assertEquals(propostas, [])
  assertEquals(chamadasAoApp(), [])
})

Deno.test('uma leitura permitida executa e volta, cortada, para a próxima rodada', async () => {
  const { sessao, chamadasAoApp } = montar({ permissao: 'ler', resultado: 'x'.repeat(20_000) })
  const r = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'buscar_paginas', argumentos: { q: 'Alfa' } })
  assert(!r.erro, r.paraOAgente)
  assertEquals(chamadasAoApp(), ['buscar_paginas'])
  assert(r.paraOAgente.length < 7000)
  assert(r.paraOAgente.endsWith('[cortado]'))
  assert(!r.paraOAgente.includes('acc-bruno-111'))
  assertEquals(r.passo, { descricao: 'Rhetor usou buscar_paginas no Notion', estado: 'concluida' })
})

Deno.test('escrita com Executar e sem regra: nasce a Aprovação com a chamada exata, e nada chega ao app', async () => {
  const { sessao, propostas, chamadasAoApp } = montar({ permissao: 'executar' })
  const r = await sessao.chamar(RHETOR, 'usar_conector', {
    integracao: 'notion',
    ferramenta: 'criar_pagina',
    argumentos: { titulo: 'Pauta da Alfa' },
    justificativa: 'A Alfa pediu a pauta.',
  })
  assert(!r.erro, r.paraOAgente)
  assertEquals(propostas.length, 1)
  assertEquals(propostas[0].agenteId, RHETOR.id)
  assertEquals(propostas[0].a.payload, {
    tipo: 'ferramenta',
    integration_id: 'notion',
    ferramenta: 'criar_pagina',
    argumentos: { titulo: 'Pauta da Alfa' },
  })
  assertEquals(propostas[0].a.integrationId, 'notion')
  assertEquals(propostas[0].a.justificativa, 'A Alfa pediu a pauta.')
  assertEquals(chamadasAoApp(), [])
  assertEquals(r.passo, {
    descricao: 'Rhetor propôs usar criar_pagina no Notion — aguardando Aprovação',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-7' },
  })
  assertStringIncludes(r.paraOAgente, 'Nada foi feito ainda')
})

Deno.test('escrita com Executar e "sempre": executa na hora, sem Aprovação', async () => {
  const { sessao, propostas, chamadasAoApp } = montar({ permissao: 'executar', regras: { criar_pagina: 'sempre' } })
  const r = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'criar_pagina', argumentos: { titulo: 'X' } })
  assert(!r.erro, r.paraOAgente)
  assertEquals(propostas, [])
  assertEquals(chamadasAoApp(), ['criar_pagina'])
})

Deno.test('bloqueada é recusada; uma ferramenta que o servidor não tem também, sem propor nada', async () => {
  const { sessao, propostas, chamadasAoApp } = montar({ permissao: 'executar', regras: { apagar_pagina: 'bloqueada' } })
  const bloqueada = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'apagar_pagina' })
  assert(bloqueada.erro)
  assertStringIncludes(bloqueada.paraOAgente, 'bloqueou')
  const inexistente = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'formatar_disco' })
  assert(inexistente.erro)
  assertStringIncludes(inexistente.paraOAgente, 'listar')
  assertEquals(propostas, [])
  assertEquals(chamadasAoApp(), [])
})

Deno.test('uma Aprovação que nasce liberada vai direto ao executor, que faz a chamada aprovada', async () => {
  const { sessao, executadas } = montar({ permissao: 'executar', outcome: 'liberada', regras: { buscar_paginas: 'aprovacao' } })
  const r = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'notion', ferramenta: 'buscar_paginas', argumentos: {} })
  assert(!r.erro, r.paraOAgente)
  assertEquals(executadas, ['ap-7'])
  assertEquals(r.passo.estado, 'concluida')
})

Deno.test('uma Integração em que o Agente não tem Permissão não é usada', async () => {
  const { sessao, chamadasAoApp } = montar({ permissao: 'executar' })
  const r = await sessao.chamar(RHETOR, 'usar_conector', { integracao: 'hubspot', ferramenta: 'listar' })
  assert(r.erro)
  assertEquals(chamadasAoApp(), [])
})
