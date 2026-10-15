// Instalar e retirar o Canal Slack (slack-canal 01; decisões Q2, Q4, Q12 e Q17). O Administrador pede, com o JWT dele,
// `{ action, workspaceId }`:
//   iniciar  abre a tentativa no banco (state de uso único, 10 minutos) e devolve `{ url }`, o endereço de instalação do
//            app @Althius no Slack. O retorno cai em `slack-channel-callback`, que fixa o workspace Slack ou recusa.
//   retirar  lê o token do bot, revoga-o no Slack e só então marca a instalação como retirada. Se o Slack não confirma a
//            revogação, nada é marcado: o Administrador tenta de novo, e o token não fica vivo com o Canal "retirado".
// O banco confere que quem pede é Administrador ativo. O app do Canal é distinto do app da Integração Slack pelo MCP:
// os segredos são SLACK_CHANNEL_CLIENT_ID e SLACK_CHANNEL_CLIENT_SECRET. O token nunca aparece em resposta nem em log.
import { comCors, origemDoAppParaLink } from '../_shared/cors.ts'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { ErroDoSlack, revogarTokenDoSlack, urlDeInstalacao } from '../_shared/slack-api.ts'

export interface Db {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  /** RPC `start_slack_channel_install`: devolve o `state`. */
  iniciarTentativa(a: { workspaceId: string; userId: string; returnTo: string | null }): Promise<string>
  /** RPC `slack_channel_token_for_withdrawal`: o token do bot da instalação ativa. */
  tokenParaRetirar(a: { workspaceId: string; userId: string }): Promise<string>
  /** RPC `withdraw_slack_channel`. */
  retirar(a: { workspaceId: string; userId: string }): Promise<void>
}

export interface Deps {
  db: Db
  /** Os segredos de ambiente (`Deno.env.get`). */
  ambiente: (nome: string) => string | undefined
  appOrigin: string
  /** O endereço público da `slack-channel-callback`, o mesmo cadastrado como URL de retorno no app do Canal. */
  urlDeRetorno: string
  fetch?: typeof fetch
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const erro = (status: number, code: string, mensagem: string) => responder({ error: mensagem, code }, status)

  /** O que um erro do banco quer dizer para o Administrador. */
  function falhaDoBanco(e: unknown): Response {
    if (e instanceof ErroDoBanco) {
      if (e.codigo === '42501') return erro(403, 'nao_administrador', 'Só um Administrador do Workspace conecta ou retira o Slack.')
      if (e.message.includes('slack channel not installed')) return erro(409, 'nao_instalado', 'O Slack não está conectado neste Workspace.')
    }
    log({ type: 'slack_channel_connect_error', detalhe: e instanceof Error ? e.name : 'desconhecido' })
    return erro(502, 'indisponivel', 'Não foi possível falar com o Slack agora. Tente de novo em instantes.')
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return erro(405, 'metodo', 'Método não permitido.')
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return erro(401, 'sem_sessao', 'Entre na sua Conta de usuário para continuar.')

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return erro(400, 'corpo', 'Corpo inválido.')
    }
    const workspaceId = typeof corpo?.workspaceId === 'string' ? corpo.workspaceId : ''
    if (!UUID.test(workspaceId)) return erro(400, 'workspace', 'Workspace obrigatório.')

    if (corpo.action === 'iniciar') {
      const clientId = deps.ambiente('SLACK_CHANNEL_CLIENT_ID')
      // Sem o segredo, o retorno não teria como trocar o código: melhor nem mandar ao Slack.
      if (!clientId || !deps.ambiente('SLACK_CHANNEL_CLIENT_SECRET')) {
        log({ type: 'slack_channel_connect', resultado: 'nao_configurada' })
        return erro(
          503,
          'nao_configurada',
          'Precisa configurar: o app do Slack da Althius ainda não foi cadastrado. Fale com quem administra a Althius.',
        )
      }
      try {
        const state = await deps.db.iniciarTentativa({
          workspaceId,
          userId: user.userId,
          returnTo: origemDoAppParaLink(req, deps.appOrigin) ?? null,
        })
        log({ type: 'slack_channel_connect', resultado: 'iniciada' })
        return responder({ url: urlDeInstalacao({ clientId, urlDeRetorno: deps.urlDeRetorno, state }) })
      } catch (e) {
        return falhaDoBanco(e)
      }
    }

    if (corpo.action === 'retirar') {
      try {
        const token = await deps.db.tokenParaRetirar({ workspaceId, userId: user.userId })
        // Sem token no Vault não há o que revogar no Slack; a instalação é retirada assim mesmo.
        if (token) {
          const revogacao = await revogarTokenDoSlack({ token, fetch: deps.fetch })
          log({ type: 'slack_channel_connect', resultado: `revogacao_${revogacao}` })
        }
        await deps.db.retirar({ workspaceId, userId: user.userId })
        log({ type: 'slack_channel_connect', resultado: 'retirada' })
        return responder({ ok: true })
      } catch (e) {
        if (e instanceof ErroDoSlack) {
          log({ type: 'slack_channel_connect', resultado: `revogacao_${e.tipo}`, codigo: e.codigo })
          return erro(502, 'indisponivel', 'O Slack não confirmou a retirada agora. Tente de novo em instantes.')
        }
        return falhaDoBanco(e)
      }
    }

    return erro(400, 'acao', 'Ação desconhecida.')
  })
}
