// Os anexos das Conversas dos Agentes (PR-10). Quem pede sobe o arquivo por aqui: a função lê o tipo pelos bytes,
// extrai o texto dos documentos, o banco confere a Participação com o JWT dessa pessoa (register_agent_attachment) e só
// então o arquivo vai para o bucket privado, com a chave de serviço. Abrir um anexo devolve uma URL assinada curta,
// também só depois de o banco conferir que é de quem pede. Remover tira um anexo ainda não enviado.
import { comCors } from '../_shared/cors.ts'
import { detectarMime, ehImagem, extrairTexto, type Mime, TAMANHO_MAXIMO } from './extracao.ts'

export interface Registrado {
  attachmentId: string
  storagePath: string
}

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC register_agent_attachment com o JWT de quem pede. Lança com code (42501, 22023) quando recusa. */
  registrar(
    authorization: string,
    apikey: string,
    input: { workspaceId: string; fileName: string; mime: Mime; size: number; extractedText: string | null },
  ): Promise<Registrado>
  marcarGuardado(attachmentId: string): Promise<void>
  descartarPendente(attachmentId: string): Promise<void>
  /** RPC get_agent_attachment_path com o JWT. Lança com code P0002 quando não é de quem pede. */
  caminhoDoAnexo(authorization: string, apikey: string, attachmentId: string): Promise<string>
  /** RPC remove_agent_attachment com o JWT. */
  remover(authorization: string, apikey: string, attachmentId: string): Promise<boolean>
}

export interface Armazenamento {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>
}

export interface Deps {
  db: Db
  storage: Armazenamento
  appOrigin: string
  lerPdf: (bytes: Uint8Array) => Promise<string>
  expiresInSeconds?: number
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const expiresIn = deps.expiresInSeconds ?? 300
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  function recusa(error: unknown): Response {
    const code = (error as { code?: string })?.code
    const message = (error as { message?: string })?.message ?? ''
    if (code === '42501') return respond({ error: 'Você não participa deste Workspace.' }, 403)
    if (code === 'P0002') return respond({ error: 'Anexo não encontrado.' }, 404)
    if (code === '22023') {
      if (message.includes('too large')) return respond({ error: 'Cada arquivo pode ter até 10 MB.' }, 400)
      if (message.includes('pending')) {
        return respond({ error: 'Há anexos demais esperando envio. Envie ou remova alguns antes de anexar outros.' }, 400)
      }
      return respond({ error: 'Este tipo de arquivo não pode ser anexado.' }, 400)
    }
    return respond({ error: 'Não foi possível concluir. Tente de novo.' }, 500)
  }

  async function subir(req: Request, authorization: string, apikey: string): Promise<Response> {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const workspaceId = String(form.get('workspaceId') ?? '')
    const file = form.get('file')
    if (!UUID.test(workspaceId)) return respond({ error: 'Workspace obrigatório.' }, 400)
    if (!(file instanceof File)) return respond({ error: 'Arquivo obrigatório.' }, 400)
    if (file.size <= 0) return respond({ error: 'O arquivo está vazio.' }, 400)
    if (file.size > TAMANHO_MAXIMO) return respond({ error: 'Cada arquivo pode ter até 10 MB.' }, 400)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = detectarMime(bytes, file.name || '')
    if (!mime) {
      return respond({ error: 'Só imagens (PNG, JPG, WebP), PDF, CSV, TXT, DOCX e XLSX podem ser anexados.' }, 400)
    }
    const extractedText = await extrairTexto(bytes, mime, deps.lerPdf)

    let registrado: Registrado
    try {
      registrado = await deps.db.registrar(authorization, apikey, {
        workspaceId,
        fileName: file.name || 'anexo',
        mime,
        size: bytes.length,
        extractedText,
      })
    } catch (error) {
      log({ type: 'agent_attachment', outcome: 'refused', code: (error as { code?: string })?.code ?? null })
      return recusa(error)
    }
    try {
      await deps.storage.upload(registrado.storagePath, bytes, mime)
      await deps.db.marcarGuardado(registrado.attachmentId)
    } catch {
      await deps.db.descartarPendente(registrado.attachmentId).catch(() => {})
      log({ type: 'agent_attachment', outcome: 'storage_failed' })
      return respond({ error: 'Não foi possível guardar o arquivo. Tente de novo.' }, 502)
    }
    log({ type: 'agent_attachment', outcome: 'stored', mime, size: bytes.length, texto: extractedText?.length ?? 0 })
    return respond({
      id: registrado.attachmentId,
      tipo: ehImagem(mime) ? 'imagem' : 'arquivo',
      mime,
      tamanho: bytes.length,
      // Um documento sem texto legível (um PDF escaneado, por exemplo) vai como arquivo, sem conteúdo para o modelo.
      semTexto: !ehImagem(mime) && !extractedText,
    }, 201)
  }

  async function acao(req: Request, authorization: string, apikey: string): Promise<Response> {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const attachmentId = typeof body?.attachmentId === 'string' ? body.attachmentId : ''
    if (!UUID.test(attachmentId)) return respond({ error: 'Anexo obrigatório.' }, 400)
    if (body?.action === 'remove') {
      try {
        return respond({ removed: await deps.db.remover(authorization, apikey, attachmentId) })
      } catch (error) {
        return recusa(error)
      }
    }
    if (body?.action !== 'url') return respond({ error: 'Ação não reconhecida.' }, 400)
    let path: string
    try {
      path = await deps.db.caminhoDoAnexo(authorization, apikey, attachmentId)
    } catch (error) {
      return recusa(error)
    }
    try {
      return respond({ url: await deps.storage.createSignedUrl(path, expiresIn), expiresIn })
    } catch {
      return respond({ error: 'Não foi possível gerar o acesso ao anexo.' }, 502)
    }
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)
    const type = req.headers.get('content-type') ?? ''
    return type.startsWith('multipart/form-data') ? subir(req, authorization, apikey) : acao(req, authorization, apikey)
  })
}
