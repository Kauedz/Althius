// A ferramenta `buscar_sinais` do Hermes (sinais em cascata, fatia 2): o Scopus pede Sinais de um tipo do catálogo para as
// Contas do Workspace, com teto de créditos; a busca roda pelo MESMO motor dos Monitoramentos e o Agente recebe só itens
// normalizados, créditos e uma mensagem neutra. Sem Sinal informado, ela lista o catálogo (e explica os que não têm fonte).
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { buscaDeSinaisPorHttp } from './busca-de-sinais.ts'
import {
  type BancoDasFerramentas,
  type BuscaDeSinais,
  criarSessaoDeFerramentas,
  type DepsDasFerramentas,
  FERRAMENTAS,
  type RespostaDaBusca,
} from './ferramentas-dos-agentes.ts'
import { MARCA_INTERNA } from './marca.ts'
import type { AgenteDoWorkspace } from './orquestracao.ts'

const agente = (specialty: string): AgenteDoWorkspace => ({
  id: `agente-${specialty}`, name: specialty[0].toUpperCase() + specialty.slice(1), specialty, kind: 'padrao', instructions: '', voice_tone: '',
})
const SCOPUS = agente('scopus')
const RHETOR = agente('rhetor')
const CTX = { workspaceId: 'ws-1', requestedBy: 'usuario-ana', permissoes: [] }

const CATALOGO_DE_SINAIS = [
  { sinal: 'vaga_comex', icp: 'A', nome: 'Vaga de analista de comex', estado: 'disponivel', escopo: 'conta', motivo: null },
  { sinal: 'novo_importador', icp: 'A', nome: 'Novo importador', estado: 'em_validacao', escopo: 'conta', motivo: null },
  { sinal: 'habilitacao_radar', icp: 'A', nome: 'Habilitação no Radar', estado: 'sem_fonte', escopo: 'conta', motivo: 'A consulta é individual e exige verificação humana; não há fonte pública em massa.' },
  { sinal: 'cnpj_novo', icp: 'B', nome: 'CNPJ novo', estado: 'disponivel', escopo: 'conta', motivo: null },
  { sinal: 'processos_publicos', icp: 'C', nome: 'Processos públicos', estado: 'em_validacao', escopo: 'conta', motivo: null },
  // Fora do Mapa de Mercado: o catálogo do banco pode ter um tipo a mais, e o Hermes não o oferece.
  { sinal: 'sinal_fora_do_mapa', icp: 'A', nome: 'Fora do Mapa', estado: 'disponivel', escopo: 'conta', motivo: null },
]

const RESPOSTA: RespostaDaBusca = {
  desfecho: 'concluida', mensagem: '2 Sinais novos gravados.', creditos: 2, novos: 2, repetidos: 0, empresasSemConta: 3,
  sinais: [
    { conta: 'Alfa', contaId: 'c-1', frase: 'Abriu vaga de Analista de Comex', quando: '2026-10-12T10:00:00Z', fonte: 'LinkedIn Vagas', evidencia: 'Analista de Comex — Alfa.' },
    { conta: 'Beta', contaId: 'c-2', frase: 'Abriu vaga de Despachante Aduaneiro', quando: '2026-10-11T10:00:00Z', fonte: 'LinkedIn Vagas', evidencia: 'Despachante — Beta.' },
  ],
}

function montar(opcoes: { resposta?: RespostaDaBusca | Error; semSinais?: boolean } = {}) {
  const buscas: Parameters<BuscaDeSinais['buscar']>[0][] = []
  const sinais: BuscaDeSinais = {
    catalogo: () => Promise.resolve(CATALOGO_DE_SINAIS),
    buscar: (a) => {
      buscas.push(a)
      const r = opcoes.resposta ?? RESPOSTA
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
    },
  }
  const banco = {} as BancoDasFerramentas
  const deps: DepsDasFerramentas = { banco, ...(opcoes.semSinais ? {} : { sinais }), log: () => {} }
  const sessao = criarSessaoDeFerramentas(deps, { runId: 'run-1', ctx: CTX })
  return { sessao, buscas }
}

Deno.test('buscar_sinais é do Scopus e só aparece quando a busca de Sinais está ligada', () => {
  const f = FERRAMENTAS.find((x) => x.nome === 'buscar_sinais')!
  assertEquals(f.especialidades, ['scopus'])
  assertEquals(montar().sessao.paraOAgente(SCOPUS).map((x) => x.nome).includes('buscar_sinais'), true)
  assertEquals(montar().sessao.paraOAgente(RHETOR).map((x) => x.nome).includes('buscar_sinais'), false)
  assertEquals(montar({ semSinais: true }).sessao.paraOAgente(SCOPUS).map((x) => x.nome).includes('buscar_sinais'), false)
  const texto = JSON.stringify(f)
  assert(!MARCA_INTERNA.test(texto), 'a descrição da ferramenta não cita fornecedor nem actor')
})

Deno.test('com o Sinal informado, roda a busca com o Workspace e quem pediu, um teto de créditos e uma chave', async () => {
  const { sessao, buscas } = montar()
  const r = await sessao.chamar(SCOPUS, 'buscar_sinais', {
    sinal: 'vaga_comex', icp: 'A', contas: ['c-1'], criterios: { termos: ['analista de comex'], periodo: 'Últimos 7 dias' }, teto_creditos: 4,
  })
  assertEquals(r.erro, false)
  assertEquals(buscas.length, 1)
  const b = buscas[0]
  assertEquals([b.workspaceId, b.userId, b.sinal, b.tetoCreditos], ['ws-1', 'usuario-ana', 'vaga_comex', 4])
  assertEquals(b.contas, ['c-1'])
  assertEquals(b.criterios, { termos: ['analista de comex'], periodo: 'Últimos 7 dias' })
  assert(b.chave.startsWith('hermes:run-1:agente-scopus:vaga_comex:'), b.chave)
  const dado = JSON.parse(r.paraOAgente)
  assertEquals([dado.sinal, dado.creditos, dado.novos, dado.empresasSemConta, dado.sinais.length], ['vaga_comex', 2, 2, 3, 2])
  assertEquals(dado.sinais[0].conta, 'Alfa')
  assert(!MARCA_INTERNA.test(r.paraOAgente) && !MARCA_INTERNA.test(r.passo.descricao))
  assertStringIncludes(r.passo.descricao, '2 Sinais')
  assertEquals(r.passo.estado, 'concluida')
})

Deno.test('sem teto informado, a busca leva o teto padrão; o teto é limitado a 20 créditos', async () => {
  const { sessao, buscas } = montar()
  await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex' })
  await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex', teto_creditos: 999, criterios: { termos: ['b'] } })
  await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex', teto_creditos: 0, criterios: { termos: ['c'] } })
  assertEquals(buscas.map((b) => b.tetoCreditos), [5, 20, 1])
})

Deno.test('o mesmo pedido repetido na Execução leva a mesma chave (a cobrança é idempotente)', async () => {
  const { sessao, buscas } = montar()
  await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex', criterios: { termos: ['x'] } })
  await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex', criterios: { termos: ['x'] } })
  await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex', criterios: { termos: ['outro'] } })
  assertEquals(buscas[0].chave, buscas[1].chave)
  assert(buscas[0].chave !== buscas[2].chave)
})

Deno.test('sem o Sinal, lista o catálogo do ICP sem gastar nada, explicando os que não têm fonte', async () => {
  const { sessao, buscas } = montar()
  const r = await sessao.chamar(SCOPUS, 'buscar_sinais', { icp: 'A' })
  assertEquals(buscas.length, 0)
  assertEquals(r.erro, false)
  const dado = JSON.parse(r.paraOAgente)
  assertEquals(dado.catalogo.map((c: { sinal: string }) => c.sinal), ['vaga_comex', 'novo_importador', 'habilitacao_radar'])
  const radar = dado.catalogo.find((c: { sinal: string }) => c.sinal === 'habilitacao_radar')
  assertEquals(radar.estado, 'sem_fonte')
  assertStringIncludes(radar.motivo, 'não há fonte pública em massa')
  assertStringIncludes(dado.orientacao, 'sem fonte')
  assert(!MARCA_INTERNA.test(r.paraOAgente))
})

Deno.test('Sinal sem fonte, em validação ou desconhecido não gasta nada e explica', async () => {
  const { sessao, buscas } = montar()
  const semFonte = await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'habilitacao_radar' })
  assertEquals(semFonte.erro, false)
  assertStringIncludes(semFonte.paraOAgente, 'não há fonte pública em massa')
  const emTeste = await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'novo_importador' })
  assertStringIncludes(emTeste.paraOAgente, 'validação')
  const nada = await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'nao_existe' })
  assertEquals(nada.erro, true)
  assertStringIncludes(nada.paraOAgente, 'catálogo')
  assertEquals(buscas.length, 0)
})

Deno.test('a falha da busca vira texto neutro para o Agente, sem o erro real', async () => {
  const { sessao } = montar({ resposta: new Error('signal-cascade respondeu 500: begin_cascade_run failed (apify_api_SEGREDO0123456789)') })
  const r = await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex' })
  assertEquals(r.erro, true)
  assert(!MARCA_INTERNA.test(r.paraOAgente) && !r.paraOAgente.includes('SEGREDO') && !r.passo.descricao.includes('SEGREDO'), r.paraOAgente)
  assertEquals(r.passo.estado, 'falhou')
})

Deno.test('o desfecho que não concluiu volta ao Agente como mensagem e o passo mostra a falha', async () => {
  const { sessao } = montar({ resposta: { ...RESPOSTA, desfecho: 'sem_creditos', mensagem: 'O Workspace não tem créditos suficientes para essa busca.', creditos: 0, novos: 0, sinais: [] } })
  const r = await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'vaga_comex' })
  assertEquals(r.erro, false)
  assertStringIncludes(r.paraOAgente, 'créditos suficientes')
  assertEquals(r.passo.estado, 'falhou')
})

Deno.test('o cliente HTTP chama a função de Sinais com a chave de serviço e traduz a resposta', async () => {
  const chamadas: { url: string; autorizacao: string | null; corpo: unknown }[] = []
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), autorizacao: new Headers(init?.headers).get('Authorization'), corpo: JSON.parse(String(init?.body)) })
    const corpo = JSON.parse(String(init?.body)).action === 'catalogo' ? { sinais: CATALOGO_DE_SINAIS } : RESPOSTA
    return Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }))
  }) as typeof fetch
  const busca = buscaDeSinaisPorHttp({ baseUrl: 'https://proj.supabase.co', chaveDeServico: 'chave-de-servico', fetchFn })
  assertEquals((await busca.catalogo()).length, CATALOGO_DE_SINAIS.length)
  const r = await busca.buscar({ workspaceId: 'ws-1', userId: 'u', sinal: 'vaga_comex', chave: 'k', tetoCreditos: 3 })
  assertEquals(r.creditos, 2)
  assertEquals(chamadas[1].url, 'https://proj.supabase.co/functions/v1/signal-cascade')
  assertEquals(chamadas[1].autorizacao, 'Bearer chave-de-servico')
  assertEquals(chamadas[1].corpo, { workspaceId: 'ws-1', userId: 'u', sinal: 'vaga_comex', chave: 'k', tetoCreditos: 3 })
})

Deno.test('o cliente HTTP nunca põe a chave de serviço no erro', async () => {
  const fetchFn = (() => Promise.resolve(new Response('{"mensagem":"ruim"}', { status: 500 }))) as typeof fetch
  const busca = buscaDeSinaisPorHttp({ baseUrl: 'https://proj.supabase.co', chaveDeServico: 'chave-de-servico', fetchFn })
  try {
    await busca.buscar({ workspaceId: 'ws-1', userId: 'u', sinal: 'vaga_comex', chave: 'k' })
    assert(false, 'devia falhar')
  } catch (e) {
    assert(!String(e).includes('chave-de-servico'))
  }
})

Deno.test('o catálogo traz o gatilho e a restrição de cada ICP e só oferece Sinais do Mapa de Mercado', async () => {
  const { sessao, buscas } = montar()
  const todos = JSON.parse((await sessao.chamar(SCOPUS, 'buscar_sinais', {})).paraOAgente)
  assertEquals(todos.catalogo.some((c: { sinal: string }) => c.sinal === 'sinal_fora_do_mapa'), false)
  assertEquals(todos.icps.map((i: { icp: string }) => i.icp), ['A', 'B', 'C'])
  const juridico = todos.icps.find((i: { icp: string }) => i.icp === 'C')
  assertEquals(juridico.nome, 'Jurídico empresarial')
  assertStringIncludes(juridico.restricao, 'sem dado pessoal')
  assertEquals(todos.icps.find((i: { icp: string }) => i.icp === 'A').restricao, undefined)
  assert(!MARCA_INTERNA.test(JSON.stringify(todos)))
  const foraDoMapa = await sessao.chamar(SCOPUS, 'buscar_sinais', { sinal: 'sinal_fora_do_mapa' })
  assertEquals(foraDoMapa.erro, true)
  assertEquals(buscas.length, 0)
})
