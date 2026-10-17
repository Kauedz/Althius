import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoModelo } from './orquestracao.ts'
import { type FilaDoHermes, modeloDoHermes } from './modelo-hermes.ts'

function filaFalsa(respostas: Awaited<ReturnType<FilaDoHermes['ler']>>[]) {
  const enfileirados: { sistema: string; usuario: string; maxTokens: number }[] = []
  const fila: FilaDoHermes = {
    enfileirar: (p) => (enfileirados.push(p), Promise.resolve('pedido-1')),
    ler: () => Promise.resolve(respostas.shift() ?? { status: 'running' }),
  }
  return { fila, enfileirados }
}

const params = {
  max_tokens: 2000,
  system: 'Você é o Rhetor.',
  messages: [{ role: 'user' as const, content: 'Escreva a resposta.' }],
}

Deno.test('o modelo do Hermes enfileira o sistema e o pedido e devolve o texto como a Messages API', async () => {
  const { fila, enfileirados } = filaFalsa([{ status: 'queued' }, { status: 'done', texto: 'Oi!', entrada: 10, saida: 3 }])
  const modelo = modeloDoHermes({ fila, esperar: () => Promise.resolve() })
  const r = await modelo.criar(params)
  assertEquals(enfileirados, [{ sistema: 'Você é o Rhetor.', usuario: 'Escreva a resposta.', maxTokens: 2000 }])
  assertEquals(r.stop_reason, 'end_turn')
  assertEquals(r.content, [{ type: 'text', text: 'Oi!', citations: null }] as unknown as typeof r.content)
  assertEquals([r.usage.input_tokens, r.usage.output_tokens], [10, 3])
  assertEquals(modelo.nome, 'hermes')
})

Deno.test('falha do worker vira model_unreachable (passageira) e o prazo vira model_timeout', async () => {
  const falhou = modeloDoHermes({ fila: filaFalsa([{ status: 'failed' }]).fila, esperar: () => Promise.resolve() })
  const e1 = await assertRejects(() => falhou.criar(params), ErroDoModelo)
  assertEquals(e1.codigo, 'model_unreachable')
  let agora = 0
  const lento = modeloDoHermes({
    fila: filaFalsa([]).fila, prazoMs: 100, esperar: () => (agora += 60, Promise.resolve()), relogio: () => agora,
  })
  const e2 = await assertRejects(() => lento.criar(params), ErroDoModelo)
  assertEquals(e2.codigo, 'model_timeout')
})
