// O link público de descadastro (verify_jwt = false). O token é o único dado: aleatório, de um Envio, sem ids.
// GET (o Contato clicou no rodapé) leva à página do app, que pede a confirmação em pt-BR: o Supabase não serve HTML
// no domínio padrão das functions, e um GET não registra nada (leitores de link dos provedores abrem URLs sozinhos).
// POST registra: o clique único do provedor (List-Unsubscribe-Post, RFC 8058) ou a confirmação da página do app.
// Registrar é idempotente: o mesmo token responde 'already_registered'.
import { comCors } from '../_shared/cors.ts'

export type UnsubscribeOutcome = 'registered' | 'already_registered' | 'invalid'

export interface Db {
  /** RPC unsubscribe_by_token: grava a Supressão, cancela os passos pendentes e pausa a Sequência (motivo Descadastro). */
  unsubscribe(token: string): Promise<UnsubscribeOutcome>
}

export interface Deps {
  db: Db
  appOrigin: string
}

const TOKEN = /^[A-Za-z0-9_-]{1,128}$/

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const app = deps.appOrigin.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)[0] ?? ''
  const respond = (outcome: UnsubscribeOutcome | 'error', status: number) =>
    new Response(JSON.stringify({ outcome }), { status, headers: { 'Content-Type': 'application/json' } })

  return comCors(deps.appOrigin, async (req) => {
    const url = new URL(req.url)
    if (req.method === 'GET') {
      const t = url.searchParams.get('t') ?? ''
      return new Response(null, { status: 302, headers: { Location: `${app}/descadastro?t=${encodeURIComponent(t)}` } })
    }
    if (req.method !== 'POST') return respond('error', 405)

    let token = url.searchParams.get('t') ?? ''
    if (!token && (req.headers.get('Content-Type') ?? '').includes('application/json')) {
      try {
        const body = await req.json()
        token = typeof body?.token === 'string' ? body.token : ''
      } catch {
        token = ''
      }
    }
    // Um token malformado nem chega ao banco (o banco gera 64 caracteres hexadecimais).
    if (!TOKEN.test(token)) return respond('invalid', 404)
    try {
      const outcome = await deps.db.unsubscribe(token)
      return respond(outcome, outcome === 'invalid' ? 404 : 200)
    } catch {
      return respond('error', 500)
    }
  })
}
