import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { corpoDoGroq, mensagemDoGroq, modeloDoGroq } from './model-groq.ts'
import { ErroDoModelo } from './runner.ts'

const BUSCAR = {
  name: 'buscar_contas_alvo',
  description: 'Busca Contas-alvo.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: { termo: { type: 'string' } },
    required: ['termo'],
    additionalProperties: false,
  },
}

Deno.test('o pedido vira o formato do chat: system, ferramenta, chamada e resultado', () => {
  const corpo = corpoDoGroq('llama-teste', {
    max_tokens: 16000,
    system: 'Você é o Scopus.',
    tools: [BUSCAR],
    output_config: { effort: 'medium' },
    messages: [
      { role: 'user', content: 'Quais Contas?' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'buscar_contas_alvo', input: { termo: 'Alfa' } }],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: '[{"name":"Alfa"}]' },
          { type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'A consulta falhou.' },
        ],
      },
    ],
  })
  assertEquals(corpo, {
    model: 'llama-teste',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: 'Você é o Scopus.' },
      { role: 'user', content: 'Quais Contas?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 't1',
          type: 'function',
          function: { name: 'buscar_contas_alvo', arguments: '{"termo":"Alfa"}' },
        }],
      },
      { role: 'tool', tool_call_id: 't1', content: '[{"name":"Alfa"}]' },
      { role: 'tool', tool_call_id: 't2', content: 'ERRO: A consulta falhou.' },
    ],
    tools: [{
      type: 'function',
      function: { name: 'buscar_contas_alvo', description: 'Busca Contas-alvo.', parameters: BUSCAR.input_schema },
    }],
  })
})

Deno.test('a saída estruturada vira modo JSON, com o schema no system', () => {
  const schema = { type: 'object', properties: { agentes: { type: 'array' } } }
  const corpo = corpoDoGroq('llama-teste', {
    max_tokens: 100,
    system: 'Coordenação.',
    messages: [{ role: 'user', content: 'Oi' }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  }) as { messages: { content: string }[]; response_format: unknown; max_tokens: number }
  assertEquals(corpo.response_format, { type: 'json_object' })
  assertEquals(corpo.max_tokens, 100)
  assertEquals(
    corpo.messages[0].content,
    `Coordenação.\n\nResponda só com um objeto JSON que siga este JSON Schema:\n${JSON.stringify(schema)}`,
  )
})

Deno.test('a resposta volta no formato que o executor lê', () => {
  assertEquals(mensagemDoGroq({ choices: [{ finish_reason: 'stop', message: { content: 'Olá.' } }] }), {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Olá.' }],
  } as never)
  assertEquals(
    mensagemDoGroq({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'buscar_contas_alvo', arguments: '{"termo":"Alfa"}' } },
            { id: 'c2', type: 'function', function: { name: 'buscar_contas_alvo', arguments: 'não é json' } },
          ],
        },
      }],
    }),
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'c1', name: 'buscar_contas_alvo', input: { termo: 'Alfa' } },
        { type: 'tool_use', id: 'c2', name: 'buscar_contas_alvo', input: {} },
      ],
    } as never,
  )
  assertEquals(
    mensagemDoGroq({ choices: [{ finish_reason: 'length', message: { content: 'pela met' } }] }).stop_reason,
    'max_tokens',
  )
})

Deno.test('chama o Groq com a chave e traduz os erros', async () => {
  const pedidos: Request[] = []
  const responder = (status: number, corpo: unknown = {}) => (entrada: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push(new Request(entrada, init))
    return Promise.resolve(new Response(JSON.stringify(corpo), { status }))
  }
  const ok = modeloDoGroq({
    apiKey: 'gsk_teste',
    modelo: 'llama-teste',
    fetch: responder(200, { choices: [{ finish_reason: 'stop', message: { content: 'Oi.' } }] }),
  })
  assertEquals(ok.nome, 'groq/llama-teste')
  assertEquals(
    (await ok.criar({ max_tokens: 10, messages: [{ role: 'user', content: 'Oi' }] })).content,
    [{ type: 'text', text: 'Oi.' }] as never,
  )
  assertEquals(pedidos[0].url, 'https://api.groq.com/openai/v1/chat/completions')
  assertEquals(pedidos[0].headers.get('Authorization'), 'Bearer gsk_teste')

  for (const [status, codigo] of [[401, 'model_auth'], [429, 'model_rate_limited'], [500, 'model_http_500']] as const) {
    const modelo = modeloDoGroq({ apiKey: 'x', modelo: 'm', fetch: responder(status) })
    const erro = await assertRejects(
      () => modelo.criar({ max_tokens: 10, messages: [{ role: 'user', content: 'Oi' }] }),
      ErroDoModelo,
    )
    assertEquals(erro.codigo, codigo)
  }
  const semRede = modeloDoGroq({ apiKey: 'x', modelo: 'm', fetch: () => Promise.reject(new TypeError('rede')) })
  const erro = await assertRejects(
    () => semRede.criar({ max_tokens: 10, messages: [{ role: 'user', content: 'Oi' }] }),
    ErroDoModelo,
  )
  assertEquals(erro.codigo, 'model_unreachable')
})

Deno.test('no limite de uso, espera o que o Groq pediu e tenta uma vez; o motivo vai para o log', async () => {
  const esperas: number[] = []
  let chamadas = 0
  const limite = () =>
    new Response(JSON.stringify({ error: { message: 'Rate limit reached for tokens per minute' } }), {
      status: 429,
      headers: { 'retry-after': '3' },
    })
  const depois = modeloDoGroq({
    apiKey: 'x',
    modelo: 'm',
    esperar: (ms) => (esperas.push(ms), Promise.resolve()),
    fetch: () => {
      chamadas++
      return Promise.resolve(
        chamadas === 1
          ? limite()
          : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Oi.' } }] })),
      )
    },
  })
  assertEquals(
    (await depois.criar({ max_tokens: 10, messages: [{ role: 'user', content: 'Oi' }] })).stop_reason,
    'end_turn',
  )
  assertEquals([chamadas, esperas], [2, [3000]])

  const sempre = modeloDoGroq({
    apiKey: 'x',
    modelo: 'm',
    esperar: () => Promise.resolve(),
    fetch: () => Promise.resolve(limite()),
  })
  const erro = await assertRejects(
    () => sempre.criar({ max_tokens: 10, messages: [{ role: 'user', content: 'Oi' }] }),
    ErroDoModelo,
  )
  assertEquals([erro.codigo, erro.message], [
    'model_rate_limited',
    'model_rate_limited: Rate limit reached for tokens per minute',
  ])
})
