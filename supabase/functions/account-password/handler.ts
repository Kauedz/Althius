// A troca de senha em Meu perfil (CRM-08), feita no servidor. O navegador manda a confirmação (a senha atual ou o código
// de entrada enviado ao e-mail da sessão) e a nova senha; a função identifica a Conta de usuário pelo JWT, nunca pelo
// corpo, e só troca a senha depois de o Supabase Auth conferir a confirmação. A ordem:
//
// 1. a Conta de usuário da sessão (GET /auth/v1/user com o JWT), com o e-mail dela;
// 2. a política de senha (mínimo de 8 caracteres, até 72 bytes, nada vazado), antes de gastar o código ou a tentativa;
// 3. uma tentativa reservada no banco (claim_password_change_attempt): 5 sem sucesso em 15 minutos por Conta de usuário;
// 4. a confirmação no Supabase Auth, com o e-mail da sessão: senha atual por /token?grant_type=password, com o token do
//    Turnstile (o CAPTCHA do Auth), ou código por /verify. Isso abre uma sessão nova, que precisa ser da mesma Conta;
// 5. a troca, por PUT /auth/v1/user com essa sessão nova (com a senha atual em `current_password`, para valer com
//    "Require current password" ligado). O Auth recusa a mesma senha e encerra, na mesma transação, todas as outras
//    sessões da Conta, inclusive a que chamou a função;
// 6. as outras sessões encerradas mais uma vez, por POST /logout?scope=others, para a resposta dizer se caíram;
// 7. a resposta leva a sessão nova, que o navegador adota (setSession) para continuar dentro do Workspace.
//
// Por que não auth.admin.updateUserById: a troca pelo admin encerra todas as sessões da Conta de usuário, sem exceção,
// e quem trocou a senha cairia para fora do app logo depois. Detalhes e fontes no README.md desta função.
//
// Supabase Auth, Pwned Passwords e banco entram por injeção de dependência; o log nunca leva senha, código, token,
// CAPTCHA nem e-mail.
import { comCors } from '../_shared/cors.ts'
import { conferirTamanhoDaSenha, consultarSenhaVazada, type MotivoDaSenhaFraca } from '../_shared/politica-de-senha.ts'

export interface Db {
  /**
   * RPC claim_password_change_attempt, com a chave de serviço: reserva uma tentativa de confirmação para a Conta de
   * usuário; false quando ela já tem 5 tentativas sem sucesso nos últimos 15 minutos. Lança quando o banco falha.
   */
  claimAttempt(userId: string): Promise<boolean>
  /** RPC clear_password_change_attempts: a confirmação deu certo, e as tentativas da Conta de usuário são esquecidas. */
  clearAttempts(userId: string): Promise<void>
}

export interface Deps {
  db: Db
  /** O endereço do projeto (SUPABASE_URL); o Supabase Auth responde em /auth/v1. */
  supabaseUrl: string
  appOrigin: string
  /** As chamadas ao Supabase Auth e ao Pwned Passwords; o teste injeta um fetch sem rede. */
  fetch?: typeof fetch
  log?: (fields: Record<string, unknown>) => void
  /** Quanto o Pwned Passwords pode demorar antes de a troca seguir sem ele (padrão: 2 s). */
  tempoLimiteDaConsultaDeVazadasMs?: number
}

/** Os erros que a tela recebe, estáveis e sem detalhe: a senha errada e o código errado são o mesmo erro. */
export type CodigoDoErro =
  | 'sem_sessao'
  | 'pedido_invalido'
  | 'confirmacao_invalida'
  | 'captcha_invalido'
  | 'senha_fraca'
  | 'mesma_senha'
  | 'limite'
  | 'falha'

const STATUS: Record<CodigoDoErro, number> = {
  sem_sessao: 401,
  pedido_invalido: 400,
  confirmacao_invalida: 400,
  captcha_invalido: 400,
  senha_fraca: 422,
  mesma_senha: 422,
  limite: 429,
  falha: 502,
}

type Confirmacao =
  | { tipo: 'senha'; senhaAtual: string; captchaToken?: string }
  | { tipo: 'codigo'; codigo: string; captchaToken?: string }

interface Pedido {
  confirmacao: Confirmacao
  novaSenha: string
}

/** A sessão que o Supabase Auth abre ao conferir a senha atual ou o código. */
interface SessaoDoAuth {
  access_token: string
  refresh_token: string
  expires_in?: number
  expires_at?: number
  token_type?: string
  user?: { id?: unknown }
}

/** Uma resposta do Supabase Auth: o status, o `error_code` e o corpo lido. */
interface RespostaDoAuth {
  status: number
  codigo: string
  corpo: Record<string, unknown> | null
}

/** O código de entrada tem 6 dígitos no app; o Supabase Auth aceita até 10. */
const CODIGO = /^\d{6,10}$/
/** Nenhum campo de texto do pedido passa disso: a senha atual tem no máximo 72 bytes, e o token do Turnstile, ~2 mil. */
const TAMANHO_MAXIMO_DO_CAMPO = 4096

/** O pedido do navegador, ou null quando falta algo ou sobra tamanho. */
function lerPedido(corpo: unknown): Pedido | null {
  if (!corpo || typeof corpo !== 'object') return null
  const { confirmacao, novaSenha } = corpo as Record<string, unknown>
  if (typeof novaSenha !== 'string' || novaSenha.length > TAMANHO_MAXIMO_DO_CAMPO) return null
  if (!confirmacao || typeof confirmacao !== 'object') return null
  const { tipo, senhaAtual, codigo, captchaToken } = confirmacao as Record<string, unknown>
  if (captchaToken !== undefined && (typeof captchaToken !== 'string' || captchaToken.length > TAMANHO_MAXIMO_DO_CAMPO)) {
    return null
  }
  const captcha = typeof captchaToken === 'string' && captchaToken.trim() ? { captchaToken: captchaToken.trim() } : {}
  if (tipo === 'senha' && typeof senhaAtual === 'string' && senhaAtual && senhaAtual.length <= TAMANHO_MAXIMO_DO_CAMPO) {
    return { confirmacao: { tipo, senhaAtual, ...captcha }, novaSenha }
  }
  if (tipo === 'codigo' && typeof codigo === 'string' && CODIGO.test(codigo.trim())) {
    return { confirmacao: { tipo, codigo: codigo.trim(), ...captcha }, novaSenha }
  }
  return null
}

/** O limite de taxa do Supabase Auth (429, `over_request_rate_limit` e afins). */
const limiteDoAuth = (resposta: RespostaDoAuth) => resposta.status === 429 || resposta.codigo.startsWith('over_')

/** Por que o Supabase Auth recusou a senha atual ou o código, sem dizer qual dos dois. */
function erroDaConfirmacao(resposta: RespostaDoAuth): CodigoDoErro {
  if (resposta.codigo === 'captcha_failed') return 'captcha_invalido'
  if (limiteDoAuth(resposta)) return 'limite'
  if (resposta.status >= 400 && resposta.status < 500) return 'confirmacao_invalida'
  return 'falha'
}

/** Por que o Supabase Auth recusou a troca; o motivo da senha fraca vem dos `reasons` dele. */
function erroDaTroca(resposta: RespostaDoAuth): { erro: CodigoDoErro; motivo?: MotivoDaSenhaFraca } {
  if (resposta.codigo === 'same_password') return { erro: 'mesma_senha' }
  if (resposta.codigo === 'weak_password') {
    const reasons = (resposta.corpo?.weak_password as { reasons?: unknown } | undefined)?.reasons
    return { erro: 'senha_fraca', motivo: Array.isArray(reasons) && reasons.includes('length') ? 'curta' : 'vazada' }
  }
  if (limiteDoAuth(resposta)) return { erro: 'limite' }
  // Acabamos de conferir a confirmação; se o Auth ainda assim recusa a senha atual, vale como confirmação errada.
  if (resposta.codigo === 'current_password_invalid' || resposta.codigo === 'current_password_required') {
    return { erro: 'confirmacao_invalida' }
  }
  return { erro: 'falha' }
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((fields) => console.log(JSON.stringify(fields)))
  const buscar = deps.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const auth = `${deps.supabaseUrl.replace(/\/+$/, '')}/auth/v1`

  function responder(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  function recusar(erro: CodigoDoErro, extra: Record<string, unknown> = {}) {
    return responder({ erro, ...extra }, STATUS[erro])
  }

  /**
   * Chama o Supabase Auth com a chave publicável de quem pediu (`apikey`) e, quando há, o token da sessão. Sem token,
   * o Auth vê um pedido anônimo, como o do navegador: o CAPTCHA vale. Lança só em falha de rede.
   */
  async function chamarAuth(
    caminho: string,
    { metodo = 'POST', apikey, token, corpo }: { metodo?: string; apikey: string; token?: string; corpo?: unknown },
  ): Promise<RespostaDoAuth> {
    const headers: Record<string, string> = {
      apikey,
      'Content-Type': 'application/json',
      // Com a versão da API, os erros vêm com `error_code`, como o supabase-js os lê.
      'X-Supabase-Api-Version': '2024-01-01',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const resposta = await buscar(`${auth}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    let lido: Record<string, unknown> | null = null
    try {
      const texto = await resposta.text()
      lido = texto ? JSON.parse(texto) : null
    } catch {
      lido = null
    }
    const codigo = typeof lido?.error_code === 'string' ? lido.error_code : typeof lido?.code === 'string' ? lido.code : ''
    return { status: resposta.status, codigo, corpo: lido && typeof lido === 'object' ? lido : null }
  }

  /** A Conta de usuário do JWT, se a sessão ainda existe no Supabase Auth e tem e-mail. */
  async function contaDaSessao(token: string, apikey: string): Promise<{ id: string; email: string } | null> {
    const resposta = await chamarAuth('/user', { metodo: 'GET', apikey, token })
    const id = resposta.corpo?.id
    const email = resposta.corpo?.email
    return resposta.status === 200 && typeof id === 'string' && typeof email === 'string' && email ? { id, email } : null
  }

  /** Confere a senha atual ou o código no Supabase Auth, com o e-mail da sessão; devolve a sessão que ele abre. */
  async function confirmar(confirmacao: Confirmacao, email: string, apikey: string) {
    const seguranca = confirmacao.captchaToken ? { gotrue_meta_security: { captcha_token: confirmacao.captchaToken } } : {}
    const resposta = confirmacao.tipo === 'senha'
      ? await chamarAuth('/token?grant_type=password', {
        apikey,
        corpo: { email, password: confirmacao.senhaAtual, ...seguranca },
      })
      : await chamarAuth('/verify', { apikey, corpo: { type: 'email', email, token: confirmacao.codigo, ...seguranca } })
    const corpo = resposta.corpo
    if (resposta.status === 200 && typeof corpo?.access_token === 'string' && typeof corpo.refresh_token === 'string') {
      return { sessao: corpo as unknown as SessaoDoAuth, resposta }
    }
    return { sessao: null, resposta }
  }

  /** Encerra a sessão aberta pela confirmação, quando ela não vai para o navegador. Uma falha só fica no log. */
  async function descartar(sessao: SessaoDoAuth, apikey: string) {
    try {
      const resposta = await chamarAuth('/logout?scope=local', { apikey, token: sessao.access_token })
      if (resposta.status >= 300) log({ type: 'account_password', outcome: 'descarte_falhou', status: resposta.status })
    } catch {
      log({ type: 'account_password', outcome: 'descarte_falhou' })
    }
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return responder({ erro: 'metodo_nao_permitido' }, 405)

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    if (!authorization.startsWith('Bearer ') || !apikey) return recusar('sem_sessao')

    let conta: { id: string; email: string } | null
    try {
      conta = await contaDaSessao(authorization.slice(7), apikey)
    } catch {
      log({ type: 'account_password', outcome: 'falha', etapa: 'sessao' })
      return recusar('falha')
    }
    // Sem e-mail não há como confirmar; a Althius só tem Contas de usuário com e-mail.
    if (!conta) return recusar('sem_sessao')

    let pedido: Pedido | null
    try {
      pedido = lerPedido(await req.json())
    } catch {
      pedido = null
    }
    if (!pedido) return recusar('pedido_invalido')
    const { confirmacao, novaSenha } = pedido
    const registrar = (outcome: string, extra: Record<string, unknown> = {}) =>
      log({ type: 'account_password', userId: conta!.id, confirmacao: confirmacao.tipo, outcome, ...extra })

    // A política antes da confirmação, para não gastar o código nem a tentativa com uma senha que não serve.
    const tamanho = conferirTamanhoDaSenha(novaSenha)
    if (tamanho) {
      registrar('senha_fraca', { motivo: tamanho })
      return recusar('senha_fraca', { motivo: tamanho })
    }
    const vazada = await consultarSenhaVazada(novaSenha, buscar, deps.tempoLimiteDaConsultaDeVazadasMs)
    if (vazada === 'vazada') {
      registrar('senha_fraca', { motivo: 'vazada' })
      return recusar('senha_fraca', { motivo: 'vazada' })
    }
    if (vazada === 'indisponivel') registrar('consulta_de_vazadas_indisponivel')

    let reservada: boolean
    try {
      reservada = await deps.db.claimAttempt(conta.id)
    } catch (error) {
      registrar('falha', { etapa: 'tentativa', message: String(error) })
      return recusar('falha')
    }
    if (!reservada) {
      registrar('limite', { origem: 'tentativas' })
      return recusar('limite')
    }

    let confirmada: Awaited<ReturnType<typeof confirmar>>
    try {
      confirmada = await confirmar(confirmacao, conta.email, apikey)
    } catch {
      registrar('falha', { etapa: 'confirmacao' })
      return recusar('falha')
    }
    const { sessao, resposta } = confirmada
    if (!sessao) {
      const erro = erroDaConfirmacao(resposta)
      registrar(erro, { status: resposta.status, authCode: resposta.codigo })
      return recusar(erro)
    }
    if (sessao.user?.id !== conta.id) {
      await descartar(sessao, apikey)
      registrar('confirmacao_invalida', { motivo: 'outra_conta' })
      return recusar('confirmacao_invalida')
    }
    try {
      await deps.db.clearAttempts(conta.id)
    } catch (error) {
      registrar('limpeza_das_tentativas_falhou', { message: String(error) })
    }

    let troca: RespostaDoAuth
    try {
      troca = await chamarAuth('/user', {
        metodo: 'PUT',
        apikey,
        token: sessao.access_token,
        corpo: { password: novaSenha, ...(confirmacao.tipo === 'senha' ? { current_password: confirmacao.senhaAtual } : {}) },
      })
    } catch {
      // Sem resposta, a troca pode ou não ter acontecido; a sessão da confirmação não vai para o navegador.
      await descartar(sessao, apikey)
      registrar('falha', { etapa: 'troca' })
      return recusar('falha')
    }
    if (troca.status !== 200) {
      await descartar(sessao, apikey)
      const { erro, motivo } = erroDaTroca(troca)
      registrar(erro, { status: troca.status, authCode: troca.codigo, ...(motivo ? { motivo } : {}) })
      return recusar(erro, motivo ? { motivo } : {})
    }

    // O Auth já encerrou as outras sessões junto com a troca; esta chamada confirma isso para a resposta.
    let outrasSessoesEncerradas = false
    try {
      const saida = await chamarAuth('/logout?scope=others', { apikey, token: sessao.access_token })
      outrasSessoesEncerradas = saida.status >= 200 && saida.status < 300
    } catch {
      outrasSessoesEncerradas = false
    }
    registrar('trocada', { outrasSessoesEncerradas })
    return responder({
      ok: true,
      outrasSessoesEncerradas,
      sessao: {
        access_token: sessao.access_token,
        refresh_token: sessao.refresh_token,
        expires_in: sessao.expires_in,
        expires_at: sessao.expires_at,
        token_type: sessao.token_type ?? 'bearer',
      },
    })
  })
}
