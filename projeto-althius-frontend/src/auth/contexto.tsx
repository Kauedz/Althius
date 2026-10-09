import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { corpoDoErroDaFuncao } from '@/fonte/falha-da-edge-function'
import { ROTA_DE_REDEFINICAO_DA_SENHA, enderecoDeRedefinicao } from './destino'
import { TAMANHO_MINIMO_DA_SENHA } from './nova-senha'
import type { AcaoDoCaptcha, ServicosDoNavegador } from './servicos-do-navegador'

interface Autenticacao {
  cliente: SupabaseClient
  sessao: Session | null
  carregandoSessao: boolean
  carregando: boolean
  /** Entra com e-mail e senha. Qualquer recusa vira "E-mail ou senha incorretos", sem revelar se o e-mail existe. */
  entrarComSenha: (email: string, senha: string) => Promise<void>
  /**
   * Envia o código de 6 dígitos e o link de entrada, sem criar Conta de usuário; o link volta para `destino`, um
   * caminho deste app. Um e-mail sem conta recebe a mesma resposta na tela.
   */
  pedirCodigoDeEntrada: (email: string, destino: string) => Promise<void>
  /** Entra com o código de 6 dígitos enviado por `pedirCodigoDeEntrada`. */
  confirmarCodigoDeEntrada: (email: string, codigo: string) => Promise<void>
  /**
   * Mostra o "Continuar com Google" (botão oficial e One Tap) em `elemento`; ausente sem o Client ID do Google. A conta
   * escolhida entra por ID token com nonce, criando ou encontrando a Conta de usuário do e-mail verificado; cancelar a
   * escolha não faz nada, e uma recusa chega a `aoFalhar`. Devolve a limpeza, que fecha o One Tap.
   */
  iniciarGoogle?: (elemento: HTMLElement, opcoes: { contexto: 'signin' | 'signup'; aoFalhar: (mensagem: string) => void }) => () => void
  sair: () => Promise<void>
  /**
   * Cria a Conta de usuário com senha e envia o código de confirmação, sem abrir sessão. Um e-mail que já tem conta
   * recebe a mesma resposta, para a tela não revelar quem está cadastrado. Senha vazada é recusada antes.
   */
  cadastrar: (dados: { nome: string; email: string; senha: string }, destino: string) => Promise<void>
  /** Confirma o e-mail do cadastro com o código de 6 dígitos; a sessão começa em seguida. */
  confirmarCodigoDoCadastro: (email: string, codigo: string) => Promise<void>
  /** Envia um novo código (e link) de confirmação do cadastro. */
  reenviarCodigoDoCadastro: (email: string, destino: string) => Promise<void>
  /**
   * A sessão atual veio de um código ou link de redefinição: antes de abrir o Workspace, a pessoa define a nova senha.
   */
  redefinindoSenha: boolean
  /**
   * Envia o código de 6 dígitos e o link de redefinição; o link abre /redefinir-a-senha e depois volta para `destino`.
   * Um e-mail sem conta recebe a mesma resposta na tela.
   */
  pedirRedefinicaoDeSenha: (email: string, destino: string) => Promise<void>
  /** Confirma o código de redefinição; a sessão começa já no passo de definir a nova senha. */
  confirmarCodigoDeRedefinicao: (email: string, codigo: string) => Promise<void>
  /** Grava a nova senha, encerra as outras sessões da Conta de usuário e segue para o Workspace de entrada. */
  definirNovaSenha: (senha: string) => Promise<void>
  /**
   * Troca (ou define) a senha da Conta de usuário da sessão em Meu perfil, no servidor: a Edge Function account-password
   * identifica a Conta pelo JWT, confere no Supabase Auth a senha atual ou o código de entrada enviado ao e-mail da
   * sessão por `pedirCodigoDeEntrada` (o caminho de quem entrou só com Google), aplica a política do cadastro e só
   * então troca a senha. Toda tentativa confirma de novo que é a pessoa. As outras sessões são encerradas, e esta aba
   * continua com a sessão aberta pela confirmação. As identidades (Google, e-mail) continuam todas na mesma Conta de
   * usuário. Resolve depois que a senha foi trocada, dizendo se as outras sessões caíram.
   */
  trocarSenha: (confirmacao: ConfirmacaoDeIdentidade, novaSenha: string) => Promise<SenhaTrocada>
}

/** Como a pessoa confirma que é ela antes de trocar a senha: a senha atual ou o código de entrada enviado ao e-mail. */
export type ConfirmacaoDeIdentidade = { senhaAtual: string } | { codigo: string }

/** A senha já foi trocada; `outrasSessoesEncerradas` diz se as outras sessões da Conta de usuário caíram. */
export interface SenhaTrocada {
  outrasSessoesEncerradas: boolean
}

/** A única resposta a um login recusado, para a tela não revelar se o e-mail tem conta. */
const ERRO_DE_LOGIN = 'E-mail ou senha incorretos'

/** A recusa de uma senha vazada, venha da consulta feita pela tela ou do `weak_password` do Supabase Auth. */
const ERRO_DE_SENHA_VAZADA = 'Esta senha já apareceu em vazamentos de dados. Escolha outra senha.'

/** A Edge Function que avisa por e-mail quem tenta se cadastrar com um e-mail que já tem conta. */
const FUNCAO_DO_AVISO_DE_CONTA_EXISTENTE = 'existing-account-email'

/** Quanto a consulta de senhas vazadas pode demorar antes de a tela seguir sem ela. */
const TEMPO_LIMITE_DA_CONSULTA_DE_VAZADAS_MS = 2_000

/**
 * Recusa a senha que o Pwned Passwords conhece. É uma barreira de interface: se a consulta falhar ou demorar, a senha
 * segue, para o serviço de fora não impedir o cadastro nem a redefinição.
 */
async function recusarSenhaVazada(servicos: ServicosDoNavegador, senha: string) {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const vazada = await Promise.race([
    servicos.senhaVazada(senha).catch(() => false),
    new Promise<boolean>((resolver) => { relogio = setTimeout(() => resolver(false), TEMPO_LIMITE_DA_CONSULTA_DE_VAZADAS_MS) }),
  ])
  clearTimeout(relogio)
  if (vazada) throw new Error(ERRO_DE_SENHA_VAZADA)
}

/**
 * Um nonce novo para o login com Google: o Google recebe o SHA-256 dele, em hexadecimal, e o Supabase recebe o nonce
 * cru, para conferir que o ID token foi emitido para esta página.
 */
async function novoNonce() {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const nonceComHash = Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { nonce, nonceComHash }
}

/** A falha do CAPTCHA, venha do Turnstile no navegador ou da recusa `captcha_failed` do Supabase Auth. */
const ERRO_DO_CAPTCHA = 'Não foi possível confirmar que você é uma pessoa. Tente novamente.'

/**
 * As opções com o token do Turnstile para esta ação, a espalhar nas `options` da chamada ao Supabase Auth; vazias
 * sem Turnstile configurado. Cada tentativa pede um token novo, porque o Supabase aceita cada token uma vez só.
 */
async function comCaptcha(servicos: ServicosDoNavegador, acao: AcaoDoCaptcha): Promise<{ captchaToken?: string }> {
  let token: string | null
  try {
    token = await servicos.tokenDoCaptcha(acao)
  } catch {
    throw new Error(ERRO_DO_CAPTCHA)
  }
  return token ? { captchaToken: token } : {}
}

/** Troca a recusa do CAPTCHA pelo Supabase Auth pela mensagem clara, antes de qualquer outra leitura do erro. */
function recusarCaptcha(error: { code?: string } | null) {
  if (error?.code === 'captcha_failed') throw new Error(ERRO_DO_CAPTCHA)
}

const ERRO_DE_ENVIO_DO_CODIGO = 'Não foi possível enviar o código agora. Tente novamente em instantes.'

/**
 * O Auth só devolve o limite de envio (`over_email_send_rate_limit`, 429) para um e-mail que tem conta e acabou de
 * receber outro: tratá-lo como sucesso mantém a resposta igual à de um e-mail sem conta.
 */
function atingiuLimiteDeEnvio(error: { code?: string; status?: number } | null) {
  return error?.code === 'over_email_send_rate_limit' || error?.status === 429
}

const Contexto = createContext<Autenticacao | null>(null)

/**
 * Grava a nova senha da sessão atual (a de recuperação, no "Esqueci a senha") e encerra as outras sessões da Conta de
 * usuário. Quem chama já recusou a senha vazada; o `weak_password` do Supabase Auth (senhas vazadas no servidor) vira
 * a mesma mensagem. Lança só se a senha não foi trocada; depois dela, devolve se as outras sessões caíram.
 */
async function gravarNovaSenha(cliente: SupabaseClient, senha: string): Promise<SenhaTrocada> {
  const { error } = await cliente.auth.updateUser({ password: senha })
  if (error?.code === 'weak_password') throw new Error(ERRO_DE_SENHA_VAZADA)
  if (error?.code === 'same_password') throw new Error('A nova senha precisa ser diferente da atual.')
  if (error) throw new Error('Não foi possível salvar a nova senha. Tente novamente em instantes.')
  // Quem troca a senha por suspeita de invasão expulsa as outras sessões; esta continua aberta.
  const saida = await cliente.auth.signOut({ scope: 'others' })
  return { outrasSessoesEncerradas: !saida.error }
}

const ERRO_AO_ENCERRAR_AS_OUTRAS_SESSOES =
  'A senha foi trocada, mas não foi possível encerrar as outras sessões. Tente sair e entrar de novo.'

/** A Edge Function que troca a senha em Meu perfil depois de conferir a senha atual ou o código (CRM-08). */
const FUNCAO_DA_TROCA_DE_SENHA = 'account-password'

/** O que a account-password devolve quando a senha foi trocada. */
interface SenhaTrocadaNoServidor {
  outrasSessoesEncerradas?: unknown
  /** A sessão aberta pela confirmação: o Supabase Auth encerrou a desta aba ao trocar a senha. */
  sessao?: { access_token?: unknown; refresh_token?: unknown }
}

/**
 * A recusa da account-password em palavras da tela. A função não diz se a senha ou o código está errado; a tela sabe
 * qual dos dois a pessoa mandou.
 */
async function mensagemDaRecusaDaTroca(error: unknown, confirmacao: ConfirmacaoDeIdentidade): Promise<string> {
  const corpo = await corpoDoErroDaFuncao(error)
  switch (corpo?.erro) {
    case 'confirmacao_invalida':
      return 'codigo' in confirmacao
        ? 'Código inválido ou expirado. Confira o código ou peça outro.'
        : 'A senha atual não confere. Tente de novo ou confirme por código.'
    case 'captcha_invalido':
      return ERRO_DO_CAPTCHA
    case 'senha_fraca':
      if (corpo.motivo === 'curta') return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`
      if (corpo.motivo === 'longa') return 'A senha é longa demais. Use até 72 caracteres.'
      return ERRO_DE_SENHA_VAZADA
    case 'mesma_senha':
      return 'A nova senha precisa ser diferente da atual.'
    case 'limite':
      return 'Muitas tentativas de trocar a senha. Espere alguns minutos e tente de novo.'
    case 'sem_sessao':
      return 'Entre de novo para trocar a senha.'
    default:
      return 'Não foi possível salvar a nova senha. Tente novamente em instantes.'
  }
}

export function ContextoDeAutenticacao({
  cliente,
  servicos,
  children,
}: {
  cliente: SupabaseClient
  servicos: ServicosDoNavegador
  children: ReactNode
}) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  const [carregando, setCarregando] = useState(false)
  // O link de redefinição abre /redefinir-a-senha; o Supabase troca o link pela sessão ao carregar a página.
  const [redefinindoSenha, setRedefinindoSenha] = useState(() => window.location.pathname === ROTA_DE_REDEFINICAO_DA_SENHA)

  useEffect(() => {
    let ativo = true
    const { data: { subscription } } = cliente.auth.onAuthStateChange((evento, novaSessao) => {
      if (evento === 'PASSWORD_RECOVERY') setRedefinindoSenha(true)
      if (evento === 'SIGNED_OUT') setRedefinindoSenha(false)
      setSessao(novaSessao)
      setCarregandoSessao(false)
    })
    void cliente.auth.getSession().then(({ data, error }) => {
      if (!ativo) return
      if (!error) setSessao(data.session)
      setCarregandoSessao(false)
    })
    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [cliente])

  // Estável entre renderizações, para a tela não reiniciar o botão e o One Tap a cada mudança de estado.
  const iniciarGoogle = useCallback<NonNullable<Autenticacao['iniciarGoogle']>>((elemento, { contexto, aoFalhar }) => {
    const google = servicos.google!
    let ativo = true
    let limpar: (() => void) | undefined
    void novoNonce().then(({ nonce, nonceComHash }) => {
      if (!ativo) return
      limpar = google.iniciar({
        elemento,
        nonceComHash,
        contexto,
        aoReceberCredencial(idToken) {
          void cliente.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce }).then(({ error }) => {
            if (error) aoFalhar('Não foi possível entrar com Google. Tente novamente ou use outro método.')
          })
        },
      })
    })
    return () => {
      ativo = false
      limpar?.()
    }
  }, [cliente, servicos])

  const valor = useMemo<Autenticacao>(() => ({
    cliente,
    sessao,
    carregandoSessao,
    carregando,
    async entrarComSenha(email, senha) {
      setCarregando(true)
      try {
        const captcha = await comCaptcha(servicos, 'login_com_senha')
        const { error } = await cliente.auth.signInWithPassword({ email: email.trim(), password: senha, options: captcha })
        recusarCaptcha(error)
        if (error) throw new Error(ERRO_DE_LOGIN)
      } finally {
        setCarregando(false)
      }
    },
    async pedirCodigoDeEntrada(email, destino) {
      setCarregando(true)
      try {
        const captcha = await comCaptcha(servicos, 'codigo_de_entrada')
        const { error } = await cliente.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + destino, ...captcha },
        })
        recusarCaptcha(error)
        // Sem conta para o e-mail, o Auth recusa criar uma; a tela responde igual, para não revelar quem tem conta.
        if (error && error.code !== 'otp_disabled' && error.code !== 'user_not_found' && !atingiuLimiteDeEnvio(error)) {
          throw new Error(ERRO_DE_ENVIO_DO_CODIGO)
        }
      } finally {
        setCarregando(false)
      }
    },
    async confirmarCodigoDeEntrada(email, codigo) {
      setCarregando(true)
      try {
        const { error } = await cliente.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: 'email' })
        if (error) throw new Error('Código inválido ou expirado. Confira o código ou peça outro.')
      } finally {
        setCarregando(false)
      }
    },
    iniciarGoogle: servicos.google ? iniciarGoogle : undefined,
    async sair() {
      setCarregando(true)
      try {
        const { error } = await cliente.auth.signOut()
        if (error) throw error
      } finally {
        setCarregando(false)
      }
    },
    async cadastrar({ nome, email, senha }, destino) {
      await recusarSenhaVazada(servicos, senha)
      const captcha = await comCaptcha(servicos, 'cadastro')
      const { data, error } = await cliente.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { full_name: nome.trim() }, emailRedirectTo: window.location.origin + destino, ...captcha },
      })
      recusarCaptcha(error)
      if (error?.code === 'weak_password') throw new Error(ERRO_DE_SENHA_VAZADA)
      if (error) throw new Error('Não foi possível criar a conta agora. Tente novamente em instantes.')
      // Um e-mail que já tem conta volta como usuário sem identidades, e o Supabase Auth não manda nada. A Edge Function
      // confere a conta e manda o e-mail que explica como entrar; a tela não espera nem mostra o resultado, para
      // responder igual ao cadastro novo.
      if (data.user?.identities?.length === 0) {
        cliente.functions.invoke(FUNCAO_DO_AVISO_DE_CONTA_EXISTENTE, { body: { email: email.trim() } }).catch(() => {})
      }
    },
    async confirmarCodigoDoCadastro(email, codigo) {
      const { error } = await cliente.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: 'signup' })
      if (error) throw error
    },
    async reenviarCodigoDoCadastro(email, destino) {
      const captcha = await comCaptcha(servicos, 'reenvio_do_cadastro')
      const { error } = await cliente.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + destino, ...captcha },
      })
      recusarCaptcha(error)
      if (error) throw error
    },
    redefinindoSenha,
    async pedirRedefinicaoDeSenha(email, destino) {
      setCarregando(true)
      try {
        const captcha = await comCaptcha(servicos, 'redefinicao_de_senha')
        const { error } = await cliente.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDeRedefinicao(destino), ...captcha })
        recusarCaptcha(error)
        if (error && !atingiuLimiteDeEnvio(error)) throw new Error(ERRO_DE_ENVIO_DO_CODIGO)
      } finally {
        setCarregando(false)
      }
    },
    async confirmarCodigoDeRedefinicao(email, codigo) {
      setCarregando(true)
      // Marcado antes da sessão começar, para o Workspace não abrir antes da nova senha.
      setRedefinindoSenha(true)
      try {
        const { error } = await cliente.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: 'recovery' })
        if (error) {
          setRedefinindoSenha(false)
          throw new Error('Código inválido ou expirado. Confira o código ou peça outro.')
        }
      } finally {
        setCarregando(false)
      }
    },
    async definirNovaSenha(senha) {
      setCarregando(true)
      try {
        await recusarSenhaVazada(servicos, senha)
        const { outrasSessoesEncerradas } = await gravarNovaSenha(cliente, senha)
        if (!outrasSessoesEncerradas) throw new Error(ERRO_AO_ENCERRAR_AS_OUTRAS_SESSOES)
        setRedefinindoSenha(false)
      } finally {
        setCarregando(false)
      }
    },
    async trocarSenha(confirmacao, novaSenha) {
      if (!sessao?.user.email) throw new Error('Entre de novo para trocar a senha.')
      setCarregando(true)
      try {
        // A senha vazada é recusada antes de chamar a função, para não gastar o código; o servidor confere de novo.
        await recusarSenhaVazada(servicos, novaSenha)
        // Um token novo do Turnstile por tentativa: a função o repassa ao Supabase Auth, que aceita cada token uma vez.
        const captcha = await comCaptcha(servicos, 'troca_de_senha')
        const { data, error } = await cliente.functions.invoke(FUNCAO_DA_TROCA_DE_SENHA, {
          body: {
            confirmacao: 'codigo' in confirmacao
              ? { tipo: 'codigo', codigo: confirmacao.codigo.trim(), ...captcha }
              : { tipo: 'senha', senhaAtual: confirmacao.senhaAtual, ...captcha },
            novaSenha,
          },
        })
        if (error) throw new Error(await mensagemDaRecusaDaTroca(error, confirmacao))
        const trocada = (data ?? {}) as SenhaTrocadaNoServidor
        // O Supabase Auth encerrou a sessão desta aba ao trocar a senha; ela segue com a sessão aberta pela confirmação.
        const { access_token, refresh_token } = trocada.sessao ?? {}
        const adotada = typeof access_token === 'string' && typeof refresh_token === 'string'
          ? await cliente.auth.setSession({ access_token, refresh_token })
          : { error: new Error('A account-password não devolveu a sessão') }
        if (adotada.error) {
          // Sem a sessão nova, a antiga já não vale: sair daqui leva à entrada, onde a nova senha funciona.
          await cliente.auth.signOut({ scope: 'local' })
          throw new Error('A senha foi trocada. Entre de novo com a nova senha.')
        }
        return { outrasSessoesEncerradas: trocada.outrasSessoesEncerradas === true }
      } finally {
        setCarregando(false)
      }
    },
  }), [cliente, servicos, sessao, carregandoSessao, carregando, redefinindoSenha, iniciarGoogle])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAutenticacao(): Autenticacao {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAutenticacao precisa de ContextoDeAutenticacao')
  return contexto
}
