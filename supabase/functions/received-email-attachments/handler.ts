// URL assinada de um anexo recebido (canais-04). Só o titular da Sequência lê o anexo: a RPC
// get_received_email_attachment_path decide pelo auth.uid(), e o Storage só é tocado depois dela.
// O banco e o Storage entram por injeção de dependência, para o teste ir da requisição à resposta.
import { comCors } from '../_shared/cors.ts'

export interface AttachmentDb {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC get_received_email_attachment_path com o JWT do usuário. Lança com code 42501/P0002 quando recusa. */
  attachmentPathForUser(
    authorization: string,
    apikey: string,
    interactionId: string,
    attachmentId: string,
  ): Promise<string>
}

export interface AttachmentSigner {
  /** URL assinada do bucket privado, válida por poucos minutos. */
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>
}

export interface Deps {
  db: AttachmentDb
  signer: AttachmentSigner
  appOrigin: string
  expiresInSeconds?: number
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
// Ids de anexo do Outlook (Microsoft Graph) passam fácil de 200 caracteres; o teto só barra abuso.
const MAX_ATTACHMENT_ID = 4096

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const expiresIn = deps.expiresInSeconds ?? 300

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return respond({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const interactionId = typeof body?.interactionId === 'string' ? body.interactionId : ''
    const attachmentId = typeof body?.attachmentId === 'string' ? body.attachmentId.trim() : ''
    if (!UUID.test(interactionId)) return respond({ error: 'Interação obrigatória.' }, 400)
    if (!attachmentId || attachmentId.length > MAX_ATTACHMENT_ID) return respond({ error: 'Anexo obrigatório.' }, 400)

    let path: string
    try {
      path = await deps.db.attachmentPathForUser(authorization, apikey, interactionId, attachmentId)
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === '42501') return respond({ error: 'Só o responsável pela Sequência abre este anexo.' }, 403)
      if (code === 'P0002') return respond({ error: 'Anexo ainda não disponível.' }, 404)
      return respond({ error: 'Não foi possível localizar o anexo.' }, 500)
    }

    try {
      const url = await deps.signer.createSignedUrl(path, expiresIn)
      return respond({ url, expiresIn })
    } catch {
      return respond({ error: 'Não foi possível gerar o acesso ao anexo.' }, 502)
    }
  })
}
