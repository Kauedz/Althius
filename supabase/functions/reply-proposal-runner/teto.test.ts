// O teto das Propostas de resposta (creditos-e-planos, ticket 03): a primeira geração é automática e só roda quando
// Execuções de Agentes e o Rhetor estão em automático, com teto. Barrada, a proposta falha com o motivo, sem chamar o
// modelo nem reservar crédito, e o titular gera pelo clique. A geração que falha depois de passar devolve o teto.
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
type Teto = Awaited<ReturnType<NonNullable<RunnerDb['consumirTeto']>>>

const RESPOSTA = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Olá, Maria!' }] } as unknown as Resposta

function montar(teto: Teto, saida: Resposta | Error = RESPOSTA) {
  const chamadasAoModelo: string[] = []
  const rodadas: string[] = []
  const salvos: string[] = []
  const falhas: { codigo: string; passageira: boolean }[] = []
  const devolvidos: string[] = []
  const espera: Promise<unknown>[] = []
  const db: RunnerDb = {
    tokenMatches: async (token) => token === TOKEN,
    claim: async () => [TRABALHO],
    context: async () => CONTEXTO,
    chaveDoCliente: async () => null,
    consumirTeto: async () => teto,
    devolverTeto: async (job) => {
      devolvidos.push(job.job_id)
    },
    abrirCredito: async (job) => {
      rodadas.push(job.job_id)
      return { outcome: 'go', reservation_id: 'reserva-1' }
    },
    fecharCredito: async () => {},
    salvar: async (job) => {
      salvos.push(job.job_id)
    },
    falhar: async (_job, codigo, passageira) => {
      falhas.push({ codigo, passageira })
    },
  }
  const modelo: Modelo = {
    nome: 'claude-teste',
    criar: () => {
      chamadasAoModelo.push('chamou')
      return saida instanceof Error ? Promise.reject(saida) : Promise.resolve(saida)
    },
  }
  const handler = createHandler({ db, modelo, waitUntil: (t) => espera.push(t), log: () => {} })
  async function chamar() {
    await handler(new Request('http://f/', { method: 'POST', headers: { 'x-runner-token': TOKEN }, body: '{}' }))
    await Promise.all(espera)
  }
  return { chamar, chamadasAoModelo, rodadas, salvos, falhas, devolvidos }
}

Deno.test('a proposta que o teto barra não chama o modelo nem reserva crédito, e falha com o motivo', async () => {
  const casos = [
    ['confirmar', 'automation_confirm'],
    ['sem_teto', 'automation_no_cap'],
    ['teto_atingido', 'automation_cap_reached'],
  ] as const
  for (const [teto, codigo] of casos) {
    const { chamar, chamadasAoModelo, rodadas, salvos, falhas } = montar(teto)
    await chamar()
    assertEquals(chamadasAoModelo, [], teto)
    assertEquals(rodadas, [], teto)
    assertEquals(salvos, [], teto)
    // Não é passageira: a proposta para e espera o clique do titular, em vez de tentar sozinha de novo.
    assertEquals(falhas, [{ codigo, passageira: false }], teto)
  }
})

Deno.test('com o teto liberado, a proposta é gerada e o teto fica somado', async () => {
  const { chamar, chamadasAoModelo, salvos, devolvidos } = montar('ok')
  await chamar()
  assertEquals(chamadasAoModelo, ['chamou'])
  assertEquals(salvos, ['job-1'])
  assertEquals(devolvidos, [])
})

Deno.test('a geração que passou pelo teto e falhou devolve o que somou', async () => {
  const { chamar, falhas, devolvidos } = montar('ok', new ErroDoModelo('model_timeout'))
  await chamar()
  assertEquals(falhas, [{ codigo: 'model_timeout', passageira: true }])
  assertEquals(devolvidos, ['job-1'])
})
