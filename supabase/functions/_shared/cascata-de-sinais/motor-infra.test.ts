// O que o motor oferece às cascatas dos ICPs além do caminho de A1: Sinal de mercado (sem Conta), fotografias para comparar
// com a rodada anterior e o custo do modelo de linguagem somado ao custo real.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { cascataDeTeste, dbFalso } from './db-falso.ts'
import { rodarCascata } from './motor.ts'
import type { CascataDef, ClienteDaFonte, Llm, RegistroDePassos } from './tipos.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const semFonte: ClienteDaFonte = { rodar: () => Promise.reject(new Error('não devia chamar o Apify')) }

const passo = (ordem: number, kind: 'regra' | 'fonte_publica', handler: string, extra: Record<string, unknown> = {}) => ({
  ordem, kind, handler, actorId: null, fallbacks: [], inputTemplate: {}, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null, ...extra,
})

const pedido = (extra: Record<string, unknown> = {}) => ({
  workspaceId: 'ws-1', userId: 'u1', signalType: 'teste_em_cascata', origem: 'conversa' as const, chave: 'k1', ...extra,
})

Deno.test('cascata de mercado: grava no feed do Workspace, sem Conta, e não exige Contas', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'gerar_mercado')] })
  const { db, mercado, sinais, aberturas } = dbFalso(def, { contas: [] })
  const registro: RegistroDePassos = {
    passos: {
      gerar_mercado: {
        executar: () => [
          { eventKey: 'ncm|84799999|2026-10', phrase: 'NCM 8479.99.99 entrou na pauta de importação', firedAt: '2026-10-06T00:00:00Z', source: 'Comex Stat', evidence: 'US$ 1,2 mi FOB.', payload: { fob: 1200000 } },
          { eventKey: '', phrase: 'sem chave' },
        ],
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals([r.desfecho, r.novos, aberturas.length], ['concluida', 1, 1])
  assertEquals(mercado.map((m) => [m.eventKey, m.payload]), [['ncm|84799999|2026-10', { fob: 1200000 }]])
  assertEquals(sinais.length, 0, 'nada vai para o record_signal de uma Conta')
  assertEquals(r.mercado.length, 1)
  assertEquals(r.sinais, [])
})

Deno.test('o mesmo Sinal de mercado rodado de novo conta uma vez só', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'gerar_mercado')] })
  const { db } = dbFalso(def, { contas: [] })
  const registro: RegistroDePassos = {
    passos: { gerar_mercado: { executar: () => [{ eventKey: 'k', phrase: 'x', firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }] } },
    fontes: {},
  }
  const a = await rodarCascata({ db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, pedido({ chave: 'a' }))
  const b = await rodarCascata({ db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, pedido({ chave: 'b' }))
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

Deno.test('fotografias: o passo lê a anterior, compara e grava a nova, no Workspace e no tipo da cascata', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'comparar')] })
  const { db, gravadas, mercado } = dbFalso(def, {
    fotografias: { '11222333000181': [{ takenAt: '2026-07-01T00:00:00Z', data: { processos: 2 } }, { takenAt: '2026-09-01T00:00:00Z', data: { processos: 4 } }] },
  })
  const registro: RegistroDePassos = {
    passos: {
      comparar: {
        async executar(_e, ctx) {
          const antes = await ctx.snapshots.ler(['11222333000181'])
          const antigas = await ctx.snapshots.ler(['11222333000181'], '2026-08-01T00:00:00Z')
          await ctx.snapshots.gravar([{ chave: '11222333000181', data: { processos: 9 } }])
          const [de, para] = [Number(antigas.get('11222333000181')?.data.processos), Number(antes.get('11222333000181')?.data.processos)]
          return [{ eventKey: 'salto|1', phrase: `Processos de ${de} para ${para}`, firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }]
        },
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(mercado[0].phrase, 'Processos de 2 para 4')
  assertEquals(gravadas, [{ chave: '11222333000181', data: { processos: 9 } }])
})

Deno.test('o custo do modelo de linguagem soma ao custo real do passo e da execução', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'classificar', { estFixedUsd: 0.002 })] })
  const { db, passos, fechamentos } = dbFalso(def)
  const llm: Llm = { json: () => Promise.resolve({ json: { cnaes: ['4930202'] }, custoUsd: 0.0007 }) }
  const registro: RegistroDePassos = {
    passos: {
      classificar: {
        async executar(_e, ctx) {
          const r = await ctx.llm!.json({ sistema: 's', usuario: 'u' })
          ctx.custo.adicionar(r.custoUsd)
          return [{ eventKey: 'k', phrase: 'x', firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }]
        },
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, llm, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.custoUsd, 0.0007)
  assertEquals(passos[0].fim?.custoUsd, 0.0007)
  assertEquals(fechamentos[0].custoUsd, 0.0007)
})

Deno.test('o passo que usa o modelo de linguagem cai na regra simples quando ele não está ligado', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'classificar')] })
  const { db } = dbFalso(def)
  const registro: RegistroDePassos = {
    passos: {
      classificar: {
        executar: (_e, ctx) => [{ eventKey: 'k', phrase: ctx.llm ? 'com modelo' : 'regra simples', firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }],
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.mercado[0].phrase, 'regra simples')
})

Deno.test('um passo de regra com custo estimado que passa do teto aborta antes de rodar', async () => {
  const def: CascataDef = cascataDeTeste({ capUsd: 0.001, scope: 'mercado', steps: [passo(1, 'regra', 'classificar', { estFixedUsd: 0.01 })] })
  const { db, passos, fechamentos } = dbFalso(def)
  let rodou = false
  const registro: RegistroDePassos = { passos: { classificar: { executar: () => (rodou = true, []) } }, fontes: {} }
  const r = await rodarCascata({ db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals([r.desfecho, rodou, passos[0].fim?.estado, fechamentos[0].estado], ['abortada', false, 'aborted_cap', 'aborted'])
  assert(r.mensagem.includes('teto'))
})

Deno.test('o motor entrega o Workspace do pedido ao modelo (o caminho hermes enfileira por Workspace) sem o passo precisar saber', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'classificar')] })
  const { db } = dbFalso(def)
  const vistos: (string | undefined)[] = []
  const llm: Llm = { json: (a) => (vistos.push(a.workspaceId), Promise.resolve({ json: {}, custoUsd: 0 })) }
  const registro: RegistroDePassos = {
    passos: { classificar: { async executar(_e, ctx) { await ctx.llm!.json({ sistema: 's', usuario: 'u' }); return [] } } },
    fontes: {},
  }
  await rodarCascata({ db, fonte: semFonte, registro, llm, agora: () => AGORA, log: () => {} }, pedido({ workspaceId: 'ws-do-pedido' }))
  assertEquals(vistos, ['ws-do-pedido'])
})

Deno.test('um modelo que falha (erro ou prazo) não derruba a execução: o passo usa a regra e o custo do modelo fica em zero', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'classificar')] })
  const { db, passos, fechamentos } = dbFalso(def)
  const llm: Llm = { json: () => Promise.reject(new Error('A classificação não respondeu a tempo')) }
  const registro: RegistroDePassos = {
    passos: {
      classificar: {
        async executar(_e, ctx) {
          let phrase = 'regra simples'
          try {
            const r = await ctx.llm!.json({ sistema: 's', usuario: 'u' })
            ctx.custo.adicionar(r.custoUsd)
            phrase = 'com modelo'
          } catch { /* a regra assume */ }
          return [{ eventKey: 'k', phrase, firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }]
        },
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, llm, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals([r.desfecho, r.mercado[0].phrase, passos[0].fim?.custoUsd, fechamentos[0].custoUsd], ['concluida', 'regra simples', 0, 0])
})

Deno.test('depois da primeira falha do modelo na execução, as chamadas seguintes falham na hora (sem esperar o prazo de novo)', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'classificar')] })
  const { db } = dbFalso(def)
  let chamadasAoModelo = 0
  const llm: Llm = { json: () => (chamadasAoModelo++, Promise.reject(new Error('A classificação não respondeu a tempo'))) }
  const registro: RegistroDePassos = {
    passos: {
      classificar: {
        async executar(_e, ctx) {
          const erros: string[] = []
          for (let lote = 0; lote < 3; lote++) {
            try { await ctx.llm!.json({ sistema: 's', usuario: `lote ${lote}` }) } catch (e) { erros.push((e as Error).message) }
          }
          return [{ eventKey: 'k', phrase: erros.join('|'), firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }]
        },
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, llm, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(chamadasAoModelo, 1)
  assertEquals(r.mercado[0].phrase.split('|').length, 3)
  assert(r.mercado[0].phrase.includes('indisponível nesta execução'))
})

Deno.test('o tempo total do modelo numa execução tem orçamento: estourado, as chamadas seguintes falham na hora', async () => {
  const def: CascataDef = cascataDeTeste({ scope: 'mercado', steps: [passo(1, 'regra', 'classificar')] })
  const { db } = dbFalso(def)
  let relogio = AGORA
  let chamadas = 0
  const llm: Llm = { json: () => (chamadas++, relogio += 40_000, Promise.resolve({ json: {}, custoUsd: 0 })) }
  const registro: RegistroDePassos = {
    passos: {
      classificar: {
        async executar(_e, ctx) {
          let feitas = 0
          for (let lote = 0; lote < 5; lote++) {
            try { await ctx.llm!.json({ sistema: 's', usuario: 'u' }); feitas++ } catch { /* orçamento */ }
          }
          return [{ eventKey: 'k', phrase: `feitas ${feitas}`, firedAt: '2026-10-06T00:00:00Z', source: 's', evidence: 'e' }]
        },
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte: semFonte, registro, llm, agora: () => relogio, log: () => {} }, pedido())
  // Orçamento de 60 s: a 1ª (40 s) e a 2ª (80 s acumulados) rodam; as outras falham sem chamar o modelo.
  assertEquals([chamadas, r.mercado[0].phrase], [2, 'feitas 2'])
})
