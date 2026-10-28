import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoAgente, type FilaDoModelo, modeloPelaFila } from './modelo.ts'

function fila(respostas: Array<{ status: 'queued' | 'running' | 'done' | 'failed'; texto: string | null }>): FilaDoModelo & { pedidos: unknown[] } {
  const pedidos: unknown[] = []
  return {
    pedidos,
    enfileirar: (p) => { pedidos.push(p); return Promise.resolve('pedido-1') },
    ler: () => Promise.resolve(respostas.shift() ?? { status: 'running', texto: null }),
  }
}

Deno.test('o modelo enfileira e devolve o texto quando o Hermes responde', async () => {
  const f = fila([{ status: 'queued', texto: null }, { status: 'done', texto: '{"resposta":"oi","chamadas":[]}' }])
  const m = modeloPelaFila({ fila: f, esperar: () => Promise.resolve() })
  assertEquals(await m.responder('sistema', 'pedido'), '{"resposta":"oi","chamadas":[]}')
  assertEquals((f.pedidos[0] as { maxTokens: number }).maxTokens, 2000)
})

Deno.test('o pedido que o worker falha vira model_unreachable', async () => {
  const m = modeloPelaFila({ fila: fila([{ status: 'failed', texto: null }]), esperar: () => Promise.resolve() })
  const e = await assertRejects(() => m.responder('s', 'p'), ErroDoAgente)
  assertEquals(e.code, 'model_unreachable')
})

Deno.test('o prazo vira model_timeout', async () => {
  let t = 0
  const m = modeloPelaFila({ fila: fila([]), prazoMs: 10, esperar: () => { t += 20; return Promise.resolve() }, relogio: () => t })
  const e = await assertRejects(() => m.responder('s', 'p'), ErroDoAgente)
  assertEquals(e.code, 'model_timeout')
})

Deno.test('a fila cheia vira model_rate_limited', async () => {
  const m = modeloPelaFila({
    fila: { enfileirar: () => Promise.reject(Object.assign(new Error('x'), { code: '53400' })), ler: () => Promise.reject(new Error()) },
  })
  const e = await assertRejects(() => m.responder('s', 'p'), ErroDoAgente)
  assertEquals(e.code, 'model_rate_limited')
})
