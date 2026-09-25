import type { Session, SupabaseClient } from '@supabase/supabase-js'

type Linha = Record<string, unknown>

interface OpcoesDoSupabaseFalso {
  /** A sessão já guardada no navegador; sem ela, o app abre no login. */
  sessao?: Session | null
  /** As linhas de cada tabela, como o RLS as devolveria ao usuário da sessão. */
  tabelas?: Record<string, Linha[]>
  /** As RPCs que o teste responde, pelo nome. Uma resposta que lança chega ao app como erro da RPC. */
  rpcs?: Record<string, (parametros: Record<string, unknown>) => unknown>
  /** Os e-mails que já têm Conta de usuário verificada no Supabase Auth. */
  contas?: string[]
}

/** Uma Conta de usuário criada pelo `signUp`, ainda sem ou já com o e-mail verificado. */
interface ContaDoCadastro {
  id: string
  email: string
  nome: string
  verificada: boolean
  codigo: string
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
export function criarSupabaseFalso({ sessao = null, tabelas = {}, rpcs = {}, contas = [] }: OpcoesDoSupabaseFalso = {}) {
  let sessaoAtual = sessao
  const ouvintesDaSessao = new Set<(evento: string, sessao: Session | null) => void>()
  const canaisAbertos = new Set<string>()
  const linksEnviados: { email: string; link: string }[] = []
  const contasExistentes = new Set(contas)
  const cadastros = new Map<string, ContaDoCadastro>()
  let codigosEmitidos = 0
  const novoCodigo = () => String(123456 + codigosEmitidos++ * 111111).slice(-6)

  function iniciar(novaSessao: Session) {
    sessaoAtual = novaSessao
    for (const ouvinte of ouvintesDaSessao) ouvinte('SIGNED_IN', novaSessao)
  }

  function sessaoDoCadastro(conta: ContaDoCadastro): Session {
    const nova = sessaoDe({ id: conta.id, email: conta.email })
    return { ...nova, user: { ...nova.user, user_metadata: { full_name: conta.nome } } }
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
      async signInWithOtp({ email, options }: { email: string; options?: { emailRedirectTo?: string } }) {
        linksEnviados.push({ email, link: options?.emailRedirectTo ?? window.location.origin })
        return { data: {}, error: null }
      },
      // Com "Confirm email" ligado: nunca há sessão no cadastro, e um e-mail que já tem conta recebe a mesma resposta
      // (usuário ofuscado), sem código nem e-mail enviado pelo Supabase.
      async signUp({ email, password, options }: {
        email: string
        password: string
        options?: { emailRedirectTo?: string; data?: { full_name?: string } }
      }) {
        if (password.length < 6) return { data: { user: null, session: null }, error: { message: 'Password should be at least 6 characters.', code: 'weak_password' } }
        const ofuscado = { id: `ofuscado-${email}`, email, identities: [] }
        if (contasExistentes.has(email) || cadastros.get(email)?.verificada) return { data: { user: ofuscado, session: null }, error: null }
        const conta = { id: `usuario-${email.split('@')[0]}`, email, nome: options?.data?.full_name ?? '', verificada: false, codigo: novoCodigo() }
        cadastros.set(email, conta)
        linksEnviados.push({ email, link: options?.emailRedirectTo ?? window.location.origin })
        return { data: { user: { id: conta.id, email, identities: [{}] }, session: null }, error: null }
      },
      async verifyOtp({ email, token, type }: { email: string; token: string; type: string }) {
        const conta = cadastros.get(email)
        if (type !== 'signup' || !conta || conta.verificada || conta.codigo !== token) {
          return { data: { user: null, session: null }, error: { message: 'Token has expired or is invalid', code: 'otp_expired' } }
        }
        conta.verificada = true
        const novaSessao = sessaoDoCadastro(conta)
        iniciar(novaSessao)
        return { data: { user: novaSessao.user, session: novaSessao }, error: null }
      },
      async resend({ email, type, options }: { email: string; type: string; options?: { emailRedirectTo?: string } }) {
        if (type !== 'signup') throw new Error(`resend do tipo ${type} não simulado`)
        const conta = cadastros.get(email)
        if (conta && !conta.verificada) {
          conta.codigo = novoCodigo()
          linksEnviados.push({ email, link: options?.emailRedirectTo ?? window.location.origin })
        }
        return { data: {}, error: null }
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
    /** A sessão que começa nesta aba, como quando o Supabase Auth confirma o acesso. */
    iniciarSessao(novaSessao: Session) {
      sessaoAtual = novaSessao
      for (const ouvinte of ouvintesDaSessao) ouvinte('SIGNED_IN', novaSessao)
    },
    /** O último código de confirmação do cadastro enviado a este e-mail; nenhum, se não houve cadastro novo. */
    codigoEnviadoPara: (email: string) => cadastros.get(email)?.codigo,
    /** O nome que o cadastro gravou nos metadados da Conta de usuário. */
    nomeCadastrado: (email: string) => cadastros.get(email)?.nome,
    /** A pessoa abre o link de confirmação neste navegador: o e-mail é verificado e a sessão começa. */
    abrirLinkDeConfirmacao(email: string) {
      const conta = cadastros.get(email)
      if (!conta) throw new Error(`nenhum cadastro para ${email}`)
      conta.verificada = true
      iniciar(sessaoDoCadastro(conta))
    },
    /** Os canais do Realtime inscritos agora, pelo nome. */
    canaisAbertos: () => [...canaisAbertos],
  }
}
