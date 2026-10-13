// Um tipo genérico do catálogo (novo escritório, expansão geográfica...) é atendido por cascatas do Mapa de Mercado. A
// cascata roda como sempre (reserva, passos, rastro e custo são dela), mas o Sinal de Conta é gravado no tipo genérico,
// que é o tipo do Monitoramento. A cascata de mercado não tem Conta, então nunca troca de tipo.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { cascataDeTeste, dbFalso } from './db-falso.ts'
import { MARCA_INTERNA } from '../marca.ts'
import { rodarCascata } from './motor.ts'
import type { ClienteDaFonte, ContaDoWorkspace, DbDaCascata, Item, PedidoDeCascata, RegistroDePassos, SinalConfirmado } from './tipos.ts'

const WS = 'ws-1'
const CONTA: ContaDoWorkspace = { id: 'conta-1', name: 'Alfa Importadora', domain: 'alfa.test', linkedinUrl: null }
const AGORA = Date.parse('2026-10-13T12:00:00Z')

const sinalDe = (conta: ContaDoWorkspace, n: unknown): SinalConfirmado => ({
  contaId: conta.id,
  contaNome: conta.name,
  eventKey: `filial|${String(n)}`,
  phrase: `Nova filial ${String(n)}`,
  firedAt: '2026-10-12T10:00:00Z',
  source: 'Receita Federal',
  evidence: `Filial ${String(n)} aberta`,
})

const registro: RegistroDePassos = {
  passos: {
    gerar: {
      montarEntrada: () => ({ input: { q: 'x' }, maxItems: 10 }),
      normalizar: (brutos) => brutos.filter((b): b is Item => !!b && typeof b === 'object').map((b) => ({ n: (b as Item).n })),
    },
    dedupe: { executar: (entrada) => [...new Map(entrada.map((i) => [i.n, i])).values()] },
    enriquecer: {
      montarEntrada: (entrada) => ({ input: { ns: entrada.map((i) => i.n) }, maxItems: 10 }),
      normalizar: (_brutos, entrada) => entrada.map((i) => ({ ...i })),
    },
    sinalizar: { executar: (entrada, ctx) => entrada.map((i) => sinalDe(ctx.contas[0], i.n)) },
  },
  fontes: {},
}

const fonte: ClienteDaFonte = {
  rodar: (args) =>
    Promise.resolve({
      apifyRunId: `run-${args.actorId}`, build: '1.0.0', tokenIndex: 0, custoUsd: 0.01,
      items: args.actorId === 'time~um' ? [{ n: 1 }, { n: 2 }] : [{ n: 1 }, { n: 2 }],
    }),
}

const pedido = (extra: Partial<PedidoDeCascata> = {}): PedidoDeCascata => ({
  workspaceId: WS, userId: 'user-1', signalType: 'teste_em_cascata', origem: 'monitor', monitorId: 'mon-1', chave: 'chave-1',
  contas: [CONTA], ...extra,
})

function espiar(db: DbDaCascata) {
  const gravados: { signalType: string; eventKey: string; monitorId: string | null }[] = []
  const aberturas: string[] = []
  return {
    gravados,
    aberturas,
    db: {
      ...db,
      abrir: (a: Parameters<DbDaCascata['abrir']>[0]) => (aberturas.push(a.signalType), db.abrir(a)),
      gravarSinal: (a: Parameters<DbDaCascata['gravarSinal']>[0]) => (
        gravados.push({ signalType: a.signalType, eventKey: a.sinal.eventKey, monitorId: a.monitorId }), db.gravarSinal(a)
      ),
    } satisfies DbDaCascata,
  }
}

Deno.test('sem registrarComo, o Sinal é gravado no tipo da cascata, como sempre', async () => {
  const { db } = dbFalso(cascataDeTeste())
  const e = espiar(db)
  const r = await rodarCascata({ db: e.db, fonte, registro, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(e.gravados.map((g) => g.signalType), ['teste_em_cascata', 'teste_em_cascata'])
})

Deno.test('com registrarComo, o Sinal vai ao tipo genérico do Monitoramento; a reserva e o rastro seguem na cascata', async () => {
  const { db, passos, fechamentos } = dbFalso(cascataDeTeste())
  const e = espiar(db)
  const r = await rodarCascata(
    { db: e.db, fonte, registro, agora: () => AGORA, log: () => {} },
    pedido({ registrarComo: 'novo_escritorio' }),
  )
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 2)
  assertEquals(e.gravados.map((g) => [g.signalType, g.eventKey, g.monitorId]), [
    ['novo_escritorio', 'filial|1', 'mon-1'],
    ['novo_escritorio', 'filial|2', 'mon-1'],
  ])
  assertEquals(e.aberturas, ['teste_em_cascata'], 'a execução e o crédito são da cascata')
  assertEquals(passos.length, 4)
  assertEquals(fechamentos.length, 1)
})

Deno.test('o mesmo acontecimento achado por duas cascatas do tipo genérico conta uma vez só', async () => {
  const { db } = dbFalso(cascataDeTeste())
  const e = espiar(db)
  const deps = { db: e.db, fonte, registro, agora: () => AGORA, log: () => {} }
  const primeira = await rodarCascata(deps, pedido({ registrarComo: 'novo_escritorio', chave: 'k1' }))
  const segunda = await rodarCascata(deps, pedido({ registrarComo: 'novo_escritorio', chave: 'k2' }))
  assertEquals([primeira.novos, primeira.repetidos], [2, 0])
  assertEquals([segunda.novos, segunda.repetidos], [0, 2])
})

Deno.test('a cascata de mercado não atende um tipo de Conta: nada é reservado, rodado nem gravado', async () => {
  const { db, passos, mercado, sinais } = dbFalso(cascataDeTeste({ scope: 'mercado' }))
  const e = espiar(db)
  const r = await rodarCascata(
    { db: e.db, fonte, registro, agora: () => AGORA, log: () => {} },
    pedido({ registrarComo: 'novo_escritorio' }),
  )
  assertEquals(r.desfecho, 'indisponivel')
  assertEquals(r.creditosCobrados, 0)
  assertEquals([e.aberturas.length, passos.length, mercado.length, sinais.length], [0, 0, 0, 0])
  assert(!MARCA_INTERNA.test(r.mensagem))
  // Sem registrarComo, a cascata de mercado roda como sempre.
  const normal = await rodarCascata({ db: e.db, fonte, registro, agora: () => AGORA, log: () => {} }, pedido())
  assert(normal.desfecho !== 'indisponivel')
})
