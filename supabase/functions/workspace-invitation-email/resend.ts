// O envio pelo Resend (POST https://api.resend.com/emails). Fora de 2xx, o Resend recusou e o e-mail não saiu
// (MailRequestError); um 2xx sem o id do e-mail, uma falha de rede ou o prazo esgotado deixam o envio incerto.
import { type Mail, MailRequestError } from './handler.ts'

export function resendMail(apiKey: string, { fetchFn = fetch, timeoutMs = 15_000 } = {}): Mail {
  return {
    async send(email) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const resposta = await fetchFn('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: email.from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
          signal: controller.signal,
        })
        const corpo = await resposta.json().catch(() => ({})) as { id?: string; message?: string }
        if (!resposta.ok) throw new MailRequestError(resposta.status, String(corpo.message ?? ''))
        if (typeof corpo.id !== 'string' || !corpo.id) throw new Error('Resend respondeu 2xx sem o id do e-mail')
        return { id: corpo.id }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
