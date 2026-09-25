import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

interface Autenticacao {
  cliente: SupabaseClient
  sessao: Session | null
  carregandoSessao: boolean
  carregando: boolean
  entrarComLink: (email: string) => Promise<void>
  sair: () => Promise<void>
}

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
    async entrarComLink(email) {
      setCarregando(true)
      try {
        const { error } = await cliente.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
        })
        if (error) throw error
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
