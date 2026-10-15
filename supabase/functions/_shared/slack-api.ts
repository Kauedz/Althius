// O cliente da API do Slack para o Canal Slack (slack-canal 01): o endereço de instalação do app @Althius, a troca do
// código pelo token do bot e a revogação do token. É o app do Canal, distinto do app da Integração Slack pelo MCP.
// Referências: https://api.slack.com/authentication/oauth-v2, https://api.slack.com/methods/oauth.v2.access e
// https://api.slack.com/methods/auth.revoke. O token nunca aparece em erro nem em log.

/**
 * Os escopos do bot, só os da spec: ler as menções ao app, ler o histórico do DM com o app e dos canais públicos em que o
 * bot está (para continuar um fio sem novo @), postar mensagens e ler os usuários com o e-mail.
 */
export const ESCOPOS_DO_BOT = [
  'app_mentions:read',
  'im:history',
  'channels:history',
  'chat:write',
  'users:read',
  'users:read.email',
] as const

const AUTORIZAR = 'https://slack.com/oauth/v2/authorize'
const TROCAR = 'https://slack.com/api/oauth.v2.access'
const REVOGAR = 'https://slack.com/api/auth.revoke'

/** `recusado`: o Slack respondeu `ok: false`; `indisponivel`: rede ou 5xx; `resposta_invalida`: faltou o que se espera. */
export class ErroDoSlack extends Error {
  constructor(readonly tipo: 'recusado' | 'indisponivel' | 'resposta_invalida', readonly codigo: string | null = null) {
    super(`Slack: ${tipo}${codigo ? ` (${codigo})` : ''}`)
    this.name = 'ErroDoSlack'
  }
}

export function urlDeInstalacao(a: { clientId: string; urlDeRetorno: string; state: string }): string {
  const url = new URL(AUTORIZAR)
  url.searchParams.set('client_id', a.clientId)
  url.searchParams.set('scope', ESCOPOS_DO_BOT.join(','))
  url.searchParams.set('redirect_uri', a.urlDeRetorno)
  url.searchParams.set('state', a.state)
  return url.toString()
}

/** O que a instalação devolveu: o token do bot e o workspace Slack em que o app foi instalado. */
export interface InstalacaoNoSlack {
  token: string
  teamId: string
  teamName: string | null
  botUserId: string
  appId: string | null
  escopos: string | null
}

async function chamar(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let resposta: Response
  try {
    resposta = await fetcher(url, init)
  } catch {
    throw new ErroDoSlack('indisponivel')
  }
  if (resposta.status === 429 || resposta.status >= 500) throw new ErroDoSlack('indisponivel', String(resposta.status))
  try {
    const corpo = await resposta.json()
    if (corpo && typeof corpo === 'object') return corpo as Record<string, unknown>
  } catch {
    // corpo ilegível
  }
  throw new ErroDoSlack('resposta_invalida')
}

const texto = (valor: unknown) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null)

/** Troca o código do retorno pelo token do bot (`oauth.v2.access`), com o id e o segredo do app do Canal. */
export async function trocarCodigoDoSlack(a: {
  clientId: string
  clientSecret: string
  codigo: string
  urlDeRetorno: string
  fetch?: typeof fetch
}): Promise<InstalacaoNoSlack> {
  const corpo = await chamar(a.fetch ?? fetch, TROCAR, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${a.clientId}:${a.clientSecret}`)}`,
    },
    body: new URLSearchParams({ code: a.codigo, redirect_uri: a.urlDeRetorno }).toString(),
  })
  if (corpo.ok !== true) throw new ErroDoSlack('recusado', texto(corpo.error))
  const time = (corpo.team ?? {}) as Record<string, unknown>
  const token = texto(corpo.access_token)
  const teamId = texto(time.id)
  const botUserId = texto(corpo.bot_user_id)
  if (corpo.token_type !== 'bot' || !token || !teamId || !botUserId) throw new ErroDoSlack('resposta_invalida')
  return { token, teamId, teamName: texto(time.name), botUserId, appId: texto(corpo.app_id), escopos: texto(corpo.scope) }
}

/** Os erros do `auth.revoke` que querem dizer que o token já não vale (o app foi desinstalado, o token já foi revogado). */
const JA_INVALIDO = new Set(['invalid_auth', 'token_revoked', 'token_expired', 'account_inactive', 'not_authed'])

/** Revoga o token do bot no Slack (`auth.revoke`). Um token que já não vale conta como revogado. */
export async function revogarTokenDoSlack(a: { token: string; fetch?: typeof fetch }): Promise<'revogado' | 'ja_invalido'> {
  const corpo = await chamar(a.fetch ?? fetch, REVOGAR, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (corpo.ok === true) return 'revogado'
  const codigo = texto(corpo.error)
  if (codigo && JA_INVALIDO.has(codigo)) return 'ja_invalido'
  throw new ErroDoSlack('recusado', codigo)
}
