// Os anexos dos passos da Sequência (canais-10). O titular sobe o arquivo por aqui: a função lê o tipo pelos primeiros
// bytes (não pelo que o navegador diz), o banco confere a Sequência, o passo e os limites do canal com o JWT dele
// (register_sequence_attachment), e só então o arquivo vai para o bucket privado, com a chave de serviço. Abrir um
// anexo devolve uma URL assinada que vale poucos minutos, também só depois de o banco conferir o titular. O navegador
// nunca recebe URL pública nem fala com o Storage. Nome e conteúdo do arquivo nunca vão para o log.
import { comCors } from '../_shared/cors.ts'

export interface RegisteredAttachment {
  attachmentId: string
  storagePath: string
}

export interface SequenceAttachmentDb {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC register_sequence_attachment com o JWT do titular. Lança com code (0A000, 42501, 22023) quando recusa. */
  registerAttachment(
    authorization: string,
    apikey: string,
    input: { sequenceId: string; stepId: string; fileName: string; mimeType: string; sizeBytes: number },
  ): Promise<RegisteredAttachment>
  /** RPC mark_sequence_attachment_stored, com a chave de serviço. */
  markStored(attachmentId: string): Promise<void>
  /** RPC discard_pending_sequence_attachment, com a chave de serviço. */
  discardPending(attachmentId: string): Promise<void>
  /** RPC get_sequence_attachment_path com o JWT do titular. Lança com code 42501/P0002 quando recusa. */
  attachmentPathForUser(authorization: string, apikey: string, attachmentId: string): Promise<string>
}

export interface SequenceAttachmentStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** URL assinada do bucket privado, válida por poucos minutos. */
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>
}

export interface Deps {
  db: SequenceAttachmentDb
  storage: SequenceAttachmentStorage
  appOrigin: string
  /** Teto de qualquer canal; o do canal do passo quem confere é o banco. Padrão 16 MB. */
  maxBytes?: number
  expiresInSeconds?: number
  log?: (fields: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const STEP_ID = /^[\w.:-]{1,200}$/

/**
 * O tipo do arquivo pelos primeiros bytes. Só os que a Sequência aceita (imagem e vídeo MP4); o resto é null.
 * Um MOV (QuickTime) também começa com `ftyp`, mas com a marca `qt  `: não passa por MP4.
 */
export function detectMime(bytes: Uint8Array): string | null {
  const at = (offset: number, ...values: number[]) => values.every((v, i) => bytes[offset + i] === v)
  const ascii = (offset: number, text: string) => at(offset, ...Array.from(text, (c) => c.charCodeAt(0)))
  if (bytes.length < 12) return null
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  if (ascii(4, 'ftyp') && !ascii(8, 'qt  ')) return 'video/mp4'
  return null
}

/** O que a tela mostra quando o banco recusa: em português, sem repetir o nome do arquivo. */
const MOTIVOS_22023: [string, string][] = [
  ['attachment type not supported on this channel', 'Este tipo de arquivo não pode ser enviado por este canal.'],
  ['attachment too large for this channel', 'O arquivo passa do tamanho que este canal aceita.'],
  ['too many attachments on this step', 'Este passo já tem o máximo de anexos que o canal aceita.'],
  ['attachments are not supported on a LinkedIn invitation', 'O convite do LinkedIn não leva anexo.'],
  ['attachments are not supported on this channel', 'Este canal não aceita anexos.'],
  ['step not found', 'Salve o passo antes de anexar um arquivo.'],
]

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const maxBytes = deps.maxBytes ?? 16 * 1024 * 1024
  const expiresIn = deps.expiresInSeconds ?? 120
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  function refusal(error: unknown): Response {
    const code = (error as { code?: string })?.code
    const message = (error as { message?: string })?.message ?? ''
    if (code === '0A000') return respond({ error: 'Anexos ainda não estão disponíveis neste Workspace.' }, 409)
    if (code === '42501') return respond({ error: 'Só o Vendedor responsável pela Sequência anexa e abre os arquivos dela.' }, 403)
    if (code === 'P0002') return respond({ error: 'Anexo ainda não disponível.' }, 404)
    if (code === '22023') {
      const motivo = MOTIVOS_22023.find(([texto]) => message.includes(texto))
      return respond({ error: motivo?.[1] ?? 'O arquivo não pode ser anexado a este passo.' }, 400)
    }
    return respond({ error: 'Não foi possível concluir. Tente de novo.' }, 500)
  }

  async function upload(req: Request, authorization: string, apikey: string): Promise<Response> {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const sequenceId = String(form.get('sequenceId') ?? '')
    const stepId = String(form.get('stepId') ?? '')
    const file = form.get('file')
    if (!UUID.test(sequenceId)) return respond({ error: 'Sequência obrigatória.' }, 400)
    if (!STEP_ID.test(stepId)) return respond({ error: 'Passo obrigatório.' }, 400)
    if (!(file instanceof File)) return respond({ error: 'Arquivo obrigatório.' }, 400)
    if (file.size <= 0) return respond({ error: 'O arquivo está vazio.' }, 400)
    if (file.size > maxBytes) return respond({ error: 'O arquivo passa do tamanho que este canal aceita.' }, 400)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const mimeType = detectMime(bytes)
    if (!mimeType) return respond({ error: 'Só imagens (JPG, PNG, GIF, WebP) e vídeos MP4 podem ser anexados.' }, 400)

    let registered: RegisteredAttachment
    try {
      registered = await deps.db.registerAttachment(authorization, apikey, {
        sequenceId,
        stepId,
        fileName: file.name || 'anexo',
        mimeType,
        sizeBytes: bytes.length,
      })
    } catch (error) {
      log({ type: 'attachment_upload', outcome: 'refused', code: (error as { code?: string })?.code ?? null })
      return refusal(error)
    }

    try {
      await deps.storage.upload(registered.storagePath, bytes, mimeType)
      await deps.db.markStored(registered.attachmentId)
    } catch {
      await deps.db.discardPending(registered.attachmentId).catch(() => {})
      log({ type: 'attachment_upload', outcome: 'storage_failed' })
      return respond({ error: 'Não foi possível guardar o arquivo. Tente de novo.' }, 502)
    }
    log({ type: 'attachment_upload', outcome: 'stored', mimeType, sizeBytes: bytes.length })
    return respond({
      id: registered.attachmentId,
      tipo: mimeType.startsWith('video/') ? 'video' : 'imagem',
      mime: mimeType,
      tamanho: bytes.length,
    }, 201)
  }

  async function signedUrl(req: Request, authorization: string, apikey: string): Promise<Response> {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const attachmentId = typeof body?.attachmentId === 'string' ? body.attachmentId : ''
    if (body?.action !== 'url') return respond({ error: 'Ação não reconhecida.' }, 400)
    if (!UUID.test(attachmentId)) return respond({ error: 'Anexo obrigatório.' }, 400)
    let path: string
    try {
      path = await deps.db.attachmentPathForUser(authorization, apikey, attachmentId)
    } catch (error) {
      return refusal(error)
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
    return type.startsWith('multipart/form-data') ? upload(req, authorization, apikey) : signedUrl(req, authorization, apikey)
  })
}
