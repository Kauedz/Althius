import { assertEquals } from 'jsr:@std/assert@1'
import { comCors, origensPermitidas } from './cors.ts'

const handler = comCors(
  'https://app.althius.test, http://localhost:5173/',
  async () => new Response('{}', { status: 201 }),
)

function pedido(method: string, origem: string) {
  return new Request('https://functions.test/x', { method, headers: { Origin: origem } })
}

Deno.test('o preflight do app em localhost libera a origem e o cabeçalho x-client-info do supabase-js', async () => {
  const res = await handler(pedido('OPTIONS', 'http://localhost:5173'))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')
  assertEquals(res.headers.get('Access-Control-Allow-Headers')?.includes('x-client-info'), true)
})

Deno.test('uma origem listada no APP_ORIGIN volta como permitida, com o status do handler preservado', async () => {
  const res = await handler(pedido('POST', 'https://app.althius.test'))
  assertEquals(res.status, 201)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.test')
})

Deno.test('localhost em outra porta também vale para desenvolvimento', async () => {
  const res = await handler(pedido('OPTIONS', 'http://127.0.0.1:4173'))
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4173')
})

Deno.test('uma origem de fora não é devolvida: o navegador bloqueia a resposta', async () => {
  const res = await handler(pedido('OPTIONS', 'https://outro.site'))
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.test')
})

Deno.test('o APP_ORIGIN aceita várias origens, sem barra no fim', () => {
  assertEquals(origensPermitidas(' https://a.test/ ,http://localhost:5173'), [
    'https://a.test',
    'http://localhost:5173',
  ])
})
