import type { AdaptadorCanal } from '../_shared/canal/index.ts'

export interface Entrega { status: 'succeeded' | 'failed'; codigoDoErro: string | null; resposta: string | null; telefone: string; dentroDaJanela: boolean }
export interface Db {
  reservarEntrega(runId: string): Promise<Entrega | null>
  confirmarEntrega(runId: string): Promise<void>
  falharEntrega(runId: string, erro: string): Promise<string>
}
export interface Deps { db: Db; adaptador: AdaptadorCanal; segredoInterno: string; log?: (campos: Record<string, unknown>) => void }

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const FALHA = 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.'
const ERROS: Record<string, string> = {
  insufficient_credits: 'Não foi possível responder: o Workspace está sem Créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.',
  contrato_inativo: 'Não foi possível responder: este Workspace está sem contrato ativo na Althius.',
  membership_inactive: 'Não foi possível responder: você não participa mais deste Workspace.',
  timeout: 'O pedido passou do tempo e foi interrompido, sem resposta. Tente de novo.',
}

function iguais(a: string, b: string) {
  let diferenca = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diferenca === 0
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  return async (req) => {
    if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405)
    if (!deps.segredoInterno || !iguais(req.headers.get('x-whatsapp-delivery-secret') ?? '', deps.segredoInterno)) return responder({ erro: 'Não autorizado.' }, 401)
    let runId: unknown
    try { runId = (await req.json())?.run_id } catch { runId = null }
    if (typeof runId !== 'string' || !UUID.test(runId)) return responder({ erro: 'Execução inválida.' }, 400)
    const entrega = await deps.db.reservarEntrega(runId)
    if (!entrega) return responder({ ok: true, entregue: false })
    const texto = entrega.status === 'failed'
      ? (entrega.codigoDoErro && ERROS[entrega.codigoDoErro]) || FALHA
      : entrega.resposta?.trim() || FALHA
    try {
      if (entrega.dentroDaJanela) {
        await deps.adaptador.enviarTexto({ para: entrega.telefone.replace(/^\+/, ''), texto })
      } else {
        await deps.adaptador.enviarTemplate({
          para: entrega.telefone.replace(/^\+/, ''), nome: 'althius_pedido_concluido', idioma: 'pt_BR', parametros: [], categoria: 'utilidade',
        })
      }
    } catch (erro) {
      const resultado = await deps.db.falharEntrega(runId, erro instanceof Error ? erro.name : 'desconhecido')
      log({ tipo: 'canal_whatsapp_delivery', runId, resultado })
      return responder({ ok: false }, 502)
    }
    try { await deps.db.confirmarEntrega(runId) } catch (erro) {
      log({ tipo: 'canal_whatsapp_delivery', runId, resultado: 'falha_ao_confirmar', erro: erro instanceof Error ? erro.name : 'desconhecido' })
    }
    log({ tipo: 'canal_whatsapp_delivery', runId, resultado: entrega.status === 'succeeded' ? 'resposta_enviada' : 'falha_enviada' })
    return responder({ ok: true, entregue: true })
  }
}
