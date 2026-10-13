// O caminho `hermes` dos passos de IA dos Sinais: o passo enfileira o pedido, o worker do Hermes (que já tem a OpenAI) o
// responde, e a Edge Function lê a resposta. A fila é falsa aqui: nunca há banco nem rede.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { type FilaDeIa, filaDeIaPorRpc, llmDoHermes } from './llm-hermes.ts'

const PRECO = { entradaPorMilhao: 0.4, saidaPorMilhao: 1.6 }
const WS = '11111111-1111-4111-8111-111111111111'

/** Uma fila que responde depois de `leiturasAteResponder` leituras. */
function filaFalsa(
  resposta: { status: 'done' | 'failed'; texto?: string; entrada?: number; saida?: number; erro?: string } | 'nunca',
  leiturasAteResponder = 2,
) {
  const pedidos: { workspaceId: string; sistema: string; usuario: string; maxTokens: number }[] = []
  let leituras = 0
  const fila: FilaDeIa = {
    enfileirar: (p) => (pedidos.push(p), Promise.resolve('req-1')),
    ler: () => {
      leituras++
      if (resposta === 'nunca' || leituras < leiturasAteResponder) return Promise.resolve({ status: 'queued' as const })
      return Promise.resolve({ ...resposta })
    },
  }
  return { fila, pedidos, leituras: () => leituras }
}

const semEspera = { esperar: () => Promise.resolve(), intervaloMs: 0 }

Deno.test('enfileira o pedido com o Workspace e lê a resposta quando o worker a grava, com o custo pelos tokens', async () => {
  const { fila, pedidos, leituras } = filaFalsa({ status: 'done', texto: '{"empresas":["Acme"]}', entrada: 1000, saida: 50 }, 3)
  const r = await llmDoHermes({ fila, preco: PRECO, prazoMs: 5_000, ...semEspera }).json({
    sistema: 'Extraia empresas.', usuario: 'Acme pede RJ.', maxTokens: 400, workspaceId: WS,
  })
  assertEquals(r.json, { empresas: ['Acme'] })
  // 1000 × 0,4 + 50 × 1,6 = 480 → US$ 0,00048
  assertEquals(r.custoUsd, 0.00048)
  assertEquals(pedidos, [{ workspaceId: WS, sistema: 'Extraia empresas.', usuario: 'Acme pede RJ.', maxTokens: 400 }])
  assertEquals(leituras(), 3)
})

Deno.test('sem o worker responder no prazo, falha com mensagem neutra (o passo cai na regra)', async () => {
  const { fila } = filaFalsa('nunca')
  let agora = 0
  const erro = await assertRejects(
    () => llmDoHermes({ fila, preco: PRECO, prazoMs: 100, intervaloMs: 40, esperar: () => (agora += 40, Promise.resolve()), relogio: () => agora }).json({ sistema: 's', usuario: 'u', workspaceId: WS }),
    Error,
  )
  assert(/a tempo/i.test(erro.message))
})

Deno.test('o pedido que o worker marca como falho, a resposta sem JSON e a fila fora do ar falham sem vazar nada', async () => {
  const falho = filaFalsa({ status: 'failed', erro: 'o motor respondeu 401 com a chave sk-SEGREDO' }, 1)
  const e1 = await assertRejects(() => llmDoHermes({ fila: falho.fila, preco: PRECO, prazoMs: 1_000, ...semEspera }).json({ sistema: 's', usuario: 'u', workspaceId: WS }), Error)
  assert(!e1.message.includes('sk-SEGREDO'))
  const semJson = filaFalsa({ status: 'done', texto: 'não sei' }, 1)
  await assertRejects(() => llmDoHermes({ fila: semJson.fila, preco: PRECO, prazoMs: 1_000, ...semEspera }).json({ sistema: 's', usuario: 'u', workspaceId: WS }), Error, 'JSON válido')
  const fora: FilaDeIa = { enfileirar: () => Promise.reject(new Error('rpc: 42501 sem permissão')), ler: () => Promise.reject(new Error('x')) }
  await assertRejects(() => llmDoHermes({ fila: fora, preco: PRECO, prazoMs: 1_000, ...semEspera }).json({ sistema: 's', usuario: 'u', workspaceId: WS }), Error)
})

Deno.test('sem Workspace no pedido o caminho hermes recusa (a fila é por Workspace)', async () => {
  const { fila, pedidos } = filaFalsa({ status: 'done', texto: '{}' }, 1)
  await assertRejects(() => llmDoHermes({ fila, preco: PRECO, prazoMs: 1_000, ...semEspera }).json({ sistema: 's', usuario: 'u' }), Error)
  assertEquals(pedidos.length, 0)
})

Deno.test('a fila por RPC chama as funções do banco com os parâmetros certos e traduz as linhas', async () => {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = []
  const admin = {
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args })
      if (nome === 'enqueue_signal_llm_request') return Promise.resolve({ data: 'req-9', error: null })
      return Promise.resolve({ data: [{ status: 'done', result_text: '{"a":1}', input_tokens: 10, output_tokens: 2, error: null }], error: null })
    },
  }
  const fila = filaDeIaPorRpc(admin)
  assertEquals(await fila.enfileirar({ workspaceId: WS, sistema: 's', usuario: 'u', maxTokens: 100 }), 'req-9')
  assertEquals(await fila.ler('req-9'), { status: 'done', texto: '{"a":1}', entrada: 10, saida: 2, erro: null })
  assertEquals(chamadas.map((c) => c.nome), ['enqueue_signal_llm_request', 'get_signal_llm_request'])
  assertEquals(chamadas[0].args, { p_workspace_id: WS, p_system: 's', p_user: 'u', p_max_tokens: 100 })
  assertEquals(chamadas[1].args, { p_id: 'req-9' })
  const quebrada = { rpc: () => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }) }
  await assertRejects(() => filaDeIaPorRpc(quebrada).ler('x'), Error, '42501')
})
