import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, detectMime, type SequenceAttachmentDb, type SequenceAttachmentStorage } from './handler.ts'

const SEQUENCE = '70000000-0000-0000-0000-000000000001'
const ATTACHMENT = '71000000-0000-0000-0000-000000000001'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3])
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0])
const MOV = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0])
const PDF = new TextEncoder().encode('%PDF-1.7 qualquer coisa')

function fakes(
  options: { user?: boolean; register?: Error; upload?: Error; path?: string | Error; maxBytes?: number } = {},
) {
  const calls: Record<string, unknown[]> = { register: [], stored: [], discarded: [], uploaded: [], signed: [] }
  const db: SequenceAttachmentDb = {
    userFromJwt: async () => options.user === false ? null : { userId: 'u1' },
    registerAttachment: async (_auth, _apikey, input) => {
      calls.register.push(input)
      if (options.register) throw options.register
      return { attachmentId: ATTACHMENT, storagePath: `anexos/${SEQUENCE}/${ATTACHMENT}/arquivo` }
    },
    markStored: async (id) => {
      calls.stored.push(id)
    },
    discardPending: async (id) => {
      calls.discarded.push(id)
    },
    attachmentPathForUser: async () => {
      if (options.path instanceof Error) throw options.path
      return options.path ?? `anexos/${SEQUENCE}/${ATTACHMENT}/arquivo`
    },
  }
  const storage: SequenceAttachmentStorage = {
    upload: async (path, bytes, contentType) => {
      if (options.upload) throw options.upload
      calls.uploaded.push({ path, size: bytes.length, contentType })
    },
    createSignedUrl: async (path, expiresIn) => {
      calls.signed.push({ path, expiresIn })
      return `https://storage.test/sign/${path}?token=curto`
    },
  }
  const logs: Record<string, unknown>[] = []
  const handle = createHandler({
    db,
    storage,
    appOrigin: 'https://app.test',
    maxBytes: options.maxBytes,
    log: (f) => logs.push(f),
  })
  return { handle, calls, logs }
}

function uploadRequest(bytes: Uint8Array<ArrayBuffer>, name = 'print da reunião.png', fields: Record<string, string> = {}) {
  const form = new FormData()
  form.set('sequenceId', fields.sequenceId ?? SEQUENCE)
  form.set('stepId', fields.stepId ?? 'passo-1')
  form.set('file', new File([bytes], name, { type: 'image/png' }))
  return new Request('https://functions.test/sequence-attachments', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', apikey: 'anon' },
    body: form,
  })
}

function urlRequest(body: unknown) {
  return new Request('https://functions.test/sequence-attachments', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', apikey: 'anon', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

Deno.test('o tipo vem dos primeiros bytes: imagem e MP4 passam, MOV e PDF não', () => {
  assertEquals(detectMime(PNG), 'image/png')
  assertEquals(detectMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg')
  assertEquals(detectMime(new TextEncoder().encode('GIF89a......')), 'image/gif')
  assertEquals(detectMime(new TextEncoder().encode('RIFF....WEBPVP8 ')), 'image/webp')
  assertEquals(detectMime(MP4), 'video/mp4')
  assertEquals(detectMime(MOV), null)
  assertEquals(detectMime(PDF), null)
})

Deno.test('o titular sobe uma imagem: o banco confere antes, o arquivo vai para o bucket privado e fica guardado', async () => {
  const { handle, calls, logs } = fakes()
  const res = await handle(uploadRequest(PNG))
  assertEquals(res.status, 201)
  assertEquals(await res.json(), { id: ATTACHMENT, tipo: 'imagem', mime: 'image/png', tamanho: PNG.length })
  assertEquals(calls.register, [{
    sequenceId: SEQUENCE,
    stepId: 'passo-1',
    fileName: 'print da reunião.png',
    mimeType: 'image/png',
    sizeBytes: PNG.length,
  }])
  assertEquals(calls.uploaded, [{ path: `anexos/${SEQUENCE}/${ATTACHMENT}/arquivo`, size: PNG.length, contentType: 'image/png' }])
  assertEquals(calls.stored, [ATTACHMENT])
  // O log nunca leva o nome do arquivo.
  assertEquals(JSON.stringify(logs).includes('reunião'), false)
})

Deno.test('o tipo declarado pelo navegador não vale: um PDF com nome de imagem é recusado sem tocar o banco', async () => {
  const { handle, calls } = fakes()
  const res = await handle(uploadRequest(PDF, 'foto.png'))
  assertEquals(res.status, 400)
  assertEquals(calls.register.length, 0)
  assertEquals(calls.uploaded.length, 0)
})

Deno.test('um MP4 sobe como vídeo', async () => {
  const { handle } = fakes()
  const res = await handle(uploadRequest(MP4, 'demo.mp4'))
  assertEquals(res.status, 201)
  assertEquals((await res.json()).tipo, 'video')
})

Deno.test('a recusa do banco (outro participante, limite do canal, módulo desligado) não grava nada no Storage', async () => {
  for (
    const [error, status] of [
      [Object.assign(new Error('sequence not found or not owned by active user'), { code: '42501' }), 403],
      [Object.assign(new Error('attachment too large for this channel'), { code: '22023' }), 400],
      [Object.assign(new Error('sequence attachments are not enabled'), { code: '0A000' }), 409],
    ] as const
  ) {
    const { handle, calls } = fakes({ register: error })
    const res = await handle(uploadRequest(PNG))
    assertEquals(res.status, status)
    assertEquals(calls.uploaded.length, 0)
  }
  const { handle } = fakes({ register: Object.assign(new Error('too many attachments on this step'), { code: '22023' }) })
  assertEquals((await (await handle(uploadRequest(PNG))).json()).error, 'Este passo já tem o máximo de anexos que o canal aceita.')
})

Deno.test('o upload que falha descarta o registro pendente, para não sobrar arquivo pela metade', async () => {
  const { handle, calls } = fakes({ upload: new Error('storage down') })
  const res = await handle(uploadRequest(PNG))
  assertEquals(res.status, 502)
  assertEquals(calls.stored.length, 0)
  assertEquals(calls.discarded, [ATTACHMENT])
})

Deno.test('arquivo acima do teto de qualquer canal nem chega ao banco', async () => {
  const { handle, calls } = fakes({ maxBytes: 8 })
  const res = await handle(uploadRequest(PNG))
  assertEquals(res.status, 400)
  assertEquals(calls.register.length, 0)
})

Deno.test('sem sessão, nada sobe nem abre', async () => {
  const { handle, calls } = fakes({ user: false })
  assertEquals((await handle(uploadRequest(PNG))).status, 401)
  assertEquals((await handle(urlRequest({ action: 'url', attachmentId: ATTACHMENT }))).status, 401)
  assertEquals(calls.register.length + calls.signed.length, 0)
})

Deno.test('o titular abre o anexo por uma URL assinada curta', async () => {
  const { handle, calls } = fakes()
  const res = await handle(urlRequest({ action: 'url', attachmentId: ATTACHMENT }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), {
    url: `https://storage.test/sign/anexos/${SEQUENCE}/${ATTACHMENT}/arquivo?token=curto`,
    expiresIn: 120,
  })
  assertEquals(calls.signed, [{ path: `anexos/${SEQUENCE}/${ATTACHMENT}/arquivo`, expiresIn: 120 }])
})

Deno.test('outro participante não recebe URL nenhuma', async () => {
  const { handle, calls } = fakes({
    path: Object.assign(new Error('attachment not found or not owned by active user'), { code: '42501' }),
  })
  const res = await handle(urlRequest({ action: 'url', attachmentId: ATTACHMENT }))
  assertEquals(res.status, 403)
  assertEquals(calls.signed.length, 0)
})
