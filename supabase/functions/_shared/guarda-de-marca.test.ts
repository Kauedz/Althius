// Guarda de marca (sinais em cascata, fatia 1): o usuário e o Hermes nunca leem "Apify" nem "actor". O teste roda cada
// caminho que devolve texto ao cliente, grava `last_error` ou entra no prompt/resultado de ferramenta do Hermes, com o
// Apify falso falhando de todo jeito, e procura a marca. O token falso também nunca pode aparecer em log, erro,
// resultado de ferramenta ou prompt (guarda c).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler as handlerDaDescoberta, type Db as DbDaDescoberta } from '../account-discovery/handler.ts'
import { ACTOR_RECEITA } from '../account-discovery/normalizar.ts'
import { ActorRequestError, ActorTimeoutError, createHandler as handlerDaFoto, type Db as DbDaFoto } from '../contact-photo-lookup/handler.ts'
import { createHandler as handlerDoRunner, SemDadoParaVarrer } from '../signal-runner/handler.ts'
import type { AdaptadorDeSinal, Db as DbDoRunner } from '../signal-runner/handler.ts'
import {
  type Apify,
  ApifyRequestError,
  ApifyTimeoutError,
  createHandler as handlerDoScan,
  type Db as DbDoScan,
} from '../signal-scan/handler.ts'
import { clienteDoApify } from '../signal-scan/apify.ts'
import { instrucoesDoAgente } from '../_hermes-worker/worker.ts'
import { MARCA_INTERNA } from './marca.ts'
import { criarSessaoDeFerramentas, type BancoDasFerramentas } from './ferramentas-dos-agentes.ts'
import type { AgenteDoWorkspace, Reserva } from './orquestracao.ts'

const WS = '22222222-2222-4222-8222-222222222222'
const TOKEN_FALSO = 'apify_api_SEGREDO_DE_TESTE_123456789'

function semMarca(texto: unknown, onde: string) {
  const s = typeof texto === 'string' ? texto : JSON.stringify(texto)
  assert(!MARCA_INTERNA.test(s), `${onde} deixou vazar a marca: ${s}`)
  assert(!s.includes(TOKEN_FALSO), `${onde} deixou vazar o token`)
}

const FALHAS_DO_FORNECEDOR: Error[] = [
  new ApifyRequestError(402),
  new ApifyRequestError(403),
  new ApifyRequestError(500),
  new ApifyTimeoutError(),
  new Error(`falha de rede com ${TOKEN_FALSO}`),
]

Deno.test('descoberta de contas: a falha do fornecedor grava um motivo em palavras do produto', async () => {
  for (const falha of FALHAS_DO_FORNECEDOR) {
    const encerramentos: { error: string | null }[] = []
    const espera: Promise<unknown>[] = []
    const db: DbDaDescoberta = {
      userFromJwt: () => Promise.resolve({ userId: 'u1' }),
      lerIcp: () => Promise.resolve(null),
      actoresDeBusca: () => Promise.resolve([{ actorId: ACTOR_RECEITA, state: 'available', version: 'v1', maxCostUsd: 1 }]),
      iniciar: () => Promise.resolve({ runId: '33333333-3333-4333-8333-333333333333', outcome: 'go', state: 'running', actorVersion: 'v1' }),
      gravarCandidatas: () => Promise.resolve({ added: 0, duplicates: 0, ignored: 0 }),
      gravarCusto: () => Promise.resolve(),
      encerrar: (a) => (encerramentos.push(a), Promise.resolve()),
    }
    const apify: Apify = { run: () => Promise.reject(falha) }
    const logs: unknown[] = []
    const h = handlerDaDescoberta({ db, apify, appOrigin: 'https://app.test', waitUntil: (t) => espera.push(t), log: (c) => logs.push(c) })
    await h(
      new Request('http://x/account-discovery', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt', apikey: 'k', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', workspaceId: WS, criteria: { fonte: 'receita', cnaes: ['6201501'] }, maxResults: 5 }),
      }),
    )
    await Promise.all(espera)
    assertEquals(encerramentos.length, 1)
    semMarca(encerramentos[0].error, 'discovery_runs.last_error')
    // O log pode guardar o código técnico, mas nunca o token.
    assert(!JSON.stringify(logs).includes(TOKEN_FALSO), 'o log da descoberta vazou o token')
  }
})

Deno.test('descoberta de contas: o Actor em teste, fora ou fora do registro responde sem a palavra Actor', async () => {
  for (const estado of ['testing', 'out', 'ausente'] as const) {
    const db: DbDaDescoberta = {
      userFromJwt: () => Promise.resolve({ userId: 'u1' }),
      lerIcp: () => Promise.resolve(null),
      actoresDeBusca: () => Promise.resolve(estado === 'ausente' ? [] : [{ actorId: ACTOR_RECEITA, state: estado, version: 'v1', maxCostUsd: 1 }]),
      iniciar: () => Promise.reject(new Error('não deveria abrir')),
      gravarCandidatas: () => Promise.resolve({ added: 0, duplicates: 0, ignored: 0 }),
      gravarCusto: () => Promise.resolve(),
      encerrar: () => Promise.resolve(),
    }
    const h = handlerDaDescoberta({ db, apify: { run: () => Promise.reject(new Error('x')) }, appOrigin: 'https://app.test', waitUntil: () => {}, log: () => {} })
    const r = await h(
      new Request('http://x/account-discovery', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt', apikey: 'k', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', workspaceId: WS, criteria: { fonte: 'receita', cnaes: ['6201501'] }, maxResults: 5 }),
      }),
    )
    // O `code` é um identificador técnico que a tela não mostra; a mensagem (`error`) é a que o usuário lê.
    semMarca((await r.json()).error, `descoberta (${estado})`)
  }
})

Deno.test('foto do Contato: a falha do fornecedor responde sem a marca', async () => {
  for (const falha of [new ActorRequestError(500), new ActorRequestError(402), new ActorTimeoutError(), new Error(TOKEN_FALSO)]) {
    const db: DbDaFoto = {
      userFromJwt: () => Promise.resolve({ userId: 'ana' }),
      beginLookup: () => Promise.resolve({ kind: 'reserved', lookupId: 'd0000000-0000-0000-0000-000000000001', linkedinUrl: 'https://www.linkedin.com/in/maria' }),
      finishLookup: () => Promise.resolve(),
    }
    const h = handlerDaFoto({
      db,
      actor: { actorId: 'harvestapi~linkedin-profile-scraper', fetchPhoto: () => Promise.reject(falha) },
      appOrigin: 'https://app.althius.com.br',
      log: () => {},
    })
    const r = await h(
      new Request('https://fn.test/contact-photo-lookup', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-da-ana', apikey: 'anon', Origin: 'https://app.althius.com.br', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: 'c0000000-0000-0000-0000-000000000001' }),
      }),
    )
    semMarca((await r.json()).error, `foto (${String(falha)})`)
  }
})

Deno.test('signal-scan: toda recusa e falha responde sem a marca', async () => {
  for (const falha of FALHAS_DO_FORNECEDOR) {
    for (const estado of ['available', 'testing', 'out', null] as const) {
      const db: DbDoScan = {
        actorForScan: () => Promise.resolve(estado ? { actorId: 'a~b', signalType: 'x', state: estado, version: null, maxCostUsd: 1 } : null),
        recordCost: () => Promise.resolve(),
      }
      const h = handlerDoScan({ db, apify: { run: () => Promise.reject(falha) }, autorizado: () => true, log: () => {} })
      const r = await h(
        new Request('http://x/signal-scan', {
          method: 'POST',
          headers: { Authorization: 'Bearer chave' },
          body: JSON.stringify({ workspaceId: WS, actorId: 'a~b', input: { q: 1 } }),
        }),
      )
      semMarca((await r.json()).error, `signal-scan (${estado})`)
    }
    // A entrada inválida também.
    const h = handlerDoScan({ db: { actorForScan: () => Promise.resolve(null), recordCost: () => Promise.resolve() }, apify: { run: () => Promise.reject(falha) }, autorizado: () => true, log: () => {} })
    for (const corpo of [{ workspaceId: WS, actorId: 'a~b', input: [] }, { workspaceId: WS, actorId: 'a~b', input: { x: 'y'.repeat(30_000) } }]) {
      const r = await h(new Request('http://x/signal-scan', { method: 'POST', headers: { Authorization: 'Bearer chave' }, body: JSON.stringify(corpo) }))
      semMarca((await r.json()).error, 'signal-scan (entrada inválida)')
    }
  }
})

Deno.test('as mensagens dos erros do cliente do Apify não citam o fornecedor', () => {
  for (const erro of [new ApifyRequestError(500), new ApifyTimeoutError(), new ActorRequestError(500), new ActorTimeoutError()]) {
    semMarca(erro.message, erro.name)
  }
})

Deno.test('signal-runner: o Monitoramento e a busca param sem citar o actor', async () => {
  const adaptador: AdaptadorDeSinal = {
    signalType: 'nova_lideranca',
    entrada: () => { throw new SemDadoParaVarrer('sem dado') },
    sinais: () => [],
  }
  const fins: (string | null)[] = []
  const buscasFim: (string | null)[] = []
  const db: DbDoRunner = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve([{ monitorId: 'm', workspaceId: WS, signalType: 'nova_lideranca', criteria: {}, createdBy: null, slot: '2026-10-01T00:00:00Z', accounts: [] }]),
    actorForType: () => Promise.resolve({ actorId: 'a~b', signalType: 'nova_lideranca', state: 'testing', version: null, maxCostUsd: 1 }),
    beginScan: () => Promise.resolve({ outcome: 'go', reservationId: 'r' }),
    endScan: () => Promise.resolve(),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_m, _a, erro) => (fins.push(erro), Promise.resolve()),
  }
  const conta = { id: 'c', name: 'Alfa', domain: null, linkedinUrl: null }
  const h = handlerDoRunner({
    db,
    apify: { run: () => Promise.reject(new Error(TOKEN_FALSO)) },
    adaptadores: { nova_lideranca: adaptador },
    buscas: {
      claim: () => Promise.resolve([{ rescanId: 'b', workspaceId: WS, origin: 'manual', requestedBy: null, requestedAt: '2026-10-01T00:00:00Z', account: conta, monitors: [{ monitorId: 'm', signalType: 'nova_lideranca', criteria: {} }] }]),
      beginScan: () => Promise.resolve({ outcome: 'go', reservationId: 'r' }),
      endScan: () => Promise.resolve(),
      finish: (_i, _s, _n, erro) => (buscasFim.push(erro), Promise.resolve()),
      stopWorkspace: () => Promise.resolve(0),
      kick: () => Promise.resolve(),
    },
    agora: () => Date.parse('2026-10-01T00:00:00Z'),
    log: () => {},
  })
  await h(new Request('http://x/signal-runner', { method: 'POST', headers: { 'x-runner-token': 'x'.repeat(40) }, body: '{}' }))
  assert(fins.length > 0 && buscasFim.length > 0, 'o Monitoramento e a busca precisam ter fechado com motivo')
  semMarca(fins, 'signal_monitors.last_error')
  semMarca(buscasFim, 'signal_rescans.last_error')
})

Deno.test('o cliente do Apify nunca põe o token em erro nem em log', async () => {
  const logs: unknown[] = []
  const falsoFetch = ((_u: unknown, _i?: unknown) => Promise.resolve(new Response('{"error":{"message":"Insufficient credit"}}', { status: 402 }))) as typeof fetch
  const cliente = clienteDoApify({ tokens: [TOKEN_FALSO], fetchFn: falsoFetch, log: (c) => logs.push(c) })
  let erro: unknown
  try {
    await cliente.run({ actorId: 'a~b', input: {}, maxItems: 1, maxTotalChargeUsd: 0.1 })
  } catch (e) {
    erro = e
  }
  assert(erro instanceof Error)
  // O nome da classe do erro é identificador interno; a mensagem é o que pode chegar mais longe.
  semMarca((erro as Error).message, 'erro do cliente do Apify')
  assert(!String(erro).includes(TOKEN_FALSO))
  assert(!JSON.stringify(logs).includes(TOKEN_FALSO))
})

Deno.test('ferramenta de busca de contas: o resultado ao Hermes não cita o Actor', async () => {
  const agente: AgenteDoWorkspace = { id: 'ag-scopus', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
  for (const estadoDoActor of ['testing', 'out', 'none']) {
    const banco: BancoDasFerramentas = {
      contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u', permissoes: [] }),
      lerContas: () => Promise.resolve([]),
      pedirDescoberta: () => Promise.resolve({ discoveryRunId: 'b', outcome: 'pedido', creditos: 5, saldo: 100, novasNaCaixa: 0, estadoDoActor }),
      proporEnvio: () => Promise.reject(new Error('n/a')),
    }
    const sessao = criarSessaoDeFerramentas(
      { banco, acesso: { banco: {} as never, ambiente: () => undefined, fetch: fetch }, log: () => {} },
      { runId: 'r1', ctx: { workspaceId: 'ws-1', requestedBy: 'u', permissoes: [] } },
    )
    const r = await sessao.chamar(agente, 'buscar_contas_pelo_icp', { setores: ['Logística'], motivo: 'ICP' })
    semMarca(r, `buscar_contas_pelo_icp (${estadoDoActor})`)
  }
})

Deno.test('o prompt do Hermes proíbe nomear fornecedores e não carrega a marca nem o token', () => {
  const reserva = {
    workspace_name: 'Norte',
    agents: [],
    run_id: 'r',
  } as unknown as Reserva
  const agente: AgenteDoWorkspace = { id: 'a', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
  for (const ferramentas of ['', '### ler_contas_e_sinais\nLê contas.']) {
    const prompt = instrucoesDoAgente(reserva, agente, [], '', ferramentas)
    assert(/nunca nomeie provedores/i.test(prompt), 'o prompt precisa da regra explícita de marca')
    // A própria regra cita as palavras proibidas para proibi-las; tirada a regra, o resto não pode ter a marca.
    const semARegra = prompt.replace(/Regra de marca:[^\n]*/g, '')
    semMarca(semARegra, 'prompt do Hermes')
  }
})
