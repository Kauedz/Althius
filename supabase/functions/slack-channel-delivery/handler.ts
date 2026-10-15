// A entrega da resposta no thread do Slack (slack-canal 03). Quando uma Execução com o gatilho Canal chega a um estado
// final, um gatilho no banco chama esta função pelo pg_net, sem JWT (`verify_jwt = false`), com o id da Execução e o
// segredo interno da entrega no cabeçalho `x-slack-delivery-secret`. A entrega independe do motor que rodou a Execução.
//
// A função reserva a entrega no banco (`claim_slack_channel_delivery`, com prazo de 2 minutos): enquanto a reserva vale,
// ninguém mais posta a mesma Execução. Depois posta no thread do fio, com o token do bot, e só então confirma a entrega
// (`confirm_slack_channel_delivery`, slack-canal 09). Se o Slack falhar depois das tentativas, a falha volta ao banco
// (`fail_slack_channel_delivery`): a reserva é solta e o relógio do banco pede a entrega de novo, até desistir na 5ª
// tentativa ou numa recusa definitiva do Slack. O que vai no thread:
//   - sucesso: a resposta final do Agente;
//   - falha: uma falha clara com o motivo humano (sem Créditos, sem contrato, prazo vencido, erro do Agente), nunca uma
//     resposta inventada (slack-canal 05);
//   - Aprovação pendente pedida pela Execução: no mesmo post, o aviso de que ela aguarda na fila de Aprovações da
//     Althius, sem botões no Slack (slack-canal 05);
//   - Canal retirado entre o pedido e a entrega: não posta, só fica marcada.
// Toda falha ao postar fica no log com o id da Execução. O log nunca traz a resposta nem o token.
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
  /** As ações das Aprovações que a Execução pediu e que ainda aguardam na fila, em ordem. */
  aprovacoesPendentes?: string[]
}

export interface Db {
  /** RPC `claim_slack_channel_delivery`: a entrega, ou nulo quando já foi feita (ou a Execução não é do Canal ou não terminou). */
  reservarEntrega(runId: string): Promise<Entrega | null>
  /** RPC `confirm_slack_channel_delivery`: o Slack aceitou o post (slack-canal 09). */
  confirmarEntrega?(runId: string): Promise<void>
  /** RPC `fail_slack_channel_delivery`: solta a reserva para nova tentativa, ou desiste (`final` ou na 5ª tentativa). */
  falharEntrega?(runId: string, motivo: string, final: boolean): Promise<'nova_tentativa' | 'desistiu' | 'nada'>
}

export interface Deps {
  db: Db
  /** O segredo interno da entrega, o mesmo guardado no Vault (`slack_channel_delivery_secret`). */
  segredoInterno: string
  fetch?: typeof fetch
  log?: (campos: Record<string, unknown>) => void
}

export const RESPOSTAS = {
  /** O erro do Agente (do modelo, do motor ou interno), e qualquer motivo sem frase própria. */
  falha: 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.',
  semCreditos:
    'Não foi possível responder: o Workspace está sem Créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.',
  semContrato: 'Não foi possível responder: este Workspace está sem contrato ativo na Althius.',
  passouDoTempo: 'O pedido passou do tempo e foi interrompido, sem resposta. Tente de novo.',
  semParticipacao: 'Não foi possível responder: você não participa mais deste Workspace.',
  chaveDeIa: 'Não foi possível responder: a chave de IA do Workspace não pôde ser usada. Avise o Administrador.',
  aprovacoesNaFila: (acoes: string[]) =>
    acoes.length === 1
      ? `A Aprovação de "${escapar(acoes[0])}" aguarda na fila de Aprovações da Althius.`
      : `${acoes.length} Aprovações aguardam na fila de Aprovações da Althius: ${acoes.map((a) => `"${escapar(a)}"`).join(', ')}.`,
}

/** A ação foi escrita pelo Agente: no Slack, `<`, `>` e `&` viram texto, para nunca formar uma menção como `<!channel>`. */
function escapar(texto: string): string {
  return texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * O motivo gravado na Execução que falhou, em palavras de quem pediu. É uma cópia resumida do mapa da Conversa na Althius
 * (`mensagemDaFalha`, no frontend): um código novo de falha entra nos dois.
 */
const MOTIVOS: Record<string, string> = {
  insufficient_credits: RESPOSTAS.semCreditos,
  contrato_inativo: RESPOSTAS.semContrato,
  timeout: RESPOSTAS.passouDoTempo,
  membership_inactive: RESPOSTAS.semParticipacao,
  workspace_ai_key_invalid: RESPOSTAS.chaveDeIa,
  workspace_ai_key_unavailable: RESPOSTAS.chaveDeIa,
  workspace_ai_key_unsupported: RESPOSTAS.chaveDeIa,
}

/** O que vai no thread: a resposta ou a falha, e o aviso das Aprovações que aguardam na fila. */
function textoDaEntrega(entrega: Entrega): string {
  const aprovacoes = entrega.aprovacoesPendentes ?? []
  const aviso = aprovacoes.length ? RESPOSTAS.aprovacoesNaFila(aprovacoes) : ''
  let principal: string
  if (entrega.status === 'failed') principal = (entrega.codigoDoErro && MOTIVOS[entrega.codigoDoErro]) || RESPOSTAS.falha
  else if (entrega.resposta?.trim()) principal = entrega.resposta
  // Terminou bem sem uma fala: com a Aprovação na fila, o aviso basta; sem nada, é falha, nunca um post vazio.
  else principal = aviso ? '' : RESPOSTAS.falha
  return [principal, aviso].filter(Boolean).join('\n\n')
}

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
    try {
      await postarNoThread({
        token: entrega.token,
        canal: entrega.canal,
        threadTs: entrega.threadTs,
        texto: textoDaEntrega(entrega),
        fetch: deps.fetch,
      })
    } catch (e) {
      const erro = e instanceof ErroDoSlack ? e.message : e instanceof Error ? e.name : 'desconhecido'
      // Uma recusa do Slack (canal apagado, bot fora do canal, token inválido) não melhora com nova tentativa.
      const final = e instanceof ErroDoSlack && e.tipo === 'recusado'
      const motivo = e instanceof ErroDoSlack ? `${e.tipo}${e.codigo ? `:${e.codigo}` : ''}` : 'desconhecido'
      let decisao: string = 'sem_registro'
      if (deps.db.falharEntrega) {
        try {
          decisao = await deps.db.falharEntrega(runId, motivo, final)
        } catch (falha) {
          decisao = 'falha_ao_registrar'
          registrar(runId, 'falha_ao_registrar_falha', { erro: falha instanceof Error ? falha.name : 'desconhecido' })
        }
      }
      registrar(runId, 'falha_ao_postar', { erro, decisao })
      return responder({ error: 'slack unavailable', decisao }, 502)
    }
    if (deps.db.confirmarEntrega) {
      try {
        await deps.db.confirmarEntrega(runId)
      } catch (falha) {
        // O post saiu; sem a confirmação, a reserva vence e o post pode sair de novo. Fica no log.
        registrar(runId, 'falha_ao_confirmar', { erro: falha instanceof Error ? falha.name : 'desconhecido' })
      }
    }
    registrar(runId, entrega.status === 'succeeded' ? 'resposta_postada' : 'falha_postada', {
      codigoDoErro: entrega.codigoDoErro,
      aprovacoesPendentes: entrega.aprovacoesPendentes?.length ?? 0,
    })
    return responder({ ok: true, entregue: true })
  }
}
