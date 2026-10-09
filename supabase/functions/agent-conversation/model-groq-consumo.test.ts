// O consumo de cada chamada pelo Groq: a API de chat informa `prompt_tokens` e `completion_tokens`, e o executor lê o
// mesmo `usage` da Messages API. Sem isso, record_agent_run_cost soma zero tokens nas Execuções com o Groq.
import { assertEquals } from 'jsr:@std/assert@1'
import { modeloDoGroq } from './model-groq.ts'
import { usoDe } from './runner.ts'

Deno.test('o consumo que o Groq informa chega ao executor, para os créditos', async () => {
  const modelo = modeloDoGroq({
    apiKey: 'x',
    modelo: 'm',
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: 'Oi.' } }],
          usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
        })),
      ),
  })
  const resposta = await modelo.criar({ max_tokens: 10, messages: [{ role: 'user', content: 'Oi' }] })
  assertEquals(usoDe(resposta), { entrada: 120, saida: 30 })
})
