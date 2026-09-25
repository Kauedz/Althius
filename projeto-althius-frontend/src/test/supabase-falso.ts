import type { Session, SupabaseClient } from '@supabase/supabase-js'

type Linha = Record<string, unknown>

interface OpcoesDoSupabaseFalso {
  /** A sessão já guardada no navegador; sem ela, o app abre no login. */
  sessao?: Session | null
  /** As linhas de cada tabela, como o RLS as devolveria ao usuário da sessão. */
  tabelas?: Record<string, Linha[]>
  /** As RPCs que o teste responde, pelo nome. Uma resposta que lança chega ao app como erro da RPC. */
  rpcs?: Record<string, (parametros: Record<string, unknown>) => unknown>
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
export function criarSupabaseFalso({ sessao = null, tabelas = {}, rpcs = {} }: OpcoesDoSupabaseFalso = {}) {
  let sessaoAtual = sessao
  const ouvintesDaSessao = new Set<(evento: string, sessao: Session | null) => void>()
  const canaisAbertos = new Set<string>()
  const linksEnviados: { email: string; link: string }[] = []

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
    /** Os canais do Realtime inscritos agora, pelo nome. */
    canaisAbertos: () => [...canaisAbertos],
  }
}
