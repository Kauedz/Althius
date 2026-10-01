// As ferramentas dos Agentes pelo Hermes (Etapa 5b): a API de runs do Hermes não recebe ferramentas nossas, então a
// ponte é aqui. O Agente pede uma ferramenta respondendo só um JSON {"ferramenta", "entrada"}; o worker executa pelo
// catálogo compartilhado, grava o passo e chama o Hermes de novo com o resultado. Hermes, banco e ferramentas são dublês.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import type { BancoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'
import type { AgenteDoWorkspace, Reserva, TipoDeEvento } from '../_shared/orquestracao.ts'
import { type CorpoDoRun, createWorker, type FilaDb, type FimDoHermes, type Hermes } from './worker.ts'

const SCOPUS: AgenteDoWorkspace = { id: 'a-scopus', name: 'Scopus', specialty: 'scopus', kind: 'padrao', instructions: '', voice_tone: '' }
const RESERVA: Reserva = {
  run_id: 'r1',
  kind: 'agente',
  workspace_name: 'Norte',
  request_text: 'Quais contas estão quentes?',
  agent_id: SCOPUS.id,
  mentions: [],
  agents: [SCOPUS],
  history: [],
}

type Chamada = { corpo: CorpoDoRun; chave: string }

function montar(saidas: string[], opcoes: { semFerramentas?: boolean } = {}) {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const chamadas: Chamada[] = []
  const leituras: string[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve(RESERVA),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode) => (fechamentos.push({ status, errorCode }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
  }
  const fila = [...saidas]
  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: (corpo, chave) => (chamadas.push({ corpo, chave }), Promise.resolve(`h${chamadas.length}`)),
    aguardar: (): Promise<FimDoHermes> => Promise.resolve({ status: 'completed', output: fila.shift() ?? '' }),
  }
  const banco: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: 'ws-1', requestedBy: 'u-1', permissoes: [] }),
    lerContas: (_r, a) => (leituras.push(String(a.soQuentes)), Promise.resolve([{ id: 'c1', nome: 'Acme', sinais: [{ frase: 'Abriu vaga' }] }])),
    pedirDescoberta: () => Promise.reject(new Error('não usado')),
    proporEnvio: () => Promise.reject(new Error('não usado')),
  }
  const worker = createWorker({
    db,
    hermes,
    log: () => {},
    porAgente: true,
    ...(opcoes.semFerramentas ? {} : { ferramentas: { banco, log: () => {} } }),
  })
  return { worker, eventos, fechamentos, chamadas, leituras }
}

Deno.test('o Agente pede uma ferramenta em JSON, o worker executa, grava o passo e devolve o resultado ao Hermes', async () => {
  const m = montar([
    '```json\n{"ferramenta": "ler_contas_e_sinais", "entrada": {"so_quentes": true}}\n```',
    'A Acme está quente: abriu vaga.\nSTATUS: pronto',
  ])
  assertEquals(await m.worker.rodada(), 1)
  assertEquals(m.fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertEquals(m.leituras, ['true'])
  assertEquals(m.eventos.map((e) => e.kind), ['ferramenta', 'texto'])
  assertEquals(m.eventos[0].payload.descricao, 'Scopus leu as Contas-alvo com Sinal ativo (1 Conta)')
  assertEquals(m.eventos[1].payload.texto, 'A Acme está quente: abriu vaga.')
  // As instruções descrevem as ferramentas e o formato do pedido; a segunda chamada leva o resultado.
  assertStringIncludes(m.chamadas[0].corpo.instructions, 'ler_contas_e_sinais')
  assertStringIncludes(m.chamadas[0].corpo.instructions, '"ferramenta"')
  assertStringIncludes(m.chamadas[1].corpo.input, 'Resultado da ferramenta ler_contas_e_sinais')
  assertStringIncludes(m.chamadas[1].corpo.input, 'Acme')
  assert(m.chamadas[0].chave !== m.chamadas[1].chave, 'cada chamada ao Hermes tem a própria Idempotency-Key')
})

Deno.test('uma ferramenta que não existe volta como texto ao Agente, e o pedido segue', async () => {
  const m = montar([
    '{"ferramenta": "apagar_tudo", "entrada": {}}',
    'Não consegui.\nSTATUS: pronto',
  ])
  await m.worker.rodada()
  assertEquals(m.fechamentos, [{ status: 'succeeded', errorCode: null }])
  assertStringIncludes(m.chamadas[1].corpo.input, 'não está disponível')
})

Deno.test('o Agente que só pede ferramentas, sem nunca responder, para no limite', async () => {
  const pedido = '{"ferramenta": "ler_contas_e_sinais", "entrada": {}}'
  const m = montar([pedido, pedido, pedido, pedido, pedido, pedido])
  await m.worker.rodada()
  assertEquals(m.fechamentos, [{ status: 'failed', errorCode: 'tool_loop_limit' }])
})

Deno.test('sem as ferramentas, o worker roda como antes e um texto em JSON é só texto', async () => {
  const m = montar(['{"ferramenta": "ler_contas_e_sinais", "entrada": {}}\nSTATUS: pronto'], { semFerramentas: true })
  await m.worker.rodada()
  assertEquals(m.eventos.map((e) => e.kind), ['texto'])
  assert(!m.chamadas[0].corpo.instructions.includes('"ferramenta"'))
})
