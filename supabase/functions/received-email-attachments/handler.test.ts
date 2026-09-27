import { assertEquals } from 'jsr:@std/assert@1'
import { type AttachmentDb, type AttachmentSigner, createHandler } from './handler.ts'

const INTERACTION = '70000000-0000-0000-0000-000000000001'

function fakeDb(path: string | Error, user = true) {
  const db: AttachmentDb = {
    userFromJwt: async () => user ? { userId: 'u1' } : null,
    attachmentPathForUser: async () => {
      if (path instanceof Error) throw path
      return path
    },
  }
  return db
}

function fakeSigner() {
  const signed: { path: string; expiresIn: number }[] = []
  const signer: AttachmentSigner = {
    createSignedUrl: async (path, expiresIn) => {
      signed.push({ path, expiresIn })
      return `https://storage.test/sign/${path}?token=abc`
    },
  }
  return { signer, signed }
}

function request(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer jwt', apikey: 'anon' }) {
  return new Request('https://functions.test/received-email-attachments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

Deno.test('o titular recebe uma URL assinada de curta duração', async () => {
  const { signer, signed } = fakeSigner()
  const handle = createHandler({ db: fakeDb('recebidos/i/att-1/proposta.pdf'), signer, appOrigin: 'https://app.test' })
  const res = await handle(request({ interactionId: INTERACTION, attachmentId: 'att-1' }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    url: 'https://storage.test/sign/recebidos/i/att-1/proposta.pdf?token=abc',
    expiresIn: 300,
  })
  assertEquals(signed, [{ path: 'recebidos/i/att-1/proposta.pdf', expiresIn: 300 }])
})

Deno.test('quem não é o responsável não recebe URL nenhuma', async () => {
  const { signer, signed } = fakeSigner()
  const denied = Object.assign(new Error('only the owner can read the received e-mail'), { code: '42501' })
  const handle = createHandler({ db: fakeDb(denied), signer, appOrigin: 'https://app.test' })
  const res = await handle(request({ interactionId: INTERACTION, attachmentId: 'att-1' }))
  assertEquals(res.status, 403)
  assertEquals(signed.length, 0)
})

Deno.test('anexo ainda não guardado devolve 404', async () => {
  const { signer } = fakeSigner()
  const handle = createHandler({
    db: fakeDb(Object.assign(new Error('attachment not stored'), { code: 'P0002' })),
    signer,
    appOrigin: 'https://app.test',
  })
  const res = await handle(request({ interactionId: INTERACTION, attachmentId: 'att-1' }))
  assertEquals(res.status, 404)
})

Deno.test('sem JWT, 401', async () => {
  const { signer } = fakeSigner()
  const handle = createHandler({ db: fakeDb('x', false), signer, appOrigin: 'https://app.test' })
  const res = await handle(request({ interactionId: INTERACTION, attachmentId: 'att-1' }, {}))
  assertEquals(res.status, 401)
})

Deno.test('id longo de anexo do Outlook é aceito', async () => {
  const { signer, signed } = fakeSigner()
  const longId = 'AAMkAGI2' + 'x'.repeat(300) + '='
  const handle = createHandler({ db: fakeDb('recebidos/i/h/image.png'), signer, appOrigin: 'https://app.test' })
  const res = await handle(request({ interactionId: INTERACTION, attachmentId: longId }))
  assertEquals(res.status, 200)
  assertEquals(signed.length, 1)
})
