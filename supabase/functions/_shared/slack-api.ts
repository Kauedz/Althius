// O cliente da API do Slack para o Canal Slack (slack-canal 01 e 02): o endereço de instalação do app @Althius, a troca do
// código pelo token do bot, a revogação do token, a assinatura dos eventos, a leitura de um usuário e a resposta no
// thread. É o app do Canal, distinto do app da Integração Slack pelo MCP.
// Referências: https://api.slack.com/authentication/oauth-v2, https://api.slack.com/methods/oauth.v2.access,
// https://api.slack.com/methods/auth.revoke, https://docs.slack.dev/authentication/verifying-requests-from-slack,
// https://docs.slack.dev/reference/methods/users.info e https://docs.slack.dev/reference/methods/chat.postMessage.
// O token nunca aparece em erro nem em log.

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
const USUARIO = 'https://slack.com/api/users.info'
const POSTAR = 'https://slack.com/api/chat.postMessage'

/** `recusado`: o Slack respondeu `ok: false`; `indisponivel`: rede ou 5xx; `resposta_invalida`: faltou o que se espera. */
export class ErroDoSlack extends Error {
  constructor(
    readonly tipo: 'recusado' | 'indisponivel' | 'resposta_invalida',
    readonly codigo: string | null = null,
    /** Em um 429, os segundos que o Slack pediu para esperar (`Retry-After`). */
    readonly esperarSegundos: number | null = null,
  ) {
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
  if (resposta.status === 429) {
    const pedido = Number(resposta.headers.get('Retry-After'))
    throw new ErroDoSlack('indisponivel', '429', Number.isFinite(pedido) && pedido >= 0 ? pedido : null)
  }
  if (resposta.status >= 500) throw new ErroDoSlack('indisponivel', String(resposta.status))
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

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

/**
 * Confere a assinatura de um pedido do Slack: `X-Slack-Signature` é `v0=` mais o hex do HMAC-SHA256 de
 * `v0:{X-Slack-Request-Timestamp}:{corpo}` com o segredo de assinatura do app, comparado em tempo constante. Um
 * timestamp a mais de 5 minutos do relógio é recusado, para um pedido gravado não ser repetido depois.
 */
export async function assinaturaDoSlackValida(a: {
  corpo: string
  timestamp: string | null
  assinatura: string | null
  segredo: string
  agoraEmSegundos: number
}): Promise<boolean> {
  if (!a.segredo || !a.assinatura || !a.timestamp || !/^\d+$/.test(a.timestamp)) return false
  if (Math.abs(a.agoraEmSegundos - Number(a.timestamp)) > 300) return false
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(a.segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperado = `v0=${hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`v0:${a.timestamp}:${a.corpo}`)))}`
  return iguais(a.assinatura, esperado)
}

/** O que a Althius precisa saber de quem escreveu: o e-mail e se é de casa (nem convidado, nem de outro Slack). */
export interface UsuarioDoSlack {
  email: string | null
  teamId: string | null
  /** Convidado do Slack (`is_restricted` ou `is_ultra_restricted`). */
  convidado: boolean
  /** Membro de outro workspace Slack visto por um canal compartilhado (Slack Connect, `is_stranger`). */
  deFora: boolean
  bot: boolean
  apagado: boolean
}

/** Lê um usuário (`users.info`, escopos `users:read` e `users:read.email`). */
export async function lerUsuarioDoSlack(a: { token: string; usuario: string; fetch?: typeof fetch }): Promise<UsuarioDoSlack> {
  const corpo = await chamar(a.fetch ?? fetch, USUARIO, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user: a.usuario }).toString(),
  })
  if (corpo.ok !== true) throw new ErroDoSlack('recusado', texto(corpo.error))
  const usuario = corpo.user as Record<string, unknown> | undefined
  if (!usuario || typeof usuario !== 'object') throw new ErroDoSlack('resposta_invalida')
  const perfil = (usuario.profile ?? {}) as Record<string, unknown>
  return {
    email: texto(perfil.email),
    teamId: texto(usuario.team_id),
    convidado: usuario.is_restricted === true || usuario.is_ultra_restricted === true,
    deFora: usuario.is_stranger === true,
    bot: usuario.is_bot === true,
    apagado: usuario.deleted === true,
  }
}

/** Quantas vezes a postagem é tentada, e a maior espera aceita entre duas tentativas (a função tem prazo curto). */
export const TENTATIVAS_DE_POSTAR = 3
export const ESPERA_MAXIMA_EM_SEGUNDOS = 5

/**
 * Posta uma mensagem no thread (`chat.postMessage` com `thread_ts`): o bot nunca responde solto no canal.
 * Um 429 (limite do Slack), um 5xx ou a rede fora são tentados de novo até `TENTATIVAS_DE_POSTAR` vezes: no 429 a espera é
 * o `Retry-After` do Slack; sem ele, 1s e depois 2s. Um `Retry-After` maior que `ESPERA_MAXIMA_EM_SEGUNDOS` não é
 * esperado: o erro sobe para quem chamou registrar. Um `ok: false` do Slack não é repetido (repetir não muda a resposta).
 */
export async function postarNoThread(a: {
  token: string
  canal: string
  threadTs: string
  texto: string
  fetch?: typeof fetch
  esperar?: (ms: number) => Promise<void>
}): Promise<void> {
  const esperar = a.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)))
  for (let tentativa = 1; ; tentativa++) {
    let corpo: Record<string, unknown>
    try {
      corpo = await chamar(a.fetch ?? fetch, POSTAR, {
        method: 'POST',
        headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: a.canal, thread_ts: a.threadTs, text: a.texto }),
      })
    } catch (e) {
      if (!(e instanceof ErroDoSlack) || e.tipo !== 'indisponivel' || tentativa >= TENTATIVAS_DE_POSTAR) throw e
      const segundos = e.esperarSegundos ?? 2 ** (tentativa - 1)
      if (segundos > ESPERA_MAXIMA_EM_SEGUNDOS) throw e
      await esperar(segundos * 1000)
      continue
    }
    if (corpo.ok !== true) throw new ErroDoSlack('recusado', texto(corpo.error))
    return
  }
}
