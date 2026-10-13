import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { clienteComexStat, dolares, fimDoMes, mesMais, ncmComPontos } from './comexstat.ts'

Deno.test('o cliente espaça as requisições em 10 s e manda o corpo no formato da API', async () => {
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
  assertEquals(esperas, [10_000])
  assertEquals(vistos[1], {
    url: 'https://api-comexstat.mdic.gov.br/general', metodo: 'POST',
    corpo: { flow: 'import', monthDetail: false, period: { from: '2026-07', to: '2026-09' }, filters: [{ filter: 'chapter', values: [84, 85] }], details: ['ncm'], metrics: ['metricFOB', 'metricKG'] },
  })
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
