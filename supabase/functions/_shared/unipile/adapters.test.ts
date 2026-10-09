// Os adaptadores de hoje leem a Unipile pelos schemas: uma resposta que não bate vira erro tipado (incerto), com o
// caminho que falhou e nunca o valor.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { unipileMailVia } from '../send-step-adapters.ts'
import { readChatSent, readLinkedInProfile, unipileChatVia } from '../send-chat-step-adapters.ts'
import { failureKind, UnipileRequestError, UnipileUnreadableResponse } from './errors.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function withFetch<T>(response: Response, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

const email = { to: [{ email: 'maria@empresa.com.br' }], subject: 's', plain_text: 'p', custom_headers: [] }
const signal = () => ({ signal: new AbortController().signal })

Deno.test('e-mail: 2xx com id válido passa; sem id ou com id que não é texto fica incerto, sem vazar o valor', async () => {
  const ok = await withFetch(json({ id: 'em-1', message_id: '<a@b>' }), () => unipileMailVia('k').sendEmail('acc', email, signal()))
  assertEquals(ok, { id: 'em-1', message_id: '<a@b>' })
  const noMessageId = await withFetch(json({ id: 'em-2', message_id: 7 }), () => unipileMailVia('k').sendEmail('acc', email, signal()))
  assertEquals(noMessageId, { id: 'em-2', message_id: null })

  for (const body of [{ message_id: '<x@y>' }, { id: 42 }, { id: '' }, 'ok']) {
    const error = await assertRejects(
      () => withFetch(json(body), () => unipileMailVia('k').sendEmail('acc', email, signal())),
      UnipileUnreadableResponse,
    )
    assertEquals(failureKind(error), 'uncertain')
  }
  const notJson = await assertRejects(
    () => withFetch(new Response('<html>', { status: 200 }), () => unipileMailVia('k').sendEmail('acc', email, signal())),
    UnipileUnreadableResponse,
  )
  assertEquals(failureKind(notJson), 'uncertain')
})

Deno.test('e-mail: 4xx é recusa definitiva; 5xx é incerto', async () => {
  const refused = await assertRejects(
    () => withFetch(json({}, 422), () => unipileMailVia('k').sendEmail('acc', email, signal())),
    UnipileRequestError,
  )
  assertEquals(failureKind(refused), 'definite_refusal')
  const down = await assertRejects(
    () => withFetch(json({}, 502), () => unipileMailVia('k').sendEmail('acc', email, signal())),
    UnipileRequestError,
  )
  assertEquals(failureKind(down), 'uncertain')
})

Deno.test('chat: a resposta ilegível diz o caminho, nunca o valor', () => {
  const secretLooking = 'valor-que-nao-pode-aparecer'
  try {
    readLinkedInProfile({ network_distance: secretLooking })
    throw new Error('devia rejeitar')
  } catch (error) {
    assertEquals(error instanceof UnipileUnreadableResponse, true)
    assertEquals((error as Error).message.includes(secretLooking), false)
  }
  try {
    readChatSent({ object: secretLooking })
    throw new Error('devia rejeitar')
  } catch (error) {
    assertEquals(error instanceof UnipileUnreadableResponse, true)
    assertEquals((error as Error).message.includes(secretLooking), false)
  }
})

Deno.test('chat: a lista de mensagens que não é lista nem objeto é ilegível; objeto vazio é lista vazia', async () => {
  const chat = (response: Response) => unipileChatVia('k', (() => Promise.resolve(response)) as typeof fetch)
  assertEquals(await chat(json({})).listChatMessages('a', 'c'), [])
  await assertRejects(() => chat(json('texto solto')).listChatMessages('a', 'c'), UnipileUnreadableResponse)
})
