// O OAuth 2.1 com PKCE que a autorização do MCP pede (especificação do MCP, 2025-06-18): descoberta do servidor de
// autorização (RFC 9728, metadado do recurso protegido, e RFC 8414, metadado do servidor), registro dinâmico de cliente
// (RFC 7591), o endereço de consentimento com PKCE S256 e o indicador de recurso (RFC 8707), a troca do código e a
// renovação do token. Tudo com `fetch` injetado, para os testes irem do pedido à resposta sem rede.
//
// O token e o segredo do cliente só entram nos corpos e cabeçalhos das requisições; nenhuma mensagem de erro os carrega.

export interface MetadadosDoServidorDeAutorizacao {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  code_challenge_methods_supported?: string[]
  token_endpoint_auth_methods_supported?: string[]
  scopes_supported?: string[]
}

export interface DescobertaDoServidor extends MetadadosDoServidorDeAutorizacao {
  /** O recurso protegido (o servidor MCP) que vai no parâmetro `resource` do RFC 8707. */
  resource: string
}

/**
 * Por que o servidor de autorização não deu o que se pediu. `recusado` é uma resposta de erro do OAuth (com o código,
 * como `invalid_grant`); `indisponivel` é rede, tempo esgotado ou 5xx; `protocolo` é uma resposta fora do formato.
 */
export class ErroDeOAuth extends Error {
  constructor(
    readonly tipo: 'recusado' | 'indisponivel' | 'protocolo',
    mensagem: string,
    readonly codigo?: string,
    readonly status?: number,
  ) {
    super(mensagem)
    this.name = 'ErroDeOAuth'
  }
}

const TEMPO_DA_DESCOBERTA_MS = 10_000

function ehHttps(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  try {
    return new URL(valor).protocol === 'https:'
  } catch {
    return false
  }
}

async function buscarJson(buscar: typeof fetch, url: string, init: RequestInit = {}): Promise<{ status: number; json: unknown; cabecalhos: Headers }> {
  let resposta: Response
  try {
    resposta = await buscar(url, { ...init, signal: AbortSignal.timeout(TEMPO_DA_DESCOBERTA_MS) })
  } catch {
    throw new ErroDeOAuth('indisponivel', 'O servidor de autorização não respondeu a tempo.')
  }
  let json: unknown = null
  try {
    json = await resposta.json()
  } catch {
    await resposta.body?.cancel().catch(() => {})
  }
  return { status: resposta.status, json, cabecalhos: resposta.headers }
}

/** `resource_metadata="https://…"` do cabeçalho WWW-Authenticate de um 401 (RFC 9728, seção 5.1). */
export function metadadoDoRecursoNoDesafio(desafio: string | null | undefined): string | null {
  const achado = /resource_metadata="([^"]+)"/i.exec(desafio ?? '')
  return achado ? achado[1] : null
}

/** Os endereços onde o metadado do servidor de autorização pode estar (RFC 8414 e OpenID Connect Discovery). */
export function candidatosDoMetadadoDoServidor(emissor: string): string[] {
  const url = new URL(emissor)
  const origem = url.origin
  const caminho = url.pathname.replace(/\/+$/, '')
  if (!caminho) {
    return [`${origem}/.well-known/oauth-authorization-server`, `${origem}/.well-known/openid-configuration`]
  }
  return [
    `${origem}/.well-known/oauth-authorization-server${caminho}`,
    `${origem}/.well-known/openid-configuration${caminho}`,
    `${origem}${caminho}/.well-known/openid-configuration`,
  ]
}

/**
 * Descobre o servidor de autorização de um servidor MCP: o metadado do recurso protegido (pelo desafio do 401 ou pelo
 * endereço conhecido), depois o metadado do servidor de autorização. Quando o perfil já traz os endereços de
 * autorização e de token, não há descoberta (o HubSpot os traz fixos, copiados do metadado que ele publica).
 */
export async function descobrirServidorDeAutorizacao(opcoes: {
  urlMcp: string
  autorizacao?: string
  token?: string
  fetch?: typeof fetch
}): Promise<DescobertaDoServidor> {
  const buscar = opcoes.fetch ?? fetch
  const urlMcp = new URL(opcoes.urlMcp)
  if (opcoes.autorizacao && opcoes.token) {
    return {
      issuer: urlMcp.origin,
      authorization_endpoint: opcoes.autorizacao,
      token_endpoint: opcoes.token,
      resource: opcoes.urlMcp,
    }
  }

  // 1. O metadado do recurso protegido.
  const candidatosDoRecurso: string[] = []
  try {
    const sonda = await buscar(opcoes.urlMcp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'althius', version: '1.0.0' } },
      }),
      signal: AbortSignal.timeout(TEMPO_DA_DESCOBERTA_MS),
    })
    await sonda.body?.cancel().catch(() => {})
    const anunciado = metadadoDoRecursoNoDesafio(sonda.headers.get('WWW-Authenticate'))
    // O endereço anunciado só vale se for https e do mesmo servidor MCP: a Althius não segue o desafio para outro host.
    if (anunciado && ehHttps(anunciado) && new URL(anunciado).origin === urlMcp.origin) candidatosDoRecurso.push(anunciado)
  } catch {
    // Sem a sonda, a descoberta segue pelos endereços conhecidos.
  }
  const caminhoDoMcp = urlMcp.pathname.replace(/\/+$/, '')
  if (caminhoDoMcp) candidatosDoRecurso.push(`${urlMcp.origin}/.well-known/oauth-protected-resource${caminhoDoMcp}`)
  candidatosDoRecurso.push(`${urlMcp.origin}/.well-known/oauth-protected-resource`)

  let emissor = urlMcp.origin
  let recurso = opcoes.urlMcp
  for (const candidato of candidatosDoRecurso) {
    const { status, json } = await buscarJson(buscar, candidato, { headers: { Accept: 'application/json' } })
    if (status !== 200 || !json || typeof json !== 'object') continue
    const prm = json as { authorization_servers?: unknown; resource?: unknown }
    const servidores = Array.isArray(prm.authorization_servers) ? prm.authorization_servers.filter(ehHttps) : []
    if (servidores.length > 0) emissor = servidores[0]
    if (typeof prm.resource === 'string' && prm.resource) recurso = prm.resource
    break
  }

  // 2. O metadado do servidor de autorização. Sem metadado do recurso, o servidor MCP é o próprio servidor de autorização
  // (comportamento da versão 2025-03-26 do MCP).
  for (const candidato of candidatosDoMetadadoDoServidor(emissor)) {
    const { status, json } = await buscarJson(buscar, candidato, { headers: { Accept: 'application/json' } })
    if (status !== 200 || !json || typeof json !== 'object') continue
    const meta = json as Partial<MetadadosDoServidorDeAutorizacao>
    if (!ehHttps(meta.authorization_endpoint) || !ehHttps(meta.token_endpoint)) continue
    if (meta.registration_endpoint !== undefined && !ehHttps(meta.registration_endpoint)) delete meta.registration_endpoint
    if (meta.code_challenge_methods_supported && !meta.code_challenge_methods_supported.includes('S256')) {
      throw new ErroDeOAuth('protocolo', 'O servidor de autorização não aceita PKCE com S256.')
    }
    return { ...(meta as MetadadosDoServidorDeAutorizacao), issuer: typeof meta.issuer === 'string' ? meta.issuer : emissor, resource: recurso }
  }
  throw new ErroDeOAuth('protocolo', 'Não foi possível descobrir como autorizar neste servidor.')
}

export interface ClienteOAuth {
  clientId: string
  clientSecret: string | null
  /** Como o cliente se identifica no endpoint de token. */
  autenticacao: 'client_secret_post' | 'client_secret_basic' | 'none'
}

/** O método de autenticação do cliente: sem segredo é cliente público (`none`); com segredo, o do perfil ou `client_secret_post`. */
export function autenticacaoDoCliente(
  segredo: string | null,
  preferida?: 'client_secret_post' | 'client_secret_basic',
): ClienteOAuth['autenticacao'] {
  return segredo ? preferida ?? 'client_secret_post' : 'none'
}

/** Registra a Althius como cliente do servidor (RFC 7591). Prefere cliente público com PKCE quando o servidor deixa. */
export async function registrarClienteDinamico(opcoes: {
  endpointDeRegistro: string
  urlDeRetorno: string
  nomeDoCliente: string
  metodosDeAutenticacao?: string[]
  escopo?: string
  fetch?: typeof fetch
}): Promise<{ clientId: string; clientSecret: string | null }> {
  const buscar = opcoes.fetch ?? fetch
  const publico = !opcoes.metodosDeAutenticacao || opcoes.metodosDeAutenticacao.includes('none')
  const { status, json } = await buscarJson(buscar, opcoes.endpointDeRegistro, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: opcoes.nomeDoCliente,
      redirect_uris: [opcoes.urlDeRetorno],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: publico ? 'none' : 'client_secret_post',
      ...(opcoes.escopo ? { scope: opcoes.escopo } : {}),
    }),
  })
  const corpo = (json ?? {}) as { client_id?: unknown; client_secret?: unknown; error?: unknown }
  if (status >= 500) throw new ErroDeOAuth('indisponivel', 'O servidor de autorização está indisponível.', undefined, status)
  if (status >= 400 || typeof corpo.client_id !== 'string' || !corpo.client_id) {
    throw new ErroDeOAuth(
      'recusado',
      'O servidor de autorização recusou o registro da Althius.',
      typeof corpo.error === 'string' ? corpo.error : undefined,
      status,
    )
  }
  return {
    clientId: corpo.client_id,
    clientSecret: typeof corpo.client_secret === 'string' && corpo.client_secret ? corpo.client_secret : null,
  }
}

function base64Url(bytes: Uint8Array): string {
  let texto = ''
  for (const byte of bytes) texto += String.fromCharCode(byte)
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** O desafio PKCE S256 de um verificador: base64url(SHA-256(verificador)). */
export async function desafioPkce(verificador: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))
  return base64Url(new Uint8Array(resumo))
}

/** O endereço de consentimento: o navegador vai para ele, e o app autoriza com a conta da pessoa. */
export function urlDeConsentimento(opcoes: {
  endpointDeAutorizacao: string
  clientId: string
  urlDeRetorno: string
  state: string
  desafio: string
  escopo?: string
  recurso?: string
}): string {
  const url = new URL(opcoes.endpointDeAutorizacao)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', opcoes.clientId)
  url.searchParams.set('redirect_uri', opcoes.urlDeRetorno)
  url.searchParams.set('state', opcoes.state)
  url.searchParams.set('code_challenge', opcoes.desafio)
  url.searchParams.set('code_challenge_method', 'S256')
  if (opcoes.escopo) url.searchParams.set('scope', opcoes.escopo)
  if (opcoes.recurso) url.searchParams.set('resource', opcoes.recurso)
  return url.toString()
}

export interface TokensOAuth {
  accessToken: string
  refreshToken: string | null
  /** Segundos até o access token vencer; nulo se o servidor não disse. */
  expiraEm: number | null
  escopo: string | null
  /** A resposta inteira do endpoint de token, para ler campos próprios do app (hub_id, workspace_id…). Nunca sai da função. */
  bruto: Record<string, unknown>
}

async function pedirToken(
  tokenEndpoint: string,
  cliente: ClienteOAuth,
  parametros: Record<string, string>,
  buscar: typeof fetch,
): Promise<TokensOAuth> {
  const corpo = new URLSearchParams(parametros)
  const cabecalhos: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  if (cliente.autenticacao === 'client_secret_basic' && cliente.clientSecret) {
    cabecalhos.Authorization = `Basic ${btoa(`${encodeURIComponent(cliente.clientId)}:${encodeURIComponent(cliente.clientSecret)}`)}`
  } else {
    corpo.set('client_id', cliente.clientId)
    if (cliente.autenticacao === 'client_secret_post' && cliente.clientSecret) corpo.set('client_secret', cliente.clientSecret)
  }
  const { status, json } = await buscarJson(buscar, tokenEndpoint, { method: 'POST', headers: cabecalhos, body: corpo.toString() })
  const resposta = (json ?? {}) as Record<string, unknown>
  if (status >= 500) throw new ErroDeOAuth('indisponivel', 'O servidor de autorização está indisponível.', undefined, status)
  if (status >= 400) {
    const codigo = typeof resposta.error === 'string' ? resposta.error : undefined
    throw new ErroDeOAuth('recusado', `O servidor de autorização recusou o pedido${codigo ? ` (${codigo})` : ''}.`, codigo, status)
  }
  if (typeof resposta.access_token !== 'string' || !resposta.access_token) {
    throw new ErroDeOAuth('protocolo', 'O servidor de autorização não devolveu um access token.', undefined, status)
  }
  const expira = Number(resposta.expires_in)
  return {
    accessToken: resposta.access_token,
    refreshToken: typeof resposta.refresh_token === 'string' && resposta.refresh_token ? resposta.refresh_token : null,
    expiraEm: Number.isFinite(expira) && expira > 0 ? Math.floor(expira) : null,
    escopo: typeof resposta.scope === 'string' && resposta.scope ? resposta.scope : null,
    bruto: resposta,
  }
}

/** Troca o código de autorização pelos tokens, com o verificador PKCE. */
export function trocarCodigo(opcoes: {
  tokenEndpoint: string
  cliente: ClienteOAuth
  codigo: string
  urlDeRetorno: string
  verificador: string
  recurso?: string
  fetch?: typeof fetch
}): Promise<TokensOAuth> {
  return pedirToken(opcoes.tokenEndpoint, opcoes.cliente, {
    grant_type: 'authorization_code',
    code: opcoes.codigo,
    redirect_uri: opcoes.urlDeRetorno,
    code_verifier: opcoes.verificador,
    ...(opcoes.recurso ? { resource: opcoes.recurso } : {}),
  }, opcoes.fetch ?? fetch)
}

/** Renova o token. O servidor pode devolver um refresh token novo (HubSpot e Notion devolvem sempre): quem chama grava. */
export function renovarToken(opcoes: {
  tokenEndpoint: string
  cliente: ClienteOAuth
  refreshToken: string
  recurso?: string
  fetch?: typeof fetch
}): Promise<TokensOAuth> {
  return pedirToken(opcoes.tokenEndpoint, opcoes.cliente, {
    grant_type: 'refresh_token',
    refresh_token: opcoes.refreshToken,
    ...(opcoes.recurso ? { resource: opcoes.recurso } : {}),
  }, opcoes.fetch ?? fetch)
}
