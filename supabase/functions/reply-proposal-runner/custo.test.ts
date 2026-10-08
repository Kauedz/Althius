// O custo real das Propostas de resposta (creditos-e-planos, ticket 01): cada chamada ao modelo grava o modelo e os
// tokens que ele informou, só para medir. Gravar o custo nunca muda o destino da proposta.
import { assertEquals } from 'jsr:@std/assert@1'
import { ErroDoModelo, type Modelo } from '../agent-conversation/runner.ts'
import { type ContextoDaResposta, createHandler, type RunnerDb, type TrabalhoReservado } from './handler.ts'

const TOKEN = 'a'.repeat(64)
const TRABALHO: TrabalhoReservado = { job_id: 'job-1', proposal_id: 'prop-1', claim_token: 'token-1', attempt: 1 }

const CONTEXTO: ContextoDaResposta = {
  workspace: 'Norte',
  channel: 'email',
  subject: 'Re: Apresentação',
  seller: 'Ana Vendas',
  account: { name: 'Empresa Alvo', domain: 'empresa-alvo.test', segment: null },
  contact: { name: 'Maria Souza', role: null },
  recipient_name: null,
  messages: [{ direction: 'recebida', at: null, text: 'Pode mandar o preço?' }],
  playbook: [],
  agent: {},
}

type Resposta = Awaited<ReturnType<Modelo['criar']>>

function resposta(texto: string, uso?: { input_tokens: number; output_tokens: number }, stop_reason = 'end_turn'): Resposta {
  return { stop_reason, content: [{ type: 'text', text: texto }], ...(uso ? { usage: uso } : {}) } as unknown as Resposta
}

function montar(saida: Resposta | Error, opcoes: { custoFalha?: Error } = {}) {
  const custos: { job: string; modelo: string; entrada: number | null; saida: number | null }[] = []
  const salvos: string[] = []
  const falhas: string[] = []
  const creditos: { reserva: string; concluida: boolean }[] = []
  const logs: Record<string, unknown>[] = []
  const espera: Promise<unknown>[] = []
  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claim: async () => [TRABALHO],
    context: async () => CONTEXTO,
    chaveDoCliente: async () => null,
    abrirCredito: async () => ({ outcome: 'go', reservation_id: 'reserva-1' }),
    fecharCredito: async (reserva, concluida) => {
      creditos.push({ reserva, concluida })
    },
    salvar: async (job) => {
      salvos.push(job.job_id)
    },
    falhar: async (_job, codigo) => {
      falhas.push(codigo)
    },
    custo: async (job, gasto) => {
      if (opcoes.custoFalha) throw opcoes.custoFalha
      custos.push({ job: job.job_id, ...gasto })
    },
  }
  const modelo: Modelo = {
    nome: 'claude-teste',
    criar: () => (saida instanceof Error ? Promise.reject(saida) : Promise.resolve(saida)),
  }
  const handler = createHandler({ db, modelo, waitUntil: (t) => espera.push(t), log: (c) => logs.push(c) })
  async function chamar() {
    await handler(new Request('http://f/', { method: 'POST', headers: { 'x-runner-token': TOKEN }, body: '{}' }))
    await Promise.all(espera)
  }
  return { chamar, custos, salvos, falhas, creditos, logs }
}

Deno.test('a geração grava o modelo e os tokens que ele informou', async () => {
  const { chamar, custos, salvos } = montar(resposta('Olá, Maria!', { input_tokens: 1200, output_tokens: 300 }))
  await chamar()
  assertEquals(custos, [{ job: 'job-1', modelo: 'claude-teste', entrada: 1200, saida: 300 }])
  assertEquals(salvos, ['job-1'])
})

Deno.test('uma falha ao gravar o custo só vai ao log: a proposta é salva e o crédito, debitado', async () => {
  const { chamar, salvos, falhas, creditos, logs } = montar(
    resposta('Olá, Maria!', { input_tokens: 10, output_tokens: 5 }),
    { custoFalha: new Error('banco fora') },
  )
  await chamar()
  assertEquals(salvos, ['job-1'])
  assertEquals(falhas, [])
  assertEquals(creditos, [{ reserva: 'reserva-1', concluida: true }])
  assertEquals(logs.find((l) => l.outcome === 'cost_failed')?.jobId, 'job-1')
})

Deno.test('uma recusa ou um corte por tamanho também gastaram: o custo é gravado e a proposta falha', async () => {
  for (const [stop, codigo] of [['refusal', 'model_refusal'], ['max_tokens', 'model_incomplete']] as const) {
    const { chamar, custos, salvos, falhas } = montar(resposta('Não posso.', { input_tokens: 900, output_tokens: 2000 }, stop))
    await chamar()
    assertEquals(custos, [{ job: 'job-1', modelo: 'claude-teste', entrada: 900, saida: 2000 }], stop)
    assertEquals(salvos, [], stop)
    assertEquals(falhas, [codigo], stop)
  }
})

Deno.test('sem o uso informado, o custo leva o modelo e deixa os tokens em branco', async () => {
  const { chamar, custos } = montar(resposta('Olá, Maria!'))
  await chamar()
  assertEquals(custos, [{ job: 'job-1', modelo: 'claude-teste', entrada: null, saida: null }])
})

Deno.test('o modelo que não respondeu não deixa custo', async () => {
  const { chamar, custos, falhas } = montar(new ErroDoModelo('model_timeout'))
  await chamar()
  assertEquals(custos, [])
  assertEquals(falhas, ['model_timeout'])
})
