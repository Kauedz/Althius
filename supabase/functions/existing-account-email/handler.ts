// O e-mail para quem tenta se cadastrar com um e-mail que já tem conta (autenticacao-google-email 03). O Supabase Auth
// responde a esse cadastro como a um cadastro novo, para a tela não revelar quem tem conta, mas não manda nada; a tela
// chama esta função em silêncio. Ela não exige sessão: quem pede ainda não entrou. Por isso responde sempre o mesmo 202
// e faz o trabalho depois da resposta, para nem o corpo nem o tempo da resposta dizerem se o e-mail tem conta. Depois,
// reserva o aviso no banco com a chave de serviço (claim_existing_account_notice): o banco confere que o e-mail tem
// Conta de usuário confirmada e os limites de avisos, para a função não virar canal de spam contra a caixa de alguém.
// Só então o e-mail sai pelo provedor (Resend). Banco, provedor e o segundo plano entram por injeção de dependência.
import { comCors, origemDoAppParaLink } from '../_shared/cors.ts'
import { type Mail, MailRequestError } from '../workspace-invitation-email/handler.ts'

/** O e-mail como o provedor o envia. */
type Email = Parameters<Mail['send']>[0]

export interface Db {
  /**
   * RPC claim_existing_account_notice, com a chave de serviço: quando o e-mail tem Conta de usuário confirmada e o aviso
   * cabe nos limites, grava a reserva e devolve o e-mail guardado na conta, para onde o aviso vai; null quando não há o
   * que avisar. Lança quando o banco falha.
   */
  claimNotice(email: string): Promise<string | null>
}

export interface Deps {
  db: Db
  mail: Mail
  appOrigin: string
  /** O remetente, ex.: "Althius <contato@althius.com.br>". */
  from: string
  /** Continua um trabalho depois da resposta (EdgeRuntime.waitUntil). */
  waitUntil: (trabalho: Promise<unknown>) => void
  log?: (fields: Record<string, unknown>) => void
}

/** Um endereço de e-mail plausível, no tamanho que o Supabase Auth aceita; a conta é conferida no banco. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TAMANHO_MAXIMO_DO_EMAIL = 254

function escaparHtml(texto: string) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function montarAviso(email: string, origem: string, from: string): Email {
  const entrar = `${origem}/entrar`
  const definirSenha = `${origem}/esqueci-a-senha`
  const text = [
    `Alguém tentou criar uma conta na Althius com este e-mail (${email}), mas ele já tem uma conta na Althius.`,
    '',
    'Para entrar, use este mesmo e-mail com Google, com a sua senha ou com um código enviado por e-mail:',
    entrar,
    '',
    'Se não lembra a senha, ou até hoje só entrou com Google, defina uma senha aqui:',
    definirSenha,
    '',
    'Se não foi você, ignore este e-mail: nada mudou na sua conta.',
  ].join('\n')
  const html = [
    '<h2>Você já tem conta na Althius</h2>',
    `<p>Alguém tentou criar uma conta na Althius com este e-mail (${
      escaparHtml(email)
    }), mas ele já tem uma conta na Althius.</p>`,
    '<p>Para entrar, use este mesmo e-mail com Google, com a sua senha ou com um código enviado por e-mail:</p>',
    `<p><a href="${escaparHtml(entrar)}">Entrar na Althius</a></p>`,
    '<p>Se não lembra a senha, ou até hoje só entrou com Google, defina uma senha:</p>',
    `<p><a href="${escaparHtml(definirSenha)}">Definir uma senha</a></p>`,
    '<p>Se não foi você, ignore este e-mail: nada mudou na sua conta.</p>',
  ].join('\n')
  return { from, to: email, subject: 'Você já tem conta na Althius', text, html }
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))

  function respond(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  /** O que acontece depois da resposta. O log nunca leva o e-mail. */
  async function avisar(email: string, origem: string) {
    let destinatario: string | null
    try {
      destinatario = await deps.db.claimNotice(email)
    } catch (error) {
      log({ type: 'existing_account_email', outcome: 'claim_failed', message: String(error) })
      return
    }
    if (!destinatario) {
      log({ type: 'existing_account_email', outcome: 'skipped' })
      return
    }
    try {
      const { id } = await deps.mail.send(montarAviso(destinatario, origem, deps.from))
      log({ type: 'existing_account_email', outcome: 'sent', providerId: id })
    } catch (error) {
      if (error instanceof MailRequestError) {
        log({ type: 'existing_account_email', outcome: 'refused', status: error.status, detail: error.detail })
      } else {
        log({ type: 'existing_account_email', outcome: 'uncertain' })
      }
    }
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Corpo inválido.' }, 400)
    }
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    if (email.length > TAMANHO_MAXIMO_DO_EMAIL || !EMAIL.test(email)) {
      return respond({ error: 'Informe um e-mail válido.' }, 400)
    }

    deps.waitUntil(avisar(email, origemDoAppParaLink(req, deps.appOrigin)))
    return respond({ accepted: true }, 202)
  })
}
