import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoModelo } from './orquestracao.ts'
import {
  type FilaDoHermes,
  filaDaPropostaPorRpc,
  MAX_CARACTERES_DO_SISTEMA_NA_FILA,
  modeloDoHermes,
} from './modelo-hermes.ts'

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

Deno.test('o sistema grande demais para a fila não é enfileirado e não é falha passageira', async () => {
  const { fila, enfileirados } = filaFalsa([])
  const modelo = modeloDoHermes({ fila, esperar: () => Promise.resolve() })
  const e = await assertRejects(
    () => modelo.criar({ ...params, system: 'x'.repeat(MAX_CARACTERES_DO_SISTEMA_NA_FILA + 1) }),
    ErroDoModelo,
  )
  assertEquals(e.codigo, 'model_invalid_request')
  assertEquals(enfileirados, [])
})

Deno.test('a recusa da fila por dado inválido não é passageira; a fila cheia e o resto são', async () => {
  for (
    const [code, codigo] of [
      ['23514', 'model_invalid_request'],
      ['22023', 'model_invalid_request'],
      ['53400', 'model_rate_limited'],
      ['PGRST301', 'model_unreachable'],
      [undefined, 'model_unreachable'],
    ] as const
  ) {
    const fila: FilaDoHermes = {
      enfileirar: () => Promise.reject(Object.assign(new Error('recusado'), { code })),
      ler: () => Promise.resolve({ status: 'running' }),
    }
    const e = await assertRejects(() => modeloDoHermes({ fila }).criar(params), ErroDoModelo)
    assertEquals(e.codigo, codigo, `code ${code}`)
  }
})

Deno.test('a fila pela Proposta repassa o código do banco quando o enfileiramento falha', async () => {
  const admin = {
    rpc: () => Promise.resolve({ data: null, error: { code: '23514', message: 'violates check constraint' } }),
  }
  const fila = filaDaPropostaPorRpc(admin, { job_id: 'job-1', claim_token: 'token-1' })
  const e = await assertRejects(() => fila.enfileirar({ sistema: 's', usuario: 'u', maxTokens: 10 }))
  assertEquals((e as { code?: string }).code, '23514')
  const modelo = modeloDoHermes({ fila })
  const e2 = await assertRejects(() => modelo.criar(params), ErroDoModelo)
  assertEquals(e2.codigo, 'model_invalid_request')
})
