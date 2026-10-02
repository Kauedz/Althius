import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, signWebhookBody, type WebhookDb } from './handler.ts'

// canais-11: a queda da Conta remetente pausa as Sequências que a usam; a volta não retoma nada.

const SECRET = 'segredo-de-teste'
const NOW = Date.UTC(2026, 9, 5, 15, 0, 0)

function setup(hold: number | Error | undefined = 1) {
  const applied: string[] = []
  const held: string[] = []
  const db: WebhookDb = {
    completeSenderConnectionAttempt: async () => 'completed',
    applyUnipileSenderStatus: async (_accountId, status) => {
      applied.push(status)
      return true
    },
    ingestEmailEvent: async () => ({ outcome: 'unrelated', interaction_id: null, send_id: null, attachments: [] }),
    recordReceivedEmailAttachment: async () => {},
    ...(hold === undefined ? {} : {
      holdSequencesOfLostSender: async (accountId: string) => {
        held.push(accountId)
        if (hold instanceof Error) throw hold
        return hold
      },
    }),
  }
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    secret: SECRET,
    db,
    unipile: { downloadEmailAttachment: async () => ({ bytes: new Uint8Array(), contentType: null }) },
    storage: { upload: async () => {} },
    now: () => NOW,
    log: (fields) => logs.push(fields),
  })
  return { handle, applied, held, logs }
}

async function signed(event: unknown) {
  const body = JSON.stringify(event)
  const timestamp = String(Math.floor(NOW / 1000))
  const signature = await signWebhookBody(body, timestamp, SECRET)
  return new Request('https://functions.test/unipile-account-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'unipile-signature': `t=${timestamp},v0=${signature}` },
    body,
  })
}

Deno.test('credenciais revogadas ou expiradas: grava a queda e pausa as Sequências da conta', async () => {
  const { handle, applied, held, logs } = setup(2)
  const res = await handle(await signed({ type: 'account.status.disconnected', account_id: 'acc-1' }))
  assertEquals(res.status, 200)
  assertEquals(applied, ['CREDENTIALS'])
  assertEquals(held, ['acc-1'])
  assertEquals(logs.some((l) => l.outcome === 'sequences_held' && l.held === 2), true)
})

Deno.test('conta com erro ou removida também pausa', async () => {
  for (const type of ['account.status.errored', 'account.remove']) {
    const { handle, held } = setup()
    assertEquals((await handle(await signed({ type, account_id: 'acc-2' }))).status, 200)
    assertEquals(held, ['acc-2'])
  }
})

Deno.test('a conta que volta não retoma nada: só o estado muda', async () => {
  for (const type of ['account.status.running', 'account.initial_sync.completed']) {
    const { handle, applied, held } = setup()
    assertEquals((await handle(await signed({ type, account_id: 'acc-3' }))).status, 200)
    assertEquals(applied.length, 1)
    assertEquals(held, [])
  }
})

Deno.test('se a pausa falhar, o evento é confirmado mesmo assim (o Executor pausa no próximo passo barrado)', async () => {
  const { handle, applied, logs } = setup(new Error('banco fora'))
  const res = await handle(await signed({ type: 'account.status.disconnected', account_id: 'acc-4' }))
  assertEquals(res.status, 200)
  assertEquals(applied, ['CREDENTIALS'])
  assertEquals(logs.some((l) => l.outcome === 'hold_failed'), true)
})

Deno.test('sem a RPC nova, a queda continua só bloqueando os envios, como antes', async () => {
  const { handle, applied } = setup(undefined)
  assertEquals((await handle(await signed({ type: 'account.status.disconnected', account_id: 'acc-5' }))).status, 200)
  assertEquals(applied, ['CREDENTIALS'])
})
