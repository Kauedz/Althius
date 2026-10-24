import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import type { ActorDoRegistro, Apify } from '../signal-scan/handler.ts'
import {
  type AdaptadorDeSinal,
  type Cascatas,
  type ContaParaVarrer,
  createHandler,
  type Db,
  type Manuais,
  type MonitorReivindicado,
  type PedidoManual,
  type ResultadoDaAbertura,
  type ResumoDaRodada,
} from './handler.ts'

// Preço por rodada e limites (agente-de-sinal 04): o limite de créditos por dia do Sinal para a Rodada na Conta que o estouraria,
// sem cobrar essa Conta (as já verificadas ficam cobradas), na agenda e no manual; a cascata e o mercado, que reservam por Rodada,
// conferem a Rodada inteira antes; e sem créditos a Rodada é pulada sem cobrar, com o motivo que o banco usa para contar as puladas.

const WS = '11111111-1111-4111-8111-111111111111'
const HORARIO = '2026-10-26T11:00:00+00:00'
const PEDIDO_EM = '2026-10-26T12:00:00+00:00'
const AGORA = Date.parse('2026-10-26T11:04:00Z')
const conta = (id: string, nome: string): ContaParaVarrer => ({
  id, name: nome, domain: `${id}.test`, linkedinUrl: `https://www.linkedin.com/company/${id}`,
})
const CONTAS = [conta('alfa', 'Alfa'), conta('beta', 'Beta'), conta('gama', 'Gama'), conta('delta', 'Delta')]

const monitor = (o: Partial<MonitorReivindicado> = {}): MonitorReivindicado => ({
  monitorId: 'mon-1', workspaceId: WS, signalType: 'nova_lideranca', criteria: { cargo: 'CTO' }, createdBy: 'user-1', slot: HORARIO,
  accounts: CONTAS, ...o,
})
const pedido = (o: Partial<PedidoManual> = {}): PedidoManual => ({
  pedidoId: 'pedido-1', workspaceId: WS, monitorId: 'mon-1', signalType: 'nova_lideranca', criteria: { cargo: 'CTO' },
  requestedBy: 'user-1', requestedAt: PEDIDO_EM, accounts: CONTAS, ...o,
})

const adaptador: AdaptadorDeSinal = {
  signalType: 'nova_lideranca',
  entrada: (c) => ({ input: { empresa: c.linkedinUrl }, maxItems: 5 }),
  sinais: (_itens, c, criterios, agora) => [
    { eventKey: `${c.id}|${String(criterios.cargo)}`, phrase: `Nova liderança em ${c.name}`, firedAt: new Date(agora).toISOString() },
  ],
}
const ACTOR: ActorDoRegistro = { actorId: 'harvestapi~linkedin-profile-search', signalType: 'nova_lideranca', state: 'available', version: null, maxCostUsd: 0.2 }

const resultadoDaCascata = (extra: Partial<ResultadoDaCascata> = {}): ResultadoDaCascata => ({
  desfecho: 'concluida', mensagem: 'A busca terminou.', creditosCobrados: 4, custoUsd: 0.25, sinais: [], novos: 1, repetidos: 0,
  semConta: 0, semContaNomes: [], mercado: [], passos: [], ...extra,
})

interface Opcoes {
  /** O que o banco responde à abertura de cada Conta (padrão: `go`). */
  abertura?: (contaId: string) => ResultadoDaAbertura
  monitores?: MonitorReivindicado[]
  pedidos?: PedidoManual[]
  /** Se a Rodada inteira passaria do limite do dia. Ausente: o runner não tem a leitura. */
  estoura?: (monitorId: string) => boolean | Error
  cascata?: boolean
  mercado?: boolean
}

function montar(o: Opcoes = {}) {
  const c = {
    aberturas: [] as { contaId: string; origem: string | undefined }[],
    fechamentos: [] as { id: string; success: boolean }[],
    somas: [] as ResumoDaRodada[],
    fins: [] as { attempted: number; error: string | null; continuar: boolean }[],
    pedidos: [] as { estado: string; tentadas: number; erro: string | null }[],
    cascatas: [] as PedidoDeCascata[],
    conferencias: [] as string[],
    logs: [] as Record<string, unknown>[],
    fornecedor: 0,
  }
  const db: Db = {
    tokenMatches: () => Promise.resolve(true),
    claim: () => Promise.resolve(o.monitores ?? []),
    actorForType: () => Promise.resolve(ACTOR),
    beginScan: (a) => {
      c.aberturas.push({ contaId: a.accountId, origem: a.origem })
      const outcome = o.abertura ? o.abertura(a.accountId) : 'go'
      return Promise.resolve({ outcome, reservationId: outcome === 'go' ? `res-${a.accountId}` : null })
    },
    endScan: (id, success) => (c.fechamentos.push({ id, success }), Promise.resolve()),
    recordSignal: () => Promise.resolve(true),
    recordCost: () => Promise.resolve(),
    finish: (_m, attempted, error, continuar) => (c.fins.push({ attempted, error, continuar }), Promise.resolve()),
    abrirRodada: (a) => Promise.resolve(a.pedidoId ? `rodada-${a.pedidoId}` : `rodada-${a.monitorId}`),
    somarRodada: (_id, resumo) => (c.somas.push(resumo), Promise.resolve()),
    ...(o.mercado ? { escopo: () => Promise.resolve('mercado' as const) } : {}),
    ...(o.estoura
      ? {
        rodadaEstouraOLimiteDoDia: (monitorId: string) => {
          c.conferencias.push(monitorId)
          const r = o.estoura!(monitorId)
          return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
        },
      }
      : {}),
  }
  const manuais: Manuais = {
    claim: () => Promise.resolve(o.pedidos ?? []),
    finish: (_id, estado, tentadas, erro) => (c.pedidos.push({ estado, tentadas, erro }), Promise.resolve()),
  }
  const cascatas: Cascatas = {
    ehCascata: () => Promise.resolve(o.cascata === true),
    rodar: (p) => (c.cascatas.push(p), Promise.resolve(resultadoDaCascata())),
  }
  const apify: Apify = { run: () => (c.fornecedor++, Promise.resolve({ runId: 'run-1', items: [{}] })) }
  const handler = createHandler({
    db, apify, manuais, cascatas, adaptadores: { nova_lideranca: adaptador }, agora: () => AGORA, log: (campos) => c.logs.push(campos),
  })
  return { c, chamar: () => handler(new Request('http://x/signal-runner', { method: 'POST', body: '{}' })) }
}

// O limite por dia: a Conta que o estouraria volta `teto_diario` e a Rodada para ali.

Deno.test('a Rodada agendada para na Conta que estouraria o limite do dia, sem cobrar nem rodar essa Conta', async () => {
  const { c, chamar } = montar({
    monitores: [monitor()],
    abertura: (id) => (id === 'gama' || id === 'delta' ? 'teto_diario' : 'go'),
  })
  await chamar()
  assertEquals(c.aberturas.map((a) => a.contaId), ['alfa', 'beta', 'gama'], 'a Rodada para na primeira Conta recusada: a quarta nem é aberta')
  assertEquals(c.fornecedor, 2, 'só as duas Contas abertas vão ao fornecedor')
  assertEquals(c.fechamentos, [{ id: 'res-alfa', success: true }, { id: 'res-beta', success: true }], 'e só as duas verificadas são cobradas')
  assertEquals(c.somas.length, 1)
  assertEquals([c.somas[0].motivo, c.somas[0].verificadas, c.somas[0].reservas], ['teto_diario', 2, ['res-alfa', 'res-beta']])
  assertEquals(c.fins.length, 1)
  assertEquals([c.fins[0].attempted, c.fins[0].continuar], [2, false], 'a Rodada termina e a próxima é a do próximo horário: não continua')
  assertEquals(c.fins[0].error, 'Este Sinal chegou ao limite de créditos de hoje. Ele volta a rodar amanhã.')
})

Deno.test('o limite do dia batido na primeira Conta não cobra nada e não é "sem créditos"', async () => {
  const { c, chamar } = montar({ monitores: [monitor()], abertura: () => 'teto_diario' })
  await chamar()
  assertEquals(c.fornecedor, 0)
  assertEquals(c.fechamentos, [])
  assertEquals(c.somas[0].motivo, 'teto_diario')
  assertEquals(c.somas[0].verificadas, 0)
  assert(!c.fins[0].error?.includes('créditos ou no limite mensal'), 'a frase é a do limite do dia, não a de saldo')
})

Deno.test('o Rodar agora também para no limite do dia: o pedido termina como feito, com a frase de quem clicou', async () => {
  const { c, chamar } = montar({
    pedidos: [pedido()],
    abertura: (id) => (id === 'gama' ? 'teto_diario' : 'go'),
  })
  await chamar()
  assertEquals(c.aberturas.map((a) => [a.contaId, a.origem]), [['alfa', 'manual'], ['beta', 'manual'], ['gama', 'manual']])
  assertEquals(c.somas[0].motivo, 'teto_diario')
  assertEquals(c.pedidos, [{
    estado: 'feita', tentadas: 2, erro: 'Este Sinal chegou ao limite de créditos de hoje: a rodada parou. Ele volta amanhã.',
  }])
})

// Cascata e mercado reservam por Rodada: a Rodada inteira tem de caber no que falta do dia.

Deno.test('o mercado não roda quando a Rodada inteira estouraria o limite do dia: nada é reservado', async () => {
  const { c, chamar } = montar({ monitores: [monitor({ accounts: [] })], mercado: true, estoura: () => true })
  await chamar()
  assertEquals(c.conferencias, ['mon-1'])
  assertEquals(c.cascatas.length, 0, 'a cascata nem é chamada, então nenhum crédito é reservado')
  assertEquals(c.somas, [{ motivo: 'teto_diario' }])
  assertEquals(c.fins, [{ attempted: 0, error: 'Este Sinal chegou ao limite de créditos de hoje. Ele volta a rodar amanhã.', continuar: false }])
})

Deno.test('a cascata por Conta também confere o limite do dia antes de rodar', async () => {
  const { c, chamar } = montar({ monitores: [monitor()], cascata: true, estoura: () => true })
  await chamar()
  assertEquals(c.cascatas.length, 0)
  assertEquals(c.somas[0].motivo, 'teto_diario')
})

Deno.test('cabendo no dia, a cascata e o mercado rodam como sempre', async () => {
  const mercado = montar({ monitores: [monitor({ accounts: [] })], mercado: true, estoura: () => false })
  await mercado.chamar()
  assertEquals(mercado.c.cascatas.length, 1)
  assertEquals(mercado.c.cascatas[0].tetoCreditos, 4)
  const porConta = montar({ monitores: [monitor()], cascata: true, estoura: () => false })
  await porConta.chamar()
  assertEquals(porConta.c.cascatas.length, 1)
})

Deno.test('se a leitura do limite do dia falha, a Rodada segue e o erro vai para o log, sem texto técnico no Monitoramento', async () => {
  const { c, chamar } = montar({ monitores: [monitor({ accounts: [] })], mercado: true, estoura: () => new Error('42883 function does not exist') })
  await chamar()
  assertEquals(c.cascatas.length, 1, 'a cascata tem os próprios limites: a leitura que falha não trava a Rodada')
  assertEquals(c.fins[0].error, null)
  assert(c.logs.some((l) => l.outcome === 'daily_cap_check_failed'))
})

Deno.test('sem a leitura do limite do dia (banco sem a migration), a cascata roda como sempre', async () => {
  const { c, chamar } = montar({ monitores: [monitor({ accounts: [] })], mercado: true })
  await chamar()
  assertEquals(c.cascatas.length, 1)
  assertEquals(c.conferencias, [])
})

Deno.test('o caminho por Conta não faz a conferência da Rodada inteira: confere Conta a Conta no banco', async () => {
  const { c, chamar } = montar({ monitores: [monitor()], estoura: () => true })
  await chamar()
  assertEquals(c.conferencias, [], 'a Rodada por Conta usa o begin_account_scan')
  assertEquals(c.aberturas.length, 4)
  assertEquals(c.fechamentos.length, 4)
})

// Sem créditos: a Rodada é pulada sem cobrar. O motivo `sem_creditos` na Rodada é o que o banco usa para contar as puladas.

Deno.test('sem créditos na primeira Conta a Rodada é pulada: nada é cobrado e o motivo fica na Rodada', async () => {
  const { c, chamar } = montar({ monitores: [monitor()], abertura: () => 'no_credits' })
  await chamar()
  assertEquals(c.fornecedor, 0)
  assertEquals(c.fechamentos, [])
  assertEquals(c.somas, [{ verificadas: 0, novos: 0, repetidos: 0, semDado: 0, reservas: [], motivo: 'sem_creditos' }])
  assertEquals(c.fins[0].error, 'Sem créditos ou no limite mensal do participante: a varredura espera.')
  assertEquals(c.fins[0].continuar, false)
})

Deno.test('o saldo que acaba no meio da Rodada para ali e cobra só o que foi verificado', async () => {
  const { c, chamar } = montar({ monitores: [monitor()], abertura: (id) => (id === 'gama' ? 'no_credits' : 'go') })
  await chamar()
  assertEquals(c.fechamentos, [{ id: 'res-alfa', success: true }, { id: 'res-beta', success: true }])
  assertEquals([c.somas[0].motivo, c.somas[0].verificadas, c.somas[0].reservas], ['sem_creditos', 2, ['res-alfa', 'res-beta']])
  assertEquals(c.aberturas.length, 3, 'depois da Conta sem saldo, o runner não tenta as outras')
})
