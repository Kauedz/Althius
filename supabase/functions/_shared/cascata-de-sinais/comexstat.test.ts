import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { clienteComexStat, dolares, fimDoMes, mesMais, ncmComPontos } from './comexstat.ts'
import { FonteAdiada } from './fonte-publica.ts'

Deno.test('o cliente espaça as requisições em 12 s e manda o corpo no formato da API', async () => {
  const esperas: number[] = []
  const vistos: { url: string; metodo: string; corpo?: unknown }[] = []
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    vistos.push({ url: String(url), metodo: init?.method ?? 'GET', corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
    const corpo = String(url).endsWith('/updated')
      ? { data: { updated: '2026-10-06', year: '2026', monthNumber: '09' } }
      : { data: { list: [{ coNcm: '84799999', year: '2026', ncm: 'x', metricFOB: '1200000', metricKG: '10' }] } }
    return Promise.resolve(new Response(JSON.stringify(corpo)))
  }) as typeof fetch
  const c = clienteComexStat({ fetchFn, dormir: (ms) => (esperas.push(ms), Promise.resolve()) })
  assertEquals(await c.ultimoMes(), { ano: 2026, mes: 9 })
  const linhas = await c.geral({ fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09', filtros: [{ filter: 'chapter', values: [84, 85] }], detalhes: ['ncm'] })
  assertEquals(linhas[0].coNcm, '84799999')
  assertEquals(esperas, [12_000])
  assertEquals(vistos[1], {
    url: 'https://api-comexstat.mdic.gov.br/general', metodo: 'POST',
    corpo: { flow: 'import', monthDetail: false, period: { from: '2026-07', to: '2026-09' }, filters: [{ filter: 'chapter', values: [84, 85] }], details: ['ncm'], metrics: ['metricFOB', 'metricKG'] },
  })
})

Deno.test('429 espera pelo menos 10 s e faz até 3 novas tentativas', async () => {
  const esperas: number[] = []
  let n = 0
  const fetchFn = (() => {
    n++
    if (n < 4) return Promise.resolve(new Response(JSON.stringify({ message: 'tente novamente em 10 segundos' }), { status: 429 }))
    return Promise.resolve(new Response(JSON.stringify({ data: { list: [{ coNcm: '84799999', metricFOB: '1', metricKG: '1' }] } })))
  }) as typeof fetch
  const c = clienteComexStat({ fetchFn, dormir: (ms) => (esperas.push(ms), Promise.resolve()) })
  const linhas = await c.geral({ fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09', filtros: [], detalhes: ['ncm'] })
  assertEquals(linhas[0].coNcm, '84799999')
  assertEquals(n, 4, 'uma chamada e três novas tentativas')
  assertEquals(esperas.length, 3)
  assert(esperas.every((ms) => ms >= 10_000), JSON.stringify(esperas))
})

Deno.test('a cópia do mês dispensa a consulta à rede', async () => {
  let chamadas = 0
  const fetchFn = (() => {
    chamadas++
    return Promise.resolve(new Response('nope', { status: 500 }))
  }) as typeof fetch
  const copias = new Map<string, unknown>([
    ['dates/updated|2026-10', { data: { updated: '2026-10-06', year: '2026', monthNumber: '09' } }],
  ])
  const c = clienteComexStat({
    fetchFn,
    relogio: () => Date.parse('2026-10-13T12:00:00Z'),
    cache: {
      ler: (chave, mes) => Promise.resolve(copias.get(`${chave}|${mes ?? ''}`) ?? null),
      gravar: () => Promise.resolve(),
    },
  })
  assertEquals(await c.ultimoMes(), { ano: 2026, mes: 9 })
  assertEquals(chamadas, 0)
})

Deno.test('429 espera 10 s, depois 20 s e depois 40 s', async () => {
  const esperas: number[] = []
  let n = 0
  const fetchFn = (() => {
    n++
    if (n < 4) return Promise.resolve(new Response('limite', { status: 429 }))
    return Promise.resolve(new Response(JSON.stringify({ data: { list: [{ coNcm: '84799999', metricFOB: '1', metricKG: '1' }] } })))
  }) as typeof fetch
  const c = clienteComexStat({ fetchFn, dormir: (ms) => (esperas.push(ms), Promise.resolve()) })
  const linhas = await c.geral({ fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09', filtros: [], detalhes: ['ncm'] })
  assertEquals(linhas[0].coNcm, '84799999')
  assertEquals(esperas, [10_000, 20_000, 40_000])
})

Deno.test('429 que não cede adia a consulta, sem tratar como fonte fora', async () => {
  const fetchFn = (() => Promise.resolve(new Response('limite', { status: 429 }))) as typeof fetch
  const c = clienteComexStat({ fetchFn, dormir: () => Promise.resolve() })
  const erro = await assertRejects(
    () => c.geral({ fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09', filtros: [], detalhes: ['ncm'] }),
    FonteAdiada,
  )
  assertEquals(erro.status, 429)
})

Deno.test('não espera a próxima tentativa quando ela passaria do prazo', async () => {
  const t0 = Date.parse('2026-10-13T12:00:00Z')
  const esperas: number[] = []
  let n = 0
  const fetchFn = (() => {
    n++
    return Promise.resolve(new Response('limite', { status: 429 }))
  }) as typeof fetch
  const c = clienteComexStat({
    fetchFn,
    dormir: (ms) => (esperas.push(ms), Promise.resolve()),
    relogio: () => t0,
    prazoFinal: t0 + 20_000,
  })
  await assertRejects(
    () => c.geral({ fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09', filtros: [], detalhes: ['ncm'] }),
    FonteAdiada,
  )
  assertEquals(esperas, [10_000])
  assertEquals(n, 2)
})

Deno.test('a consulta geral reusa a cópia do mês publicado e não chama a rede', async () => {
  let chamadas = 0
  const fetchFn = (() => {
    chamadas++
    return Promise.resolve(new Response('nope', { status: 500 }))
  }) as typeof fetch
  const chave = JSON.stringify({
    fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09',
    filtros: [{ filter: 'chapter', values: [84, 85] }], detalhes: ['ncm'], metricas: ['metricFOB', 'metricKG'],
  })
  const copias = new Map<string, unknown>([
    ['dates/updated|2026-10', { data: { year: '2026', monthNumber: '09' } }],
    [`${chave}|2026-09`, { data: { list: [{ coNcm: '84799999', metricFOB: '1', metricKG: '1' }] } }],
  ])
  const c = clienteComexStat({
    fetchFn,
    relogio: () => Date.parse('2026-10-13T12:00:00Z'),
    cache: {
      ler: (chaveDaConsulta, mes) => Promise.resolve(copias.get(`${chaveDaConsulta}|${mes ?? ''}`) ?? null),
      gravar: () => Promise.resolve(),
    },
  })
  await c.ultimoMes()
  const linhas = await c.geral({
    fluxo: 'import', porMes: false, de: '2026-07', ate: '2026-09',
    filtros: [{ filter: 'chapter', values: [84, 85] }], detalhes: ['ncm'],
  })
  assertEquals(linhas[0].coNcm, '84799999')
  assertEquals(chamadas, 0)
})

Deno.test('sem o último mês ou com a API fora, falha sem texto da API', async () => {
  const semMes = (() => Promise.resolve(new Response(JSON.stringify({ data: {} })))) as typeof fetch
  await assertRejects(() => clienteComexStat({ fetchFn: semMes, dormir: () => Promise.resolve() }).ultimoMes(), Error, 'último mês')
})

Deno.test('datas e formatos', () => {
  assertEquals(mesMais(2026, 9, -3), '2026-06')
  assertEquals(mesMais(2026, 2, -14), '2024-12')
  assertEquals(mesMais(2026, 11, 3), '2027-02')
  assertEquals(fimDoMes(2026, 9), '2026-09-30T12:00:00.000Z')
  assertEquals(ncmComPontos('84799999'), '8479.99.99')
  assertEquals([dolares(1_200_000), dolares(3_400_000_000), dolares(850_000), dolares(120)], ['US$ 1,2 mi', 'US$ 3,4 bi', 'US$ 850 mil', 'US$ 120'])
})
