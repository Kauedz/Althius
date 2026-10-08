// O custo real da busca de empresas pelo ICP (creditos-e-planos, ticket 01): cada execução do Actor grava o que o Apify
// informou, com o Workspace e o Actor, só para medir. Gravar o custo nunca muda o resultado da busca. Empresas e CNPJs
// fictícios.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Apify } from '../signal-scan/handler.ts'
import { createHandler, type Db } from './handler.ts'
import { ACTOR_RECEITA } from './normalizar.ts'

const WS = '22222222-2222-4222-8222-222222222222'
const BUSCA = '33333333-3333-4333-8333-333333333333'

// Um item como o do README do johnatan029/cnpj-empresas-brasil-scraper (modo discovery).
const empresa = (cnpj: string, cnae: string) => ({
  cnpj,
  razaoSocial: `EMPRESA ${cnpj} LTDA`,
  situacaoCadastral: 'ATIVA',
  cnaePrincipal: cnae,
  dataAbertura: '2019-03-15',
  endereco: { municipio: 'CAMPINAS', uf: 'SP' },
})

// Duas combinações de CNAE: duas execuções do Actor, cada uma com o seu custo.
const ITENS: Record<string, unknown[]> = {
  '6201501': [empresa('11222333000181', '6201501')],
  '6202300': [empresa('22333444000172', '6202300'), empresa('33444555000163', '6202300')],
}

type Custo = Parameters<Db['gravarCusto']>[0]
type Encerramento = Parameters<Db['encerrar']>[0]

function montar(opcoes: {
  runId?: (cnae: string) => string | null
  custoDaExecucao?: Apify['custoDaExecucao']
  gravarCusto?: Db['gravarCusto']
} = {}) {
  const custos: Custo[] = []
  const encerramentos: Encerramento[] = []
  const gravadas: number[] = []
  const logs: Record<string, unknown>[] = []
  const espera: Promise<unknown>[] = []
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'user-1' }),
    lerIcp: () => Promise.resolve(null),
    actoresDeBusca: () => Promise.resolve([{ actorId: ACTOR_RECEITA, state: 'available', version: 'v1', maxCostUsd: 1 }]),
    iniciar: () => Promise.resolve({ runId: BUSCA, outcome: 'go', state: 'running', actorVersion: 'v1' }),
    gravarCandidatas: (_runId, candidatas) => {
      gravadas.push(candidatas.length)
      return Promise.resolve({ added: candidatas.length, duplicates: 0, ignored: 0 })
    },
    gravarCusto: opcoes.gravarCusto ?? ((args) => (custos.push(args), Promise.resolve())),
    encerrar: (args) => (encerramentos.push(args), Promise.resolve()),
  }
  const custoPadrao: Record<string, number> = { 'apify-6201501': 0.02, 'apify-6202300': 0.03 }
  const apify: Apify = {
    run: ({ input }) => {
      const cnae = (input as { cnae: string }).cnae
      return Promise.resolve({ runId: opcoes.runId ? opcoes.runId(cnae) : `apify-${cnae}`, items: ITENS[cnae] })
    },
    custoDaExecucao: opcoes.custoDaExecucao ?? ((runId) => Promise.resolve(custoPadrao[runId] ?? null)),
  }
  const handler = createHandler({
    db,
    apify,
    appOrigin: 'https://app.althius.test',
    waitUntil: (trabalho) => espera.push(trabalho),
    log: (c) => logs.push(c),
  })
  async function buscar() {
    const resposta = await handler(new Request('http://x/account-discovery', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-de-teste', apikey: 'chave-publica', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search',
        workspaceId: WS,
        criteria: { fonte: 'receita', cnaes: ['6201501', '6202300'] },
        maxResults: 10,
      }),
    }))
    await Promise.all(espera)
    return resposta
  }
  return { buscar, custos, encerramentos, gravadas, logs }
}

Deno.test('cada execução do Actor grava o custo que o Apify informou, com o Workspace, o Actor e os itens', async () => {
  const { buscar, custos, encerramentos } = montar()
  assertEquals((await buscar()).status, 202)
  assertEquals(custos, [
    { workspaceId: WS, actorId: ACTOR_RECEITA, runId: 'apify-6201501', items: 1, costUsd: 0.02 },
    { workspaceId: WS, actorId: ACTOR_RECEITA, runId: 'apify-6202300', items: 2, costUsd: 0.03 },
  ])
  // A busca fecha com a soma das execuções.
  assertEquals(encerramentos.map((e) => [e.success, e.apifyRunId, e.costUsd]), [[true, 'apify-6201501', 0.05]])
})

Deno.test('a execução cujo custo o Apify não informa é gravada em branco, e a busca fecha sem custo total', async () => {
  const { buscar, custos, encerramentos } = montar({
    custoDaExecucao: (runId) => Promise.resolve(runId === 'apify-6201501' ? 0.02 : null),
  })
  await buscar()
  assertEquals(custos.map((c) => c.costUsd), [0.02, null])
  assertEquals(encerramentos.map((e) => e.costUsd), [null])
})

Deno.test('a execução sem id do Apify ganha um id próprio e não consulta o custo', async () => {
  const consultados: string[] = []
  const { buscar, custos } = montar({
    runId: () => null,
    custoDaExecucao: (runId) => (consultados.push(runId), Promise.resolve(1)),
  })
  await buscar()
  assertEquals(consultados, [])
  assertEquals(custos.map((c) => c.costUsd), [null, null])
  assert(custos.every((c) => c.runId.startsWith('account-discovery:')), JSON.stringify(custos))
  assert(custos[0].runId !== custos[1].runId)
})

Deno.test('uma falha ao gravar o custo só vai ao log: as empresas são gravadas e a busca fecha com sucesso', async () => {
  const { buscar, gravadas, encerramentos, logs } = montar({ gravarCusto: () => Promise.reject(new Error('banco fora')) })
  await buscar()
  assertEquals(gravadas, [3])
  assertEquals(encerramentos.map((e) => [e.success, e.costUsd]), [[true, 0.05]])
  assertEquals(logs.filter((l) => l.outcome === 'cost_failed').length, 2)
})
