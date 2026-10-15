// A entrega da resposta no thread do Slack (slack-canal 03). Quando uma Execução com o gatilho Canal chega a um estado
// final, um gatilho no banco chama esta função pelo pg_net, sem JWT (`verify_jwt = false`), com o id da Execução e o
// segredo interno da entrega no cabeçalho `x-slack-delivery-secret`. A entrega independe do motor que rodou a Execução.
//
// A função reserva a entrega no banco (`claim_slack_channel_delivery`), que marca a Execução como entregue antes de
// qualquer postagem: uma Execução é postada uma vez só, mesmo que a chamada se repita. Depois posta no thread do fio, com
// o token do bot:
//   - sucesso: a resposta final do Agente;
//   - falha: uma falha clara, nunca uma resposta inventada (o motivo humano de cada falha é o ticket 05);
//   - Canal retirado entre o pedido e a entrega: não posta, só fica marcada.
// Uma falha ao postar fica no log e não é repetida. O log nunca traz a resposta nem o token.
import { ErroDoSlack, postarNoThread } from '../_shared/slack-api.ts'

/** O que o banco devolve ao reservar a entrega de uma Execução do Canal já terminada. */
export interface Entrega {
  status: 'succeeded' | 'failed'
  codigoDoErro: string | null
  /** As falas do Agente, em ordem. */
  resposta: string | null
  canal: string
  threadTs: string
  /** O token do bot; nulo quando o Canal foi retirado. */
  token: string | null
}

export interface Db {
  /** RPC `claim_slack_channel_delivery`: a entrega, ou nulo quando já foi feita (ou a Execução não é do Canal ou não terminou). */
  reservarEntrega(runId: string): Promise<Entrega | null>
}

export interface Deps {
  db: Db
  /** O segredo interno da entrega, o mesmo guardado no Vault (`slack_channel_delivery_secret`). */
  segredoInterno: string
  fetch?: typeof fetch
  log?: (campos: Record<string, unknown>) => void
}

export const RESPOSTAS = {
  falha: 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.',
} as const

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const registrar = (runId: string, resultado: string, extra: Record<string, unknown> = {}) =>
    log({ type: 'slack_channel_delivery', runId, resultado, ...extra })

  return async (req) => {
    if (req.method !== 'POST') return responder({ error: 'method not allowed' }, 405)
    const segredo = req.headers.get('x-slack-delivery-secret') ?? ''
    if (!deps.segredoInterno || !iguais(segredo, deps.segredoInterno)) return responder({ error: 'unauthorized' }, 401)

    let runId: unknown
    try {
      runId = (await req.json())?.run_id
    } catch {
      runId = null
    }
    if (typeof runId !== 'string' || !UUID.test(runId)) return responder({ error: 'invalid run' }, 400)

    const entrega = await deps.db.reservarEntrega(runId)
    if (!entrega) {
      registrar(runId, 'nada_a_entregar')
      return responder({ ok: true, entregue: false })
    }
    if (!entrega.token) {
      registrar(runId, 'canal_retirado')
      return responder({ ok: true, entregue: false })
    }
    const texto = entrega.status === 'succeeded' && entrega.resposta?.trim() ? entrega.resposta : RESPOSTAS.falha
    try {
      await postarNoThread({ token: entrega.token, canal: entrega.canal, threadTs: entrega.threadTs, texto, fetch: deps.fetch })
    } catch (e) {
      registrar(runId, 'falha_ao_postar', { erro: e instanceof ErroDoSlack ? e.message : e instanceof Error ? e.name : 'desconhecido' })
      return responder({ error: 'slack unavailable' }, 502)
    }
    registrar(runId, entrega.status === 'succeeded' ? 'resposta_postada' : 'falha_postada', { codigoDoErro: entrega.codigoDoErro })
    return responder({ ok: true, entregue: true })
  }
}
