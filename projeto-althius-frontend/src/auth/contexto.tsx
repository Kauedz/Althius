import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

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
}

/** A única resposta a um login recusado, para a tela não revelar se o e-mail tem conta. */
const ERRO_DE_LOGIN = 'E-mail ou senha incorretos'

const Contexto = createContext<Autenticacao | null>(null)

export function ContextoDeAutenticacao({ cliente, children }: { cliente: SupabaseClient; children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let ativo = true
    const { data: { subscription } } = cliente.auth.onAuthStateChange((_evento, novaSessao) => {
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
  }), [cliente, sessao, carregandoSessao, carregando])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAutenticacao(): Autenticacao {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAutenticacao precisa de ContextoDeAutenticacao')
  return contexto
}
