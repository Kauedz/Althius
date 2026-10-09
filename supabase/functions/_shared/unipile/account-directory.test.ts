// "Esta conta é da conexão ativa?" (canais-17): a resposta vem da lista de contas da própria conexão (a ponte), guardada por
// um minuto; uma conta que não aparece força UMA releitura (a conta recém-criada), e só uma lista completa prova ausência.
import { assertEquals } from 'jsr:@std/assert@1'
import { createAccountDirectory } from './account-directory.ts'
import type { UnipileAccountSummary } from './bridge.ts'

const account = (id: string, provider = 'LINKEDIN'): UnipileAccountSummary => ({
  id,
  provider,
  state: 'connected',
  createdAt: null,
})

function directory(pages: Array<{ accounts: UnipileAccountSummary[]; complete: boolean } | Error>) {
  let clock = 0
  let calls = 0
  const dir = createAccountDirectory({
    list: async () => {
      const page = pages[Math.min(calls, pages.length - 1)]
      calls += 1
      if (page instanceof Error) throw page
      return page
    },
    now: () => clock,
  })
  return { dir, advance: (ms: number) => (clock += ms), calls: () => calls }
}

Deno.test('conta que está na lista da conexão ativa: é dela, e o provedor vem junto', async () => {
  const { dir } = directory([{ accounts: [account('a1'), account('a2', 'WHATSAPP')], complete: true }])
  assertEquals(await dir.lookup('a1'), { status: 'member', provider: 'LINKEDIN' })
  assertEquals(await dir.lookup('a2'), { status: 'member', provider: 'WHATSAPP' })
})

Deno.test('conta que não está numa lista completa: de outra conexão, depois de uma releitura', async () => {
  const f = directory([{ accounts: [account('a1')], complete: true }])
  assertEquals(await f.dir.lookup('de-outra'), { status: 'foreign' })
  // A lista foi lida agora mesmo, para esta pergunta: reler não diria nada de novo.
  assertEquals(f.calls(), 1)
})

Deno.test('a lista vale por um minuto: conta conhecida não relê; conta nova relê uma vez e é achada', async () => {
  const f = directory([
    { accounts: [account('a1')], complete: true },
    { accounts: [account('a1'), account('nova')], complete: true },
  ])
  assertEquals((await f.dir.lookup('a1')).status, 'member')
  assertEquals(f.calls(), 1)
  assertEquals((await f.dir.lookup('a1')).status, 'member')
  assertEquals(f.calls(), 1)
  f.advance(11_000)
  assertEquals((await f.dir.lookup('nova')).status, 'member')
  assertEquals(f.calls(), 2)
})

Deno.test('uma conta de fora não vira uma chamada à Unipile por evento: a releitura tem intervalo mínimo (10 s)', async () => {
  const f = directory([{ accounts: [account('a1')], complete: true }])
  await f.dir.lookup('fora-1')
  const after = f.calls()
  for (let i = 0; i < 20; i++) await f.dir.lookup(`fora-${i}`)
  assertEquals(f.calls(), after)
  f.advance(11_000)
  await f.dir.lookup('fora-1')
  assertEquals(f.calls(), after + 1)
})

Deno.test('lista incompleta ou falha na leitura: não dá para provar, então a conta segue como era (unknown)', async () => {
  const partial = directory([{ accounts: [account('a1')], complete: false }])
  assertEquals(await partial.dir.lookup('a1'), { status: 'member', provider: 'LINKEDIN' })
  assertEquals(await partial.dir.lookup('qualquer'), { status: 'unknown' })

  const failing = directory([new Error('HTTP 503')])
  assertEquals(await failing.dir.lookup('a1'), { status: 'unknown' })
})
