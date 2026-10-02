// Os anexos de um passo no envio (canais-10), compartilhados pelo E-mail (send-step.ts) e pelo WhatsApp e LinkedIn
// (send-chat-step.ts). Depois de o banco liberar o Envio, o núcleo pede os arquivos do passo da versão autorizada
// (step_send_attachments, que confere de novo formato, tamanho e quantidade pelo canal), baixa cada um do bucket
// privado e o leva no corpo da chamada à Unipile v2. Um anexo que não serve ao canal não sai: o Envio falha com o
// motivo (fail_step_send_for_attachment), sem nova tentativa. Uma falha ao baixar é passageira: o Envio falha como uma
// recusa do provedor e o Executor tenta de novo. Nome e conteúdo do arquivo nunca vão para log nem para erro.

/** Um arquivo do passo, como o banco o devolve. */
export interface StepAttachment {
  attachment_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

export interface StepAttachmentSource {
  /** RPC step_send_attachments: os arquivos do passo, ou o motivo que impede o envio deles. */
  forSend(sendId: string): Promise<{ problem: string } | { files: StepAttachment[] }>
  /** Baixa um arquivo do bucket privado sequence-attachments, com a chave de serviço. */
  download(storagePath: string): Promise<Uint8Array>
  /** RPC fail_step_send_for_attachment: o Envio em voo fica falho com o motivo, sem nova tentativa. */
  failSend(sendId: string, problem: string): Promise<void>
}

/**
 * Um anexo no JSON de envio da Unipile v2, com o conteúdo em base64 (spec canais-cadencia-backend, "Anexos").
 * não confirmado: os nomes dos campos no envio de e-mail e de mensagem da v2 (`filename`, `content_type`, `content`)
 * e o campo da lista (`attachments`, em OutgoingEmail e no corpo das mensagens). Se a Unipile recusar, a correção é
 * aqui e nos adaptadores.
 */
export interface OutgoingAttachment {
  filename: string
  content_type: string
  content: string
}


export type PreparedAttachments =
  /** Nada a anexar, ou os arquivos prontos para a chamada. */
  | { kind: 'ready'; attachments: OutgoingAttachment[] }
  /** O anexo não serve ao canal (ou sumiu): o Envio não sai e falha com este motivo, sem nova tentativa. */
  | { kind: 'invalid'; problem: string }
  /** Não deu para ler ou baixar agora: o Envio falha como uma recusa passageira e é tentado de novo. */
  | { kind: 'unavailable' }

/** Base64 sem estourar a pilha num arquivo grande. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function prepareAttachments(
  source: StepAttachmentSource | undefined,
  sendId: string,
): Promise<PreparedAttachments> {
  if (!source) return { kind: 'ready', attachments: [] }
  let listed: { problem: string } | { files: StepAttachment[] }
  try {
    listed = await source.forSend(sendId)
  } catch {
    return { kind: 'unavailable' }
  }
  if ('problem' in listed) return { kind: 'invalid', problem: listed.problem }
  const attachments: OutgoingAttachment[] = []
  for (const file of listed.files) {
    let bytes: Uint8Array
    try {
      bytes = await source.download(file.storage_path)
    } catch {
      return { kind: 'unavailable' }
    }
    // O arquivo do bucket tem de ser o que foi registrado: outro tamanho é um arquivo trocado por fora.
    if (bytes.length !== Number(file.size_bytes)) return { kind: 'invalid', problem: 'attachment_not_stored' }
    attachments.push({ filename: file.file_name, content_type: file.mime_type, content: toBase64(bytes) })
  }
  return { kind: 'ready', attachments }
}

/** O que a tela e o log mostram de um motivo de anexo, sem nome nem conteúdo do arquivo. */
export const ATTACHMENT_PROBLEM_MESSAGES: Record<string, string> = {
  attachment_not_stored: 'O anexo deste passo não está mais guardado. Anexe o arquivo de novo e ative os envios.',
  attachment_type_not_supported: 'O canal deste passo não aceita o tipo do anexo. Troque o arquivo e ative os envios.',
  attachment_too_large: 'O anexo passa do tamanho que o canal deste passo aceita. Troque o arquivo e ative os envios.',
  too_many_attachments: 'O passo tem mais anexos do que o canal aceita. Tire um e ative os envios.',
  attachment_not_supported_on_invite: 'O convite do LinkedIn não leva anexo. Tire o anexo ou mude o passo para mensagem.',
  attachment_not_supported: 'Este canal não aceita anexos.',
  attachment_download_failed: 'Não foi possível ler o anexo agora. O passo será tentado de novo.',
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

interface StorageClient {
  storage: {
    from(bucket: string): { download(path: string): PromiseLike<{ data: Blob | null; error: unknown }> }
  }
}

export const SEQUENCE_ATTACHMENTS_BUCKET = 'sequence-attachments'

/** O adaptador real: as RPCs com o cliente service_role e o bucket privado. */
export function stepAttachmentSourceVia(admin: RpcClient & StorageClient): StepAttachmentSource {
  return {
    async forSend(sendId) {
      const { data, error } = await admin.rpc('step_send_attachments', { p_send_id: sendId })
      // Sem a migration do canais-10 aplicada, nenhum documento tem anexo (a tela nem oferece): o passo sai só com o
      // texto, como antes, em vez de travar todos os envios por uma função que ainda não existe.
      const code = (error as { code?: string } | null)?.code
      if (code === 'PGRST202' || code === '42883') return { files: [] }
      if (error) throw error
      const rows = (Array.isArray(data) ? data : []) as (Partial<StepAttachment> & { problem?: string | null })[]
      const problem = rows.find((row) => row.problem)?.problem
      if (problem) return { problem }
      return {
        files: rows.filter((row) => !!row.storage_path).map((row) => ({
          attachment_id: String(row.attachment_id),
          storage_path: String(row.storage_path),
          file_name: String(row.file_name ?? 'anexo'),
          mime_type: String(row.mime_type),
          size_bytes: Number(row.size_bytes),
        })),
      }
    },
    async download(storagePath) {
      const { data, error } = await admin.storage.from(SEQUENCE_ATTACHMENTS_BUCKET).download(storagePath)
      if (error || !data) throw error ?? new Error('attachment download failed')
      return new Uint8Array(await data.arrayBuffer())
    },
    async failSend(sendId, problem) {
      const { error } = await admin.rpc('fail_step_send_for_attachment', { p_send_id: sendId, p_problem: problem })
      if (error) throw error
    },
  }
}
