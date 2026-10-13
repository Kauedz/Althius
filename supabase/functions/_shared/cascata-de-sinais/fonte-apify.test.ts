// O cliente assíncrono do Apify: o run id vem da resposta do POST (nunca de /runs/last), o rodízio de contas só gira por
// falta de crédito ou de limite, e o custo real vem do run. Tudo contra um Apify falso: nunca a rede.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { clienteAssincronoDoApify } from './fonte-apify.ts'
import { apifyFalso } from './falso-apify.ts'
import { ErroDaFonte } from './tipos.ts'
import { MARCA_INTERNA } from '../marca.ts'

const TOKEN_1 = 'apify_api_PRIMEIRO_SEGREDO_0123456789'
const TOKEN_2 = 'apify_api_SEGUNDO_SEGREDO_0123456789'
const ARGS = { actorId: 'curious_coder~linkedin-jobs-scraper', input: { urls: [] }, maxItems: 50, maxTotalChargeUsd: 0.2, timeoutSegundos: 60 }
const SEM_ESPERA = { dormir: () => Promise.resolve(), esperaDoCustoMs: 0 }

function cliente(fake: ReturnType<typeof apifyFalso>, tokens = [TOKEN_1, TOKEN_2], extra: Record<string, unknown> = {}) {
  const logs: unknown[] = []
  return { logs, c: clienteAssincronoDoApify({ tokens, fetchFn: fake.fetchFn, log: (x) => logs.push(x), ...SEM_ESPERA, ...extra }) }
}

Deno.test('o run id vem da resposta do POST e o custo, do run; /runs/last nunca é chamado', async () => {
  const fake = apifyFalso({ [TOKEN_1]: { itens: [{ a: 1 }, { a: 2 }], usageTotalUsd: 0.0042, build: '1.7.18' } })
  const { c } = cliente(fake)
  const r = await c.rodar(ARGS)
  assertEquals(r.apifyRunId, 'run-1')
  assertEquals(r.items.length, 2)
  assertEquals(r.custoUsd, 0.0042)
  assertEquals(r.tokenIndex, 0)
  assertEquals(r.build, '1.7.18')
  assert(!fake.requisicoes.some((q) => q.caminho.endsWith('/runs/last')), 'não usa /runs/last')
  const post = fake.requisicoes.find((q) => q.metodo === 'POST')!
  assertEquals(post.consulta.get('maxTotalChargeUsd'), '0.2')
  assertEquals(post.consulta.get('maxItems'), '50')
  assertEquals(post.consulta.get('timeout'), '60')
  assertEquals(post.corpo, { urls: [] })
})

Deno.test('sem crédito (402) na primeira conta: segue para APIFY_TOKEN_2 e repete o passo', async () => {
  const fake = apifyFalso({
    [TOKEN_1]: { inicio: { status: 402, corpo: { error: { type: 'x402-payment-required', message: 'Insufficient credit' } } } },
    [TOKEN_2]: { itens: [{ ok: true }], usageTotalUsd: 0.01 },
  })
  const { c } = cliente(fake)
  const r = await c.rodar(ARGS)
  assertEquals(r.tokenIndex, 1)
  assertEquals(r.items, [{ ok: true }])
  assertEquals(fake.requisicoes.filter((q) => q.metodo === 'POST').map((q) => q.token), [TOKEN_1, TOKEN_2])
})

Deno.test('a conta sem crédito é pulada nas chamadas seguintes (até a janela de espera passar)', async () => {
  let agora = 1_000_000
  const fake = apifyFalso({
    [TOKEN_1]: { inicio: { status: 402, corpo: {} } },
    [TOKEN_2]: { itens: [], usageTotalUsd: 0 },
  })
  const { c } = cliente(fake, [TOKEN_1, TOKEN_2], { agora: () => agora })
  await c.rodar(ARGS)
  await c.rodar(ARGS)
  assertEquals(fake.requisicoes.filter((q) => q.metodo === 'POST').map((q) => q.token), [TOKEN_1, TOKEN_2, TOKEN_2])
  agora += 31 * 60 * 1000
  await c.rodar(ARGS)
  assertEquals(fake.requisicoes.filter((q) => q.metodo === 'POST').slice(-2).map((q) => q.token), [TOKEN_1, TOKEN_2], 'passada a janela, a primeira volta a ser tentada')
})

Deno.test('todas as contas sem crédito: falha amigável, com o erro real guardado e sem o token', async () => {
  const fake = apifyFalso({
    [TOKEN_1]: { inicio: { status: 402, corpo: { error: { type: 'x402-payment-required', message: `Insufficient credit for ${TOKEN_1}` } } } },
    [TOKEN_2]: { inicio: { status: 402, corpo: { error: { type: 'x402-payment-required', message: 'Insufficient credit' } } } },
  })
  const { c, logs } = cliente(fake)
  const erro = await assertRejects(() => c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals(erro.tipo, 'sem_credito_em_todas')
  assert(!MARCA_INTERNA.test(erro.message), `a mensagem amigável não cita a marca: ${erro.message}`)
  assertEquals(erro.detalhe.statusHttp, 402)
  assert(erro.detalhe.erroReal?.includes('Insufficient credit'), 'o erro real fica guardado')
  const tudo = JSON.stringify([erro.message, erro.detalhe, logs])
  assert(!tudo.includes(TOKEN_1) && !tudo.includes(TOKEN_2), 'nenhum token em erro ou log')
})

Deno.test('403 de recurso desligado ou limite de uso gira a conta; 403 de permissão e 5xx não', async () => {
  const limite = apifyFalso({
    [TOKEN_1]: { inicio: { status: 403, corpo: { error: { type: 'platform-feature-disabled', message: 'Monthly usage limit reached' } } } },
    [TOKEN_2]: { itens: [{ ok: 1 }], usageTotalUsd: 0 },
  })
  assertEquals((await cliente(limite).c.rodar(ARGS)).tokenIndex, 1)

  const permissao = apifyFalso({
    [TOKEN_1]: { inicio: { status: 403, corpo: { error: { type: 'insufficient-permissions', message: 'No access to this Actor' } } } },
    [TOKEN_2]: { itens: [] },
  })
  const e403 = await assertRejects(() => cliente(permissao).c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals([e403.tipo, e403.detalhe.statusHttp], ['http', 403])
  assertEquals(permissao.requisicoes.filter((q) => q.metodo === 'POST').length, 1, 'não girou a conta')

  const caiu = apifyFalso({ [TOKEN_1]: { inicio: { status: 500, corpo: { error: { message: 'boom' } } } }, [TOKEN_2]: { itens: [] } })
  const e500 = await assertRejects(() => cliente(caiu).c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals([e500.tipo, e500.detalhe.statusHttp], ['http', 500])
  assertEquals(caiu.requisicoes.filter((q) => q.metodo === 'POST').length, 1)
})

Deno.test('429 não gira a conta por padrão', async () => {
  const fake = apifyFalso({ [TOKEN_1]: { inicio: { status: 429, corpo: { error: { type: 'rate-limit-exceeded', message: 'slow down' } } } }, [TOKEN_2]: { itens: [] } })
  const erro = await assertRejects(() => cliente(fake).c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals(erro.detalhe.statusHttp, 429)
  assertEquals(fake.requisicoes.filter((q) => q.metodo === 'POST').length, 1)
})

Deno.test('prazo: o run que não termina é abortado e o erro leva o run id', async () => {
  let agora = 0
  const fake = apifyFalso({ [TOKEN_1]: { estados: ['RUNNING'], usageTotalUsd: 0.003 } })
  const { c } = cliente(fake, [TOKEN_1], {
    agora: () => agora,
    // Cada leitura do estado gasta 30 s do relógio falso.
    dormir: () => {
      agora += 30_000
      return Promise.resolve()
    },
    esperaPorRodadaMs: 30_000,
  })
  const erro = await assertRejects(() => c.rodar({ ...ARGS, timeoutSegundos: 60 }), ErroDaFonte) as ErroDaFonte
  assertEquals(erro.tipo, 'timeout')
  assertEquals(erro.detalhe.apifyRunId, 'run-1')
  assert(fake.requisicoes.some((q) => q.caminho.endsWith('/abort')), 'o run é abortado')
  assert(!MARCA_INTERNA.test(erro.message))
})

Deno.test('run que falha: erro real do actor guardado, com o run id', async () => {
  const fake = apifyFalso({ [TOKEN_1]: { estados: ['FAILED'], mensagem: 'Input is not valid: urls', usageTotalUsd: 0 } })
  const erro = await assertRejects(() => cliente(fake).c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals(erro.tipo, 'run_falhou')
  assertEquals(erro.detalhe.apifyRunId, 'run-1')
  assert(erro.detalhe.erroReal?.includes('Input is not valid'))
})

Deno.test('resultado que não é uma lista é falha, não "sem itens"', async () => {
  const fake = apifyFalso({ [TOKEN_1]: { itens: { error: 'x' }, usageTotalUsd: 0.001 } })
  const erro = await assertRejects(() => cliente(fake).c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals(erro.tipo, 'nao_e_lista')
  assertEquals(erro.detalhe.apifyRunId, 'run-1')
})

Deno.test('o custo por evento é lido de novo até estabilizar (o Apify fecha a conta depois)', async () => {
  const fake = apifyFalso({
    [TOKEN_1]: { itens: [{ a: 1 }], pricingModel: 'PAY_PER_EVENT', chargedEventCounts: { 'apify-default-dataset-item': 1 }, usagePorLeitura: [0, 0.004, 0.004] },
  })
  const { c } = cliente(fake, [TOKEN_1], { esperaDoCustoMs: 1, releiturasDoCusto: 3 })
  assertEquals((await c.rodar(ARGS)).custoUsd, 0.004)
})

Deno.test('erro de rede vira falha da fonte, sem o token', async () => {
  const c = clienteAssincronoDoApify({
    tokens: [TOKEN_1],
    fetchFn: (() => Promise.reject(new TypeError(`connection reset ${TOKEN_1}`))) as typeof fetch,
    log: () => {},
    ...SEM_ESPERA,
  })
  const erro = await assertRejects(() => c.rodar(ARGS), ErroDaFonte) as ErroDaFonte
  assertEquals(erro.tipo, 'rede')
  assert(!JSON.stringify([erro.message, erro.detalhe]).includes(TOKEN_1))
})
