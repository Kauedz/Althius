// Peças que as duas versões repartem. Nada aqui chama a Unipile.
import { UnipileUnreadableResponse } from './errors.ts'
import { type ZodTypeAny, z } from './zod.ts'

/**
 * Um id lido solto: texto não vazio (sem espaços nas pontas) ou número finito, que vira texto; qualquer outra coisa fica
 * `undefined`. É o `firstString` de antes, agora dentro do schema: um campo "não confirmado" nunca derruba a leitura,
 * só deixa de contar, e o `refine` de cada resposta exige que ao menos um dos ids possíveis tenha vindo.
 */
export const looseId = z.unknown().transform((value): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
})

export const nonBlank = z.string().trim().min(1)

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const emailAddress = z.string().trim().regex(EMAIL_ADDRESS)

export const httpsUrl = z.string().url().startsWith('https://')

export const isoDateTime = z.string().datetime()

/** O anexo no corpo do envio: o conteúdo em base64 (canais-10). */
export const outgoingAttachment = z.object({ filename: nonBlank, content_type: nonBlank, content: nonBlank })

export const customHeaders = z.array(z.object({ name: nonBlank, value: z.string() }))

/** Uma chamada de DELETE responde com um objeto (ou nada que importe): só uma resposta que não é objeto é ilegível. */
export const acknowledgement = z.object({}).passthrough()

/** Os ids de um envio de mensagem. Sem nenhum deles, a resposta é ilegível. */
export const chatSentResponse = z.object({ chat_id: looseId, message_id: looseId, id: looseId })
  .refine((value) => value.chat_id !== undefined || value.message_id !== undefined || value.id !== undefined, {
    message: 'nenhum id',
  })
  .transform((value) => ({
    chat_id: value.chat_id ?? null,
    message_id: value.message_id ?? null,
    id: value.id ?? null,
  }))

/** Itens de uma lista de mensagens: só os objetos valem; o resto é descartado. */
export const recordList = z.array(z.unknown()).transform((items) =>
  items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
)

/** O perfil do LinkedIn, solto: a distância de rede tem vários nomes e formatos (ver readLinkedInProfile). */
export const profileDistanceFields = {
  network_distance: z.unknown(),
  distance: z.unknown(),
  connection_degree: z.unknown(),
  relation: z.unknown(),
  is_connection: z.unknown(),
}

/** Lê com o schema ou lança `UnipileUnreadableResponse` com os caminhos que falharam (nunca os valores). */
export function readResponse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data)
  if (parsed.success) return parsed.data
  throw new UnipileUnreadableResponse(parsed.error.issues.map((issue) => issue.path.join('.') || 'resposta'))
}
