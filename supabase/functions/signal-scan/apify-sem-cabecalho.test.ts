import { assertEquals } from 'jsr:@std/assert@1'
import { clienteDoApify } from './apify.ts'

// Na execução real de 30/09/2026 o endpoint síncrono do Apify não devolveu o cabeçalho `x-apify-run-id`, e o custo ficou
// em branco. Sem o cabeçalho, o id vem da última execução do actor na mesma conta, se ela começou depois da chamada.

const ACTOR = 'curious_coder~linkedin-jobs-scraper'

function cliente(ultima: () => Response) {
  const vistos: string[] = []
  const fetchFn = ((url: string, init?: RequestInit) => {
    vistos.push(`${url.replace('https://api.apify.com/v2', '')} ${(init?.headers as Record<string, string>).Authorization}`)
    if (url.endsWith('/runs/last')) return Promise.resolve(ultima())
    if (url.includes('/actor-runs/')) return Promise.resolve(Response.json({ data: { usageTotalUsd: 0.1 } }))
    return Promise.resolve(Response.json([{ id: 'vaga-1' }]))
  }) as unknown as typeof fetch
  return { apify: clienteDoApify({ tokens: ['conta-a'], fetchFn }), vistos }
}

const rodar = (apify: ReturnType<typeof clienteDoApify>) =>
  apify.run({ actorId: ACTOR, input: {}, maxItems: 50, maxTotalChargeUsd: 0.15 })

Deno.test('sem o cabeçalho, o id vem da última execução do actor na mesma conta, e o custo é lido nela', async () => {
  const { apify, vistos } = cliente(() => Response.json({ data: { id: 'run-real', startedAt: new Date().toISOString() } }))
  const exec = await rodar(apify)
  assertEquals(exec, { runId: 'run-real', items: [{ id: 'vaga-1' }] })
  assertEquals(await apify.custoDaExecucao!('run-real'), 0.1)
  assertEquals(vistos.slice(1), [`/acts/${ACTOR}/runs/last Bearer conta-a`, '/actor-runs/run-real Bearer conta-a'])
})

Deno.test('a última execução de antes da chamada não é esta: sem id, os itens seguem', async () => {
  const antiga = new Date(Date.now() - 5 * 60_000).toISOString()
  const { apify } = cliente(() => Response.json({ data: { id: 'run-de-outra-hora', startedAt: antiga } }))
  assertEquals(await rodar(apify), { runId: null, items: [{ id: 'vaga-1' }] })
})

Deno.test('se não der para ler a última execução, os itens seguem sem id', async () => {
  for (const resposta of [() => new Response('x', { status: 404 }), () => new Response('não é json'), () => Response.json({ data: {} })]) {
    const { apify } = cliente(resposta)
    assertEquals(await rodar(apify), { runId: null, items: [{ id: 'vaga-1' }] })
  }
})
