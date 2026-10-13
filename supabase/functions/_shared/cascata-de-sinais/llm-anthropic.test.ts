import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { jsonDoTexto, llmDaAnthropic } from './llm-anthropic.ts'

const CHAVE = 'sk-ant-SEGREDO-DE-TESTE-0123456789'

Deno.test('chama a Messages API com a chave no cabeçalho, o modelo barato e esforço baixo, e calcula o custo pelos tokens', async () => {
  let visto: { url: string; cabecalhos: Headers; corpo: Record<string, unknown> } | null = null
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    visto = { url: String(url), cabecalhos: new Headers(init?.headers), corpo: JSON.parse(String(init?.body)) }
    return Promise.resolve(new Response(JSON.stringify({
      content: [{ type: 'text', text: '```json\n{"empresas":["Acme"]}\n```' }],
      usage: { input_tokens: 2000, output_tokens: 100 },
    }), { status: 200 }))
  }) as typeof fetch
  const r = await llmDaAnthropic({ apiKey: CHAVE, fetchFn }).json({ sistema: 'Extraia empresas.', usuario: 'Acme pede recuperação judicial.' })
  assertEquals(r.json, { empresas: ['Acme'] })
  // 2000 × 0,10 + 100 × 0,50 = 250 → US$ 0,00025
  assertEquals(r.custoUsd, 0.00025)
  assertEquals(visto!.url, 'https://api.anthropic.com/v1/messages')
  assertEquals(visto!.cabecalhos.get('x-api-key'), CHAVE)
  assertEquals(visto!.cabecalhos.get('anthropic-version'), '2023-06-01')
  assertEquals([visto!.corpo.model, visto!.corpo.output_config], ['claude-haiku-5-5', { effort: 'low' }])
  assertEquals(visto!.corpo.system, 'Extraia empresas.')
})

Deno.test('a falha não leva a chave nem o corpo da resposta', async () => {
  const ruim = (() => Promise.resolve(new Response(`{"error":"invalid x-api-key ${CHAVE}"}`, { status: 401 }))) as typeof fetch
  const erro = await assertRejects(() => llmDaAnthropic({ apiKey: CHAVE, fetchFn: ruim }).json({ sistema: 's', usuario: 'u' }), Error)
  assert(!erro.message.includes(CHAVE) && erro.message.includes('401'))
  const semJson = (() => Promise.resolve(new Response(JSON.stringify({ content: [{ type: 'text', text: 'não sei' }], usage: {} }), { status: 200 }))) as typeof fetch
  await assertRejects(() => llmDaAnthropic({ apiKey: CHAVE, fetchFn: semJson }).json({ sistema: 's', usuario: 'u' }), Error, 'JSON válido')
})

Deno.test('jsonDoTexto aceita a resposta pura ou cercada', () => {
  assertEquals(jsonDoTexto('{"a":1}'), { a: 1 })
  assertEquals(jsonDoTexto('```\n[1,2]\n```'), [1, 2])
})
