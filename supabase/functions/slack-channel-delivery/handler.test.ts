// A entrega no thread (slack-canal 03): o banco chama com o id da Execução do Canal e o segredo interno; a função reserva
// a entrega uma vez só e posta a resposta no thread do fio, com o token do bot. Falha é falha, nunca resposta inventada.
import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Entrega, RESPOSTAS } from './handler.ts'

const SEGREDO = 'segredo-interno-da-entrega'
const RUN = '7e000000-0000-4000-8000-000000000001'
const URL_DA_FUNCAO = 'https://proj.supabase.co/functions/v1/slack-channel-delivery'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const SUCESSO: Entrega = {
  status: 'succeeded',
  codigoDoErro: null,
  resposta: 'A Alfa e a Beta estão quentes.',
  canal: 'C0GERAL',
  threadTs: '1700000000.000100',
  token: 'xoxb-norte',
}

function montar(entregas: (Entrega | null)[] = [SUCESSO], slack: () => Response = () => json({ ok: true, ts: '1.3' })) {
  const c = {
    reservas: [] as string[],
    postagens: [] as { canal: string; thread_ts: string; text: string; token: string }[],
    logs: [] as Record<string, unknown>[],
  }
  const fila = [...entregas]
  const handler = createHandler({
    db: {
      reservarEntrega: (runId) => {
        c.reservas.push(runId)
        return Promise.resolve(fila.length ? fila.shift()! : null)
      },
    },
    segredoInterno: SEGREDO,
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
      const req = new Request(entrada, init)
      const corpo = await req.json()
      c.postagens.push({
        canal: corpo.channel,
        thread_ts: corpo.thread_ts,
        text: corpo.text,
        token: (req.headers.get('Authorization') ?? '').replace('Bearer ', ''),
      })
      return slack()
    }) as typeof fetch,
    log: (campos) => c.logs.push(campos),
  })
  return { c, handler }
}

const pedido = (corpo: unknown, segredo: string | null = SEGREDO, metodo = 'POST') =>
  new Request(URL_DA_FUNCAO, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(segredo === null ? {} : { 'x-slack-delivery-secret': segredo }) },
    body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
  })

Deno.test('a resposta de sucesso vai no thread do fio, com o token do bot', async () => {
  const m = montar()
  const resposta = await m.handler(pedido({ run_id: RUN }))
  assertEquals(resposta.status, 200)
  assertEquals(m.c.reservas, [RUN])
  assertEquals(m.c.postagens, [{ canal: 'C0GERAL', thread_ts: '1700000000.000100', text: SUCESSO.resposta!, token: 'xoxb-norte' }])
})

Deno.test('a entrega é uma vez só: já reservada, nada é postado', async () => {
  const m = montar([SUCESSO, null])
  await m.handler(pedido({ run_id: RUN }))
  const segunda = await m.handler(pedido({ run_id: RUN }))
  assertEquals(segunda.status, 200)
  assertEquals(m.c.postagens.length, 1)
})

Deno.test('a Execução que falhou é postada como falha, nunca como resposta', async () => {
  const m = montar([{ ...SUCESSO, status: 'failed', codigoDoErro: 'model_error', resposta: 'meia resposta' }])
  await m.handler(pedido({ run_id: RUN }))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.falha])
})

Deno.test('Canal retirado: nada é postado, e a entrega fica marcada', async () => {
  const m = montar([{ ...SUCESSO, token: null }])
  const resposta = await m.handler(pedido({ run_id: RUN }))
  assertEquals(resposta.status, 200)
  assertEquals(m.c.reservas, [RUN])
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.logs.map((l) => l.resultado), ['canal_retirado'])
})

Deno.test('sem o segredo interno certo, recusa sem tocar o banco', async () => {
  const m = montar()
  assertEquals((await m.handler(pedido({ run_id: RUN }, null))).status, 401)
  assertEquals((await m.handler(pedido({ run_id: RUN }, 'outro-segredo'))).status, 401)
  assertEquals((await m.handler(pedido({ run_id: RUN }, ''))).status, 401)
  assertEquals(m.c.reservas, [])
})

Deno.test('sem o segredo configurado na função, nada passa', async () => {
  const m = montar()
  const semSegredo = createHandler({ db: { reservarEntrega: () => Promise.resolve(SUCESSO) }, segredoInterno: '', log: () => {} })
  assertEquals((await semSegredo(pedido({ run_id: RUN }, ''))).status, 401)
  assertEquals(m.c.postagens, [])
})

Deno.test('só POST, com o id da Execução', async () => {
  const m = montar()
  assertEquals((await m.handler(pedido(null, SEGREDO, 'GET'))).status, 405)
  assertEquals((await m.handler(pedido({ run_id: 'nao-e-uuid' }))).status, 400)
  assertEquals((await m.handler(pedido({}))).status, 400)
  assertEquals(m.c.reservas, [])
})

Deno.test('uma falha ao postar fica no log, sem tentar de novo', async () => {
  const m = montar([SUCESSO], () => json({ ok: false, error: 'channel_not_found' }))
  const resposta = await m.handler(pedido({ run_id: RUN }))
  assertEquals(resposta.status, 502)
  assertEquals(m.c.logs.map((l) => [l.resultado, l.erro]), [['falha_ao_postar', 'Slack: recusado (channel_not_found)']])
})

Deno.test('o log não traz a resposta nem o token', async () => {
  const m = montar()
  await m.handler(pedido({ run_id: RUN }))
  const tudo = JSON.stringify(m.c.logs)
  assertEquals(tudo.includes('Alfa'), false)
  assertEquals(tudo.includes('xoxb'), false)
})
