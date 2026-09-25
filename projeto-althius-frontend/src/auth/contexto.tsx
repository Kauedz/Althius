import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { ROTA_DE_REDEFINICAO_DA_SENHA, enderecoDeRedefinicao } from './destino'
import type { ServicosDoNavegador } from './servicos-do-navegador'

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
}

/** A única resposta a um login recusado, para a tela não revelar se o e-mail tem conta. */
const ERRO_DE_LOGIN = 'E-mail ou senha incorretos'

/** A recusa de uma senha vazada, venha da consulta feita pela tela ou do `weak_password` do Supabase Auth. */
const ERRO_DE_SENHA_VAZADA = 'Esta senha já apareceu em vazamentos de dados. Escolha outra senha.'

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

const Contexto = createContext<Autenticacao | null>(null)

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

  const valor = useMemo<Autenticacao>(() => ({
    cliente,
    sessao,
    carregandoSessao,
    carregando,
    async entrarComSenha(email, senha) {
      setCarregando(true)
      try {
        const { error } = await cliente.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw new Error(ERRO_DE_LOGIN)
      } finally {
        setCarregando(false)
      }
    },
    async pedirCodigoDeEntrada(email, destino) {
      setCarregando(true)
      try {
        const { error } = await cliente.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + destino },
        })
        // Sem conta para o e-mail, o Auth recusa criar uma; a tela responde igual, para não revelar quem tem conta.
        if (error && error.code !== 'otp_disabled' && error.code !== 'user_not_found') throw error
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
      const { error } = await cliente.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { full_name: nome.trim() }, emailRedirectTo: window.location.origin + destino },
      })
      if (error?.code === 'weak_password') throw new Error(ERRO_DE_SENHA_VAZADA)
      if (error) throw new Error('Não foi possível criar a conta agora. Tente novamente em instantes.')
    },
    async confirmarCodigoDoCadastro(email, codigo) {
      const { error } = await cliente.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: 'signup' })
      if (error) throw error
    },
    async reenviarCodigoDoCadastro(email, destino) {
      const { error } = await cliente.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + destino },
      })
      if (error) throw error
    },
    redefinindoSenha,
    async pedirRedefinicaoDeSenha(email, destino) {
      setCarregando(true)
      try {
        const { error } = await cliente.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDeRedefinicao(destino) })
        if (error) throw new Error('Não foi possível enviar o código agora. Tente novamente em instantes.')
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
        const { error } = await cliente.auth.updateUser({ password: senha })
        if (error?.code === 'weak_password') throw new Error(ERRO_DE_SENHA_VAZADA)
        if (error?.code === 'same_password') throw new Error('A nova senha precisa ser diferente da atual.')
        if (error) throw new Error('Não foi possível salvar a nova senha. Tente novamente em instantes.')
        // Quem troca a senha por suspeita de invasão expulsa as outras sessões; esta continua aberta.
        const saida = await cliente.auth.signOut({ scope: 'others' })
        if (saida.error) throw new Error('A senha foi trocada, mas não foi possível encerrar as outras sessões. Tente sair e entrar de novo.')
        setRedefinindoSenha(false)
      } finally {
        setCarregando(false)
      }
    },
  }), [cliente, servicos, sessao, carregandoSessao, carregando, redefinindoSenha])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAutenticacao(): Autenticacao {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAutenticacao precisa de ContextoDeAutenticacao')
  return contexto
}
