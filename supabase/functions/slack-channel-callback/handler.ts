// O retorno da instalação do Canal Slack (slack-canal 01). O Slack redireciona o navegador para cá com
// `?code=…&state=…` (ou `?error=…`). Não há JWT (`verify_jwt = false`): quem vale é o `state`, que casa com uma tentativa
// pendente no banco, dentro do prazo, de quem ainda é Administrador ativo. A função troca o código pelo token do bot com o
// app do Canal e chama o banco, que fixa o workspace Slack ou recusa (outro Slack no Workspace; Slack de outro Workspace).
// Depois redireciona o navegador para /conexoes com o resultado na URL. O token nunca passa pelo navegador nem pelo log.
//
// Na recusa, o token recebido não é guardado nem revogado: o bot de um Slack já ligado a outro Workspace tem o mesmo
// token, e revogá-lo derrubaria o Canal de lá.
import { origensPermitidas } from '../_shared/cors.ts'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { ErroDoSlack, type InstalacaoNoSlack, trocarCodigoDoSlack } from '../_shared/slack-api.ts'

/** O que a tentativa guardou (`slack_channel_install_attempt`). */
export interface TentativaDeInstalacao {
  status: 'ok' | 'usada' | 'expirada' | 'nao_administrador'
  workspaceId: string
  returnTo: string | null
}

export interface Db {
  tentativa(state: string): Promise<TentativaDeInstalacao | null>
  /** RPC `complete_slack_channel_install`. */
  concluir(a: InstalacaoNoSlack & { state: string }): Promise<void>
}

export interface Deps {
  db: Db
  ambiente: (nome: string) => string | undefined
  appOrigin: string
  /** Este endereço, o mesmo que `slack-channel-connect` mandou ao Slack; a troca do código exige que seja igual. */
  urlDeRetorno: string
  fetch?: typeof fetch
  log?: (campos: Record<string, unknown>) => void
}

/** Por que a instalação não concluiu, no vocabulário que a tela entende (`?conexao=erro&canal=slack&motivo=…`). */
export type MotivoDoRetorno =
  | TentativaDeInstalacao['status']
  | 'invalida'
  | 'recusada'
  | 'falha_na_troca'
  | 'indisponivel'
  | 'slack_diferente'
  | 'slack_de_outro_workspace'
  | 'erro'

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const origens = origensPermitidas(deps.appOrigin)

  function voltar(origem: string | null, resultado: MotivoDoRetorno): Response {
    // Só volta para uma origem do APP_ORIGIN: a `return_to` da tentativa é conferida de novo aqui.
    const destino = new URL('/conexoes', origem && origens.includes(origem) ? origem : origens[0])
    destino.searchParams.set('conexao', resultado === 'ok' ? 'ok' : 'erro')
    destino.searchParams.set('canal', 'slack')
    if (resultado !== 'ok') destino.searchParams.set('motivo', resultado)
    log({ type: 'slack_channel_callback', resultado })
    return new Response(null, {
      status: 302,
      headers: { Location: destino.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  }

  return async (req) => {
    if (req.method !== 'GET') return new Response('Método não permitido.', { status: 405 })
    const parametros = new URL(req.url).searchParams
    const state = parametros.get('state') ?? ''
    const codigo = parametros.get('code') ?? ''

    let tentativa: TentativaDeInstalacao | null
    try {
      tentativa = state ? await deps.db.tentativa(state) : null
    } catch {
      return voltar(null, 'erro')
    }
    // Um state que nenhuma tentativa conhece é um retorno forjado: não associa nada e volta ao app sem dizer mais.
    if (!tentativa) return voltar(null, 'invalida')
    const origem = tentativa.returnTo

    if (tentativa.status !== 'ok') return voltar(origem, tentativa.status)
    // A instalação cancelada no Slack volta com `error=access_denied`; a tentativa fica até vencer e nada é gravado.
    if (parametros.get('error')) return voltar(origem, 'recusada')
    if (!codigo) return voltar(origem, 'invalida')

    const clientId = deps.ambiente('SLACK_CHANNEL_CLIENT_ID')
    const clientSecret = deps.ambiente('SLACK_CHANNEL_CLIENT_SECRET')
    if (!clientId || !clientSecret) return voltar(origem, 'erro')

    try {
      const instalacao = await trocarCodigoDoSlack({ clientId, clientSecret, codigo, urlDeRetorno: deps.urlDeRetorno, fetch: deps.fetch })
      await deps.db.concluir({ ...instalacao, state })
      return voltar(origem, 'ok')
    } catch (e) {
      if (e instanceof ErroDoSlack) return voltar(origem, e.tipo === 'indisponivel' ? 'indisponivel' : 'falha_na_troca')
      if (e instanceof ErroDoBanco) {
        if (e.message.includes('slack team mismatch')) return voltar(origem, 'slack_diferente')
        if (e.message.includes('slack team in another workspace')) return voltar(origem, 'slack_de_outro_workspace')
        if (e.message.includes('already used')) return voltar(origem, 'usada')
        if (e.message.includes('expired')) return voltar(origem, 'expirada')
        if (e.codigo === '42501') return voltar(origem, 'nao_administrador')
      }
      return voltar(origem, 'erro')
    }
  }
}
