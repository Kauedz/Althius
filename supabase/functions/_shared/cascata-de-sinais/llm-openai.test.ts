// O adaptador da OpenAI (plano B dos passos de IA dos Sinais): API de chat por `fetch`, JSON garantido pelo modo JSON, custo
// pelos tokens e pelos preços configurados. O modelo é sempre falso aqui: nunca há rede.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { llmDaOpenai } from './llm-openai.ts'

const CHAVE = 'sk-proj-SEGREDO-DE-TESTE-0123456789'
const PRECO = { entradaPorMilhao: 0.4, saidaPorMilhao: 1.6 }

function respostaDoModelo(texto: string, uso: { prompt_tokens?: number; completion_tokens?: number } = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { content: texto } }], usage: uso }), { status: 200 })
}

Deno.test('chama a API de chat com a chave no cabeçalho, o modelo configurado e o modo JSON, e calcula o custo pelos tokens', async () => {
  let visto: { url: string; cabecalhos: Headers; corpo: Record<string, unknown> } | null = null
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    visto = { url: String(url), cabecalhos: new Headers(init?.headers), corpo: JSON.parse(String(init?.body)) }
    return Promise.resolve(respostaDoModelo('```json\n{"empresas":["Acme"]}\n```', { prompt_tokens: 2000, completion_tokens: 100 }))
  }) as typeof fetch
  const r = await llmDaOpenai({ apiKey: CHAVE, modelo: 'modelo-de-teste', preco: PRECO, fetchFn }).json({
    sistema: 'Extraia empresas.', usuario: 'Acme pede recuperação judicial.', maxTokens: 300,
  })
  assertEquals(r.json, { empresas: ['Acme'] })
  // 2000 × 0,4 + 100 × 1,6 = 960 → US$ 0,00096
  assertEquals(r.custoUsd, 0.00096)
  assertEquals(visto!.url, 'https://api.openai.com/v1/chat/completions')
  assertEquals(visto!.cabecalhos.get('authorization'), `Bearer ${CHAVE}`)
  const corpo = visto!.corpo as { model: string; response_format: unknown; max_completion_tokens: number; messages: { role: string; content: string }[] }
  assertEquals([corpo.model, corpo.response_format, corpo.max_completion_tokens], ['modelo-de-teste', { type: 'json_object' }, 300])
  assertEquals(corpo.messages.map((m) => m.role), ['system', 'user'])
  // O modo JSON da API exige a palavra "JSON" nas mensagens: o adaptador a garante.
  assert(/json/i.test(corpo.messages[0].content) && corpo.messages[0].content.startsWith('Extraia empresas.'))
  assertEquals(corpo.messages[1].content, 'Acme pede recuperação judicial.')
})

Deno.test('a falha não leva a chave, o corpo da resposta nem o nome do fornecedor para o erro', async () => {
  const ruim = (() => Promise.resolve(new Response(`{"error":{"message":"Incorrect API key provided: ${CHAVE}"}}`, { status: 401 }))) as typeof fetch
  const erro = await assertRejects(() => llmDaOpenai({ apiKey: CHAVE, modelo: 'm', preco: PRECO, fetchFn: ruim }).json({ sistema: 's', usuario: 'u' }), Error)
  assert(!erro.message.includes(CHAVE) && erro.message.includes('401'))
  assert(!/openai/i.test(erro.message))
  const semJson = (() => Promise.resolve(respostaDoModelo('não sei'))) as typeof fetch
  await assertRejects(() => llmDaOpenai({ apiKey: CHAVE, modelo: 'm', preco: PRECO, fetchFn: semJson }).json({ sistema: 's', usuario: 'u' }), Error, 'JSON válido')
  const vazia = (() => Promise.resolve(new Response(JSON.stringify({ choices: [] }), { status: 200 }))) as typeof fetch
  await assertRejects(() => llmDaOpenai({ apiKey: CHAVE, modelo: 'm', preco: PRECO, fetchFn: vazia }).json({ sistema: 's', usuario: 'u' }), Error)
})

Deno.test('estourar o tempo aborta a chamada e falha com mensagem neutra (o passo cai na regra)', async () => {
  const lenta = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, rejeitar) => {
      init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('aborted', 'AbortError')))
    })) as typeof fetch
  const erro = await assertRejects(
    () => llmDaOpenai({ apiKey: CHAVE, modelo: 'm', preco: PRECO, prazoMs: 20, fetchFn: lenta }).json({ sistema: 's', usuario: 'u' }),
    Error,
  )
  assert(/a tempo/i.test(erro.message) && !erro.message.includes(CHAVE))
})

Deno.test('sem o uso na resposta, o custo é zero em vez de inventado', async () => {
  const semUso = (() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }), { status: 200 }))) as typeof fetch
  const r = await llmDaOpenai({ apiKey: CHAVE, modelo: 'm', preco: PRECO, fetchFn: semUso }).json({ sistema: 's', usuario: 'u' })
  assertEquals([r.json, r.custoUsd], [{ a: 1 }, 0])
})
