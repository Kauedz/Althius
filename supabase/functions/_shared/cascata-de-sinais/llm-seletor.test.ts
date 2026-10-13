// A escolha do modelo dos passos de IA dos Sinais por `SIGNALS_LLM_PROVIDER` (`hermes`, `openai` ou `regra`). O padrão nunca
// é um fornecedor: sem configuração, ou com configuração incompleta ou desconhecida, vale a regra de palavra-chave
// (o seletor devolve `undefined`). A Anthropic não é uma opção, mesmo com a chave antiga ainda cadastrada.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { escolherLlmDosSinais } from './llm-seletor.ts'

const admin = { rpc: () => Promise.resolve({ data: null, error: null }) }

function ambiente(valores: Record<string, string | undefined>) {
  return (nome: string) => valores[nome]
}

function escolher(valores: Record<string, string | undefined>, fetchFn?: typeof fetch) {
  const logs: Record<string, unknown>[] = []
  const llm = escolherLlmDosSinais({ env: ambiente(valores), admin, fetchFn, log: (c) => logs.push(c) })
  return { llm, logs }
}

Deno.test('sem configuração (ou com "regra"), não há modelo: os passos usam a regra de palavra-chave', () => {
  assertEquals(escolher({}).llm, undefined)
  assertEquals(escolher({ SIGNALS_LLM_PROVIDER: 'regra' }).llm, undefined)
  assertEquals(escolher({ SIGNALS_LLM_PROVIDER: '  REGRA ' }).llm, undefined)
})

Deno.test('a chave antiga da Anthropic não liga modelo nenhum, e "anthropic" não é provedor', () => {
  assertEquals(escolher({ ANTHROPIC_API_KEY: 'sk-ant-antiga' }).llm, undefined)
  const { llm, logs } = escolher({ SIGNALS_LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-antiga' })
  assertEquals(llm, undefined)
  assertEquals(logs[0].outcome, 'provedor_desconhecido')
  assert(!JSON.stringify(logs).includes('sk-ant-antiga'))
})

Deno.test('openai sem chave ou sem modelo cai na regra, avisando no log só o que falta', () => {
  for (const faltando of [{ SIGNALS_LLM_PROVIDER: 'openai', OPENAI_MODEL: 'm' }, { SIGNALS_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x' }]) {
    const { llm, logs } = escolher(faltando)
    assertEquals(llm, undefined)
    assertEquals(logs[0].outcome, 'configuracao_incompleta')
    assert(!JSON.stringify(logs).includes('sk-x'))
  }
})

Deno.test('openai com chave e modelo monta o adaptador da OpenAI, com os preços e o prazo do ambiente', async () => {
  let visto: { url: string; modelo: unknown; autorizacao: string | null } | null = null
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    visto = { url: String(url), modelo: JSON.parse(String(init?.body)).model, autorizacao: new Headers(init?.headers).get('authorization') }
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }), { status: 200 }))
  }) as typeof fetch
  const { llm } = escolher({
    SIGNALS_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-proj-x', OPENAI_MODEL: 'modelo-x',
    SIGNALS_LLM_PRICE_INPUT_PER_MILLION: '0.5', SIGNALS_LLM_PRICE_OUTPUT_PER_MILLION: '2',
  }, fetchFn)
  assert(llm)
  const r = await llm.json({ sistema: 's', usuario: 'u' })
  assertEquals(r, { json: { ok: true }, custoUsd: 0.5 })
  assertEquals(visto, { url: 'https://api.openai.com/v1/chat/completions', modelo: 'modelo-x', autorizacao: 'Bearer sk-proj-x' })
})

Deno.test('hermes monta o adaptador da fila (sem chave de fornecedor na função) e entrega o Workspace ao enfileirar', async () => {
  const chamadas: string[] = []
  const adminFalso = {
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push(`${nome}:${args.p_workspace_id ?? args.p_id}`)
      if (nome === 'enqueue_signal_llm_request') return Promise.resolve({ data: 'req-1', error: null })
      return Promise.resolve({ data: [{ status: 'done', result_text: '{"a":1}', input_tokens: 0, output_tokens: 0, error: null }], error: null })
    },
  }
  const llm = escolherLlmDosSinais({ env: ambiente({ SIGNALS_LLM_PROVIDER: 'hermes' }), admin: adminFalso, log: () => {} })
  assert(llm)
  const r = await llm.json({ sistema: 's', usuario: 'u', workspaceId: 'ws-1' })
  assertEquals(r.json, { a: 1 })
  assertEquals(chamadas, ['enqueue_signal_llm_request:ws-1', 'get_signal_llm_request:req-1'])
})

Deno.test('preço e prazo inválidos no ambiente não viram NaN: valem os padrões', () => {
  const { llm } = escolher({
    SIGNALS_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-proj-x', OPENAI_MODEL: 'm',
    SIGNALS_LLM_PRICE_INPUT_PER_MILLION: 'caro', SIGNALS_LLM_PRICE_OUTPUT_PER_MILLION: '-3', SIGNALS_LLM_TIMEOUT_MS: 'rápido',
  })
  assert(llm)
})
