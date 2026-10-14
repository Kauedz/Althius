import { assertEquals } from 'jsr:@std/assert@1'
import { type Armazenamento, createHandler, type Db } from './handler.ts'

const WS = '70000000-0000-0000-0000-000000000001'
const ANEXO = '71000000-0000-0000-0000-000000000001'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3])

function montar(opcoes: { user?: boolean; registrar?: Error; upload?: Error; caminho?: Error } = {}) {
  const chamadas: Record<string, unknown[]> = { registrar: [], guardado: [], descartado: [], upload: [], assinado: [], removido: [] }
  const db: Db = {
    userFromJwt: async () => (opcoes.user === false ? null : { userId: 'u1' }),
    registrar: async (_a, _k, input) => {
      chamadas.registrar.push(input)
      if (opcoes.registrar) throw opcoes.registrar
      return { attachmentId: ANEXO, storagePath: `conversas/${WS}/${ANEXO}/arquivo` }
    },
    marcarGuardado: async (id) => void chamadas.guardado.push(id),
    descartarPendente: async (id) => void chamadas.descartado.push(id),
    caminhoDoAnexo: async () => {
      if (opcoes.caminho) throw opcoes.caminho
      return `conversas/${WS}/${ANEXO}/arquivo`
    },
    remover: async (_a, _k, id) => {
      chamadas.removido.push(id)
      return true
    },
  }
  const storage: Armazenamento = {
    upload: async (path, bytes, contentType) => {
      if (opcoes.upload) throw opcoes.upload
      chamadas.upload.push({ path, tamanho: bytes.length, contentType })
    },
    createSignedUrl: async (path, expiresIn) => {
      chamadas.assinado.push({ path, expiresIn })
      return `https://storage.test/${path}?token=curto`
    },
  }
  const logs: Record<string, unknown>[] = []
  const handler = createHandler({
    db,
    storage,
    appOrigin: 'https://app.test',
    lerPdf: async () => 'texto do pdf',
    log: (f) => void logs.push(f),
  })
  return { handler, chamadas, logs }
}

const headers = { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.test' }

function upload(bytes: Uint8Array<ArrayBuffer>, nome: string, workspaceId = WS) {
  const form = new FormData()
  form.set('workspaceId', workspaceId)
  form.set('file', new File([bytes], nome))
  return new Request('https://functions.test/agent-attachments', { method: 'POST', headers, body: form })
}

const json = (body: unknown) =>
  new Request('https://functions.test/agent-attachments', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

Deno.test('sobe uma imagem: tipo pelos bytes, registro com o JWT, bucket e marca guardado', async () => {
  const { handler, chamadas, logs } = montar()
  const resposta = await handler(upload(PNG, 'proposta.pdf'))
  assertEquals(resposta.status, 201)
  assertEquals(await resposta.json(), { id: ANEXO, tipo: 'imagem', mime: 'image/png', tamanho: PNG.length, semTexto: false })
  assertEquals(chamadas.registrar, [{ workspaceId: WS, fileName: 'proposta.pdf', mime: 'image/png', size: PNG.length, extractedText: null }])
  assertEquals(chamadas.upload, [{ path: `conversas/${WS}/${ANEXO}/arquivo`, tamanho: PNG.length, contentType: 'image/png' }])
  assertEquals(chamadas.guardado, [ANEXO])
  assertEquals(JSON.stringify(logs).includes('proposta'), false)
})

Deno.test('um texto vai com o conteúdo extraído para o registro', async () => {
  const { handler, chamadas } = montar()
  const resposta = await handler(upload(new TextEncoder().encode('a;b\n1;2'), 'dados.csv'))
  assertEquals(resposta.status, 201)
  assertEquals((chamadas.registrar[0] as { mime: string; extractedText: string }).mime, 'text/csv')
  assertEquals((chamadas.registrar[0] as { extractedText: string }).extractedText, 'a;b\n1;2')
})

Deno.test('recusa sem sessão, sem Workspace, tipo fora da lista e acima de 10 MB, sem tocar no Storage', async () => {
  assertEquals((await montar({ user: false }).handler(upload(PNG, 'a.png'))).status, 401)
  const { handler, chamadas } = montar()
  assertEquals((await handler(upload(PNG, 'a.png', 'x'))).status, 400)
  assertEquals((await handler(upload(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]), 'v.mp4'))).status, 400)
  const grande = new Uint8Array(10 * 1024 * 1024 + 1)
  grande.set(PNG)
  const resposta = await handler(upload(grande, 'g.png'))
  assertEquals(resposta.status, 400)
  assertEquals((await resposta.json()).error, 'Cada arquivo pode ter até 10 MB.')
  assertEquals(chamadas.upload, [])
})

Deno.test('o banco recusa: a tela recebe o motivo em português', async () => {
  const fora = montar({ registrar: Object.assign(new Error('x'), { code: '42501' }) })
  assertEquals((await fora.handler(upload(PNG, 'a.png'))).status, 403)
  assertEquals(fora.chamadas.upload, [])
  const demais = montar({ registrar: Object.assign(new Error('too many pending attachments'), { code: '22023' }) })
  const resposta = await demais.handler(upload(PNG, 'a.png'))
  assertEquals(resposta.status, 400)
  assertEquals((await resposta.json()).error.startsWith('Há anexos demais'), true)
})

Deno.test('o Storage falha: o registro pendente é descartado', async () => {
  const { handler, chamadas } = montar({ upload: new Error('caiu') })
  assertEquals((await handler(upload(PNG, 'a.png'))).status, 502)
  assertEquals(chamadas.descartado, [ANEXO])
  assertEquals(chamadas.guardado, [])
})

Deno.test('abrir devolve uma URL assinada curta, só do anexo de quem pede', async () => {
  const { handler, chamadas } = montar()
  const resposta = await handler(json({ action: 'url', attachmentId: ANEXO }))
  assertEquals(resposta.status, 200)
  assertEquals((await resposta.json()).expiresIn, 300)
  assertEquals(chamadas.assinado, [{ path: `conversas/${WS}/${ANEXO}/arquivo`, expiresIn: 300 }])
  const alheio = montar({ caminho: Object.assign(new Error('x'), { code: 'P0002' }) })
  assertEquals((await alheio.handler(json({ action: 'url', attachmentId: ANEXO }))).status, 404)
  assertEquals((await handler(json({ action: 'url', attachmentId: 'x' }))).status, 400)
})

Deno.test('remover tira o anexo ainda não enviado', async () => {
  const { handler, chamadas } = montar()
  const resposta = await handler(json({ action: 'remove', attachmentId: ANEXO }))
  assertEquals(await resposta.json(), { removed: true })
  assertEquals(chamadas.removido, [ANEXO])
  assertEquals((await handler(json({ action: 'outra', attachmentId: ANEXO }))).status, 400)
})
