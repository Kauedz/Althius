import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoSlack, postarNoThread, TENTATIVAS_DE_POSTAR } from './slack-api.ts'

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function slackEmSequencia(respostas: (() => Response)[]) {
  let i = 0
  const esperas: number[] = []
  const fetchFalso = (() => {
    const r = respostas[Math.min(i, respostas.length - 1)]
    i++
    return Promise.resolve(r())
  }) as typeof fetch
  return {
    fetch: fetchFalso,
    esperar: (ms: number) => {
      esperas.push(ms)
      return Promise.resolve()
    },
    esperas,
    chamadas: () => i,
  }
}

const postar = (s: ReturnType<typeof slackEmSequencia>) =>
  postarNoThread({ token: 'xoxb-1', canal: 'C1', threadTs: '1.1', texto: 'x', fetch: s.fetch, esperar: s.esperar })

Deno.test('um 429 do Slack espera o Retry-After e tenta de novo', async () => {
  const s = slackEmSequencia([() => json({ ok: false, error: 'ratelimited' }, 429, { 'Retry-After': '2' }), () => json({ ok: true })])
  await postar(s)
  assertEquals([s.chamadas(), s.esperas], [2, [2000]])
})

Deno.test('um 5xx é tentado de novo com espera crescente, até o limite de tentativas', async () => {
  const s = slackEmSequencia([() => new Response('', { status: 503 })])
  const erro = await assertRejects(() => postar(s), ErroDoSlack)
  assertEquals(erro.tipo, 'indisponivel')
  assertEquals([s.chamadas(), s.esperas], [TENTATIVAS_DE_POSTAR, [1000, 2000]])
})

Deno.test('um Retry-After longo demais não é esperado: o erro sobe na hora', async () => {
  const s = slackEmSequencia([() => json({ ok: false }, 429, { 'Retry-After': '60' }), () => json({ ok: true })])
  const erro = await assertRejects(() => postar(s), ErroDoSlack)
  assertEquals([erro.codigo, erro.esperarSegundos, s.chamadas(), s.esperas], ['429', 60, 1, []])
})

Deno.test('uma recusa do Slack (ok: false) não é repetida', async () => {
  const s = slackEmSequencia([() => json({ ok: false, error: 'channel_not_found' }), () => json({ ok: true })])
  const erro = await assertRejects(() => postar(s), ErroDoSlack)
  assertEquals([erro.tipo, s.chamadas()], ['recusado', 1])
})
