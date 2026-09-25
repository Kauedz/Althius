import type { Session, SupabaseClient } from '@supabase/supabase-js'

type Linha = Record<string, unknown>

interface OpcoesDoSupabaseFalso {
  /** A sessão já guardada no navegador; sem ela, o app abre no login. */
  sessao?: Session | null
  /** As linhas de cada tabela, como o RLS as devolveria ao usuário da sessão. */
  tabelas?: Record<string, Linha[]>
  /** As RPCs que o teste responde, pelo nome. Uma resposta que lança chega ao app como erro da RPC. */
  rpcs?: Record<string, (parametros: Record<string, unknown>) => unknown>
  /** As Contas de usuário que existem no Supabase Auth, com a senha de quem a definiu. */
  contas?: ContaDoAuth[]
}

/** Uma Conta de usuário no Supabase Auth do teste. */
export interface ContaDoAuth {
  id: string
  email: string
  senha?: string
}

/** Uma sessão do Supabase Auth para o usuário do teste. */
export function sessaoDe(usuario: { id: string; email: string }): Session {
  return {
    access_token: `token-${usuario.id}`,
    refresh_token: `refresh-${usuario.id}`,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: usuario.id,
      email: usuario.email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-01T00:00:00Z',
    },
  }
}

/**
 * O cliente do Supabase na fronteira com o fornecedor: Auth, as tabelas filtradas por `eq`, as RPCs e os canais do
 * Realtime, em memória. Só cobre o que o app usa; o resto não existe, para um uso novo falhar alto.
 */
export function criarSupabaseFalso({ sessao = null, tabelas = {}, rpcs = {}, contas }: OpcoesDoSupabaseFalso = {}) {
  let sessaoAtual = sessao
  const ouvintesDaSessao = new Set<(evento: string, sessao: Session | null) => void>()
  const canaisAbertos = new Set<string>()
  const linksEnviados: { email: string; link: string }[] = []
  const codigosEnviados: { email: string; codigo: string }[] = []
  const contaCom = (email: string) => contas?.find((conta) => conta.email === email.trim().toLowerCase())

  function comecarSessao(novaSessao: Session) {
    sessaoAtual = novaSessao
    for (const ouvinte of ouvintesDaSessao) ouvinte('SIGNED_IN', novaSessao)
  }

  function consulta(tabela: string) {
    const filtros: [string, unknown][] = []
    let ordem: { coluna: string; ascendente: boolean } | null = null
    const resultado = () => {
      const linhas = (tabelas[tabela] ?? []).filter((linha) => filtros.every(([coluna, valor]) => linha[coluna] === valor))
      if (!ordem) return linhas
      const { coluna, ascendente } = ordem
      return [...linhas].sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])) * (ascendente ? 1 : -1))
    }
    const construtor = {
      select: () => construtor,
      eq(coluna: string, valor: unknown) {
        filtros.push([coluna, valor])
        return construtor
      },
      order(coluna: string, opcoes?: { ascending?: boolean }) {
        ordem = { coluna, ascendente: opcoes?.ascending ?? true }
        return construtor
      },
      maybeSingle: () => Promise.resolve({ data: resultado()[0] ?? null, error: null }),
      then<T>(aoResolver: (valor: { data: Linha[]; error: null }) => T, aoRejeitar?: (motivo: unknown) => T) {
        return Promise.resolve({ data: resultado(), error: null }).then(aoResolver, aoRejeitar)
      },
    }
    return construtor
  }

  const cliente = {
    auth: {
      onAuthStateChange(ouvinte: (evento: string, sessao: Session | null) => void) {
        ouvintesDaSessao.add(ouvinte)
        return { data: { subscription: { unsubscribe: () => ouvintesDaSessao.delete(ouvinte) } } }
      },
      getSession: () => Promise.resolve({ data: { session: sessaoAtual }, error: null }),
      async signInWithOtp({ email, options }: { email: string; options?: { emailRedirectTo?: string; shouldCreateUser?: boolean } }) {
        // Com Contas de usuário simuladas, o Auth só cria uma conta se o app permitir; senão recusa o e-mail desconhecido.
        if (contas && !contaCom(email)) {
          if (options?.shouldCreateUser !== false) throw new Error('signInWithOtp criaria uma Conta de usuário: simule antes de usar')
          return { data: {}, error: { message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' } }
        }
        linksEnviados.push({ email, link: options?.emailRedirectTo ?? window.location.origin })
        codigosEnviados.push({ email, codigo: String(100000 + codigosEnviados.length * 7919) })
        return { data: {}, error: null }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const conta = contaCom(email)
        if (!conta?.senha || conta.senha !== password) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' } }
        }
        const novaSessao = sessaoDe(conta)
        comecarSessao(novaSessao)
        return { data: { user: novaSessao.user, session: novaSessao }, error: null }
      },
      async verifyOtp({ email, token, type }: { email: string; token: string; type: string }) {
        if (type !== 'email') throw new Error(`verifyOtp do tipo ${type} não é simulado`)
        const conta = contaCom(email)
        const ultimo = codigosEnviados.findLast((enviado) => enviado.email === email)
        if (!conta || ultimo?.codigo !== token.trim()) {
          return { data: { user: null, session: null }, error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' } }
        }
        const novaSessao = sessaoDe(conta)
        comecarSessao(novaSessao)
        return { data: { user: novaSessao.user, session: novaSessao }, error: null }
      },
      async signOut() {
        sessaoAtual = null
        for (const ouvinte of ouvintesDaSessao) ouvinte('SIGNED_OUT', null)
        return { error: null }
      },
    },
    from: consulta,
    async rpc(nome: string, parametros: Record<string, unknown>) {
      const responder = rpcs[nome]
      if (!responder) return { data: null, error: { message: `RPC ${nome} indisponível no teste`, code: 'PGRST202' } }
      // Uma resposta que lança vira o erro do PostgREST, como uma exceção levantada pela função no banco.
      try {
        return { data: await responder(parametros), error: null }
      } catch (erro) {
        return { data: null, error: { message: erro instanceof Error ? erro.message : String(erro), code: 'P0001' } }
      }
    },
    channel(nome: string) {
      const canal = {
        nome,
        on: () => canal,
        subscribe() {
          canaisAbertos.add(nome)
          return canal
        },
      }
      return canal
    },
    async removeChannel(canal: { nome: string }) {
      canaisAbertos.delete(canal.nome)
      return 'ok'
    },
  }

  return {
    cliente: cliente as unknown as SupabaseClient,
    /** O último link de acesso enviado a este e-mail, como a pessoa o abriria. */
    linkEnviadoPara: (email: string) => linksEnviados.findLast((enviado) => enviado.email === email)?.link,
    /** O último código de 6 dígitos enviado a este e-mail. */
    codigoEnviadoPara: (email: string) => codigosEnviados.findLast((enviado) => enviado.email === email)?.codigo,
    /** A sessão que começa nesta aba, como quando o Supabase Auth confirma o acesso. */
    iniciarSessao(novaSessao: Session) {
      sessaoAtual = novaSessao
      for (const ouvinte of ouvintesDaSessao) ouvinte('SIGNED_IN', novaSessao)
    },
    /** Os canais do Realtime inscritos agora, pelo nome. */
    canaisAbertos: () => [...canaisAbertos],
  }
}
