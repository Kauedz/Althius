// O Mapa de Mercado no código e as cascatas no banco dizem o mesmo: cada Sinal semeado pelas migrações está no Mapa, cada
// Sinal do Mapa tem cascata (ou está registrado sem fonte), e o ICP de um e de outro coincide. Lê as migrações: precisa de
// --allow-read (o passo próprio do CI); sem a permissão, o teste das migrações é ignorado.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { icpDoSinalDoMapa, MAPA_DE_SINAIS } from './mapa-de-sinais.ts'
import { MARCA_INTERNA } from './marca.ts'

const PASTA = new URL('../../migrations/', import.meta.url)
const podeLer = (await Deno.permissions.query({ name: 'read', path: PASTA })).state === 'granted'

Deno.test('o Mapa cobre os oito ICPs, sem Sinal repetido e sem texto de fornecedor', () => {
  assertEquals(Object.keys(MAPA_DE_SINAIS), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  const todos = Object.values(MAPA_DE_SINAIS).flatMap((m) => m.sinais)
  assertEquals(new Set(todos).size, todos.length)
  for (const m of Object.values(MAPA_DE_SINAIS)) {
    assert(m.sinais.length >= 4 && m.nome && m.gatilho)
    assert(!MARCA_INTERNA.test(JSON.stringify(m)))
  }
  assertEquals(icpDoSinalDoMapa('vaga_comex'), 'A')
  assertEquals(icpDoSinalDoMapa('nova_cooperativa'), 'H')
  assertEquals(icpDoSinalDoMapa('qualquer_outro'), null)
})

Deno.test({
  name: 'os Sinais semeados pelas migrações são exatamente os do Mapa, no mesmo ICP',
  ignore: !podeLer,
  async fn() {
    const doBanco = new Map<string, string>()
    for await (const arquivo of Deno.readDir(PASTA)) {
      if (!arquivo.name.includes('cascatas')) continue
      const sql = await Deno.readTextFile(new URL(arquivo.name, PASTA))
      for (const m of sql.matchAll(/"signalType":\s*"([a-z0-9_]+)",\s*"icp":\s*"([A-H])"/g)) doBanco.set(m[1], m[2])
      // A cascata A1 é semeada por `insert`, não por `seed_signal_cascade`.
      for (const m of sql.matchAll(/values \('([a-z0-9_]+)', '([A-H])', '/g)) doBanco.set(m[1], m[2])
    }
    const doMapa = new Map(Object.entries(MAPA_DE_SINAIS).flatMap(([icp, m]) => m.sinais.map((s): [string, string] => [s, icp])))
    assertEquals([...doBanco].sort(), [...doMapa].sort())
  },
})
