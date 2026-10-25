import type { AdaptadorCanal } from '../_shared/canal/index.ts'

export interface Db {
  getUser(token: string): Promise<{ id: string; email: string } | null>
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>
}
export interface Mail { send(input: { to: string; subject: string; html: string }): Promise<unknown> }
interface Dependencies {
  db: Db
  canal: AdaptadorCanal
  mail: Mail
  template: string
}

const resposta = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** As operações sensíveis usam service role somente depois de validar a sessão do próprio participante. */
export function createHandler({ db, canal, mail, template }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return resposta({ error: 'Método não permitido.' }, 405)
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return resposta({ error: 'Sessão necessária.' }, 401)
    const user = await db.getUser(token).catch(() => null)
    if (!user) return resposta({ error: 'Sessão inválida.' }, 401)

    let body: { action?: string; phone?: string; code?: string }
    try { body = await request.json() } catch { return resposta({ error: 'Pedido inválido.' }, 400) }
    const args = { p_user_id: user.id }
    try {
      if (body.action === 'start' || body.action === 'change') {
        const phone = body.phone?.replace(/[\s().-]/g, '')
        if (!phone) return resposta({ error: 'Informe um telefone no formato internacional.' }, 400)
        const code = await db.rpc(body.action === 'start' ? 'start_my_channel_phone_verification' : 'change_my_channel_phone', { ...args, p_phone_e164: phone }) as string
        await canal.enviarTemplate({ para: phone.slice(1), nome: template, idioma: 'pt_BR', parametros: [code], categoria: 'autenticacao' })
        return resposta({ ok: true })
      }
      if (body.action === 'resend') {
        const code = await db.rpc('resend_my_channel_phone_verification', args) as string
        const phone = await db.rpc('get_my_channel_phone_pending', args) as string
        await canal.enviarTemplate({ para: phone.slice(1), nome: template, idioma: 'pt_BR', parametros: [code], categoria: 'autenticacao' })
        return resposta({ ok: true })
      }
      if (body.action === 'confirm') {
        const [verified] = await db.rpc('confirm_my_channel_phone', { ...args, p_code: body.code }) as { phone_e164: string; email: string }[]
        if (!verified) throw new Error('invalid verification code')
        try {
          await mail.send({
            to: verified.email,
            subject: 'Telefone verificado na Althius',
            html: `<p>O telefone ${verified.phone_e164} foi verificado na sua Conta Althius.</p><p>Se você não fez essa alteração, entre na sua Conta e remova o telefone.</p>`,
          })
          await db.rpc('mark_my_channel_phone_email_sent', args)
          return resposta({ ok: true, emailPending: false })
        } catch {
          return resposta({ ok: true, emailPending: true })
        }
      }
      if (body.action === 'retry-email') {
        const [notification] = await db.rpc('get_my_channel_phone_verification_email', args) as { phone_e164: string; email: string }[]
        if (!notification) return resposta({ error: 'Não há aviso de verificação pendente.' }, 400)
        await mail.send({
          to: notification.email,
          subject: 'Telefone verificado na Althius',
          html: `<p>O telefone ${notification.phone_e164} foi verificado na sua Conta Althius.</p><p>Se você não fez essa alteração, entre na sua Conta e remova o telefone.</p>`,
        })
        await db.rpc('mark_my_channel_phone_email_sent', args)
        return resposta({ ok: true, emailPending: false })
      }
      if (body.action === 'remove') {
        await db.rpc('remove_my_channel_phone', args)
        return resposta({ ok: true })
      }
      return resposta({ error: 'Ação inválida.' }, 400)
    } catch {
      return resposta({ error: 'Não foi possível atualizar o telefone. Verifique os dados e tente novamente.' }, 400)
    }
  }
}
