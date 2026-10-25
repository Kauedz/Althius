import { comCors } from '../_shared/cors.ts'

export type Ambiente = (nome: string) => string | undefined

export function adaptadorConfigurado(ambiente: Ambiente): boolean {
  if (ambiente('CANAL_WHATSAPP_MODE') !== 'cloud') return true
  return [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_API_VERSION',
    'WHATSAPP_APP_SECRET',
  ].every((nome) => Boolean(ambiente(nome)))
}

export function createHandler(deps: { appOrigin: string; ambiente: Ambiente }) {
  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405 })
    return Response.json({ configurado: adaptadorConfigurado(deps.ambiente) })
  })
}
