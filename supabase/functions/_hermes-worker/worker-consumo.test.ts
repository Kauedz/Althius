// O consumo de cada chamada ao Hermes: o GET /v1/runs/{id} de um run concluído traz `usage` (input_tokens e
// output_tokens), e o worker grava esse uso no evento, como a ponte, para record_agent_run_cost somar. O Hermes é dublê
// só na fronteira HTTP, com o corpo que a documentação da API de runs mostra.
import { assertEquals } from 'jsr:@std/assert@1'
import type { BancoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import type { AgenteDoWorkspace, Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { createWorker, type FilaDb, hermesHttp } from './worker.ts'

const SCOPUS: AgenteDoWorkspace = {
  id: 'a-scopus',
  name: 'Scopus',
  specialty: 'scopus',
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
}
const RESERVA: Reserva = {
  run_id: 'r1',
  kind: 'coordenada',
  workspace_name: 'Norte',
  request_text: 'Quais contas estão quentes?',
  agent_id: null,
  mentions: [],
  agents: [SCOPUS],
  history: [],
}

/** O que o Hermes responde em cada passo, pela Idempotency-Key, e quanto cada run gastou. */
const RUNS: Record<string, { output: string; input_tokens: number; output_tokens: number }> = {
  'althius-r1-escolha': {
    output: '{"agentes":["a-scopus"],"resposta_direta":""}',
    input_tokens: 40,
    output_tokens: 10,
  },
  'althius-r1-a-scopus-r1': {
    output: '{"ferramenta": "ler_contas_e_sinais", "entrada": {"so_quentes": true}}',
    input_tokens: 300,
    output_tokens: 20,
  },
  'althius-r1-a-scopus-r1-f1': {
    output: 'A Acme está quente: abriu vaga.\nSTATUS: pronto',
    input_tokens: 450,
    output_tokens: 60,
  },
  'althius-r1-sintese': { output: 'A Acme está quente, segundo o Scopus.', input_tokens: 200, output_tokens: 50 },
}

/** O servidor de API do Hermes: o run_id é a própria Idempotency-Key, e cada run já termina concluído. */
function servidorDoHermes(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const pedido = new Request(entrada, init)
  const caminho = new URL(pedido.url).pathname
  if (caminho === '/health') return Promise.resolve(new Response('ok'))
  if (caminho === '/v1/runs') {
    const runId = pedido.headers.get('Idempotency-Key')!
    return Promise.resolve(new Response(JSON.stringify({ run_id: runId, status: 'started' }), { status: 202 }))
  }
  const runId = decodeURIComponent(caminho.replace('/v1/runs/', ''))
  const { output, input_tokens, output_tokens } = RUNS[runId]
  return Promise.resolve(
    new Response(JSON.stringify({
      object: 'hermes.run',
      run_id: runId,
      status: 'completed',
      model: 'hermes-agent',
      output,
      usage: {
        input_tokens,
        output_tokens,
        total_tokens: input_tokens + output_tokens,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      },
    })),
  )
}

Deno.test('o consumo de cada chamada ao Hermes fica no evento, o do Agente e o da Coordenação', async () => {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(RESERVA),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
  }
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u-1', permissoes: [] }),
    lerContas: () => Promise.resolve([{ id: 'c1', nome: 'Acme', sinais: [{ frase: 'Abriu vaga' }] }]),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
  }
  const worker = createWorker({
    db,
    hermes: hermesHttp({
      url: 'http://127.0.0.1:8642',
      chave: 'k',
      fetch: servidorDoHermes,
      esperar: () => Promise.resolve(),
    }),
    log: () => {},
    porAgente: true,
    ferramentas: { banco, log: () => {} },
  })

  assertEquals(await worker.rodada(), 1)
  assertEquals(eventos.map((e) => `${e.kind}:${e.agentId ?? '-'}`), [
    'chamada:a-scopus',
    'ferramenta:a-scopus',
    'feito:a-scopus',
    'resposta:-',
  ])
  // O Scopus chamou o Hermes duas vezes (o pedido da ferramenta e a resposta): 300 + 450 de entrada, 20 + 60 de saída.
  assertEquals(eventos[2].payload, { texto: 'A Acme está quente: abriu vaga.', uso: { entrada: 750, saida: 80 } })
  // A Coordenação escolheu (40 e 10) e juntou (200 e 50).
  assertEquals(eventos[3].payload, { texto: 'A Acme está quente, segundo o Scopus.', uso: { entrada: 240, saida: 60 } })
})
