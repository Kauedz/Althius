import type { Session, SupabaseClient } from '@supabase/supabase-js'

type Linha = Record<string, unknown>

interface OpcoesDoSupabaseFalso {
  /** A sessão já guardada no navegador; sem ela, o app abre no login. */
  sessao?: Session | null
  /** As linhas de cada tabela, como o RLS as devolveria ao usuário da sessão. */
  tabelas?: Record<string, Linha[]>
  /** As RPCs que o teste responde, pelo nome. Uma resposta que lança chega ao app como erro da RPC. */
  rpcs?: Record<string, (parametros: Record<string, unknown>) => unknown>
  /**
   * As Contas de usuário que existem no Supabase Auth. Sem esta opção, o teste não simula quem tem conta e o código
   * de entrada vai para qualquer e-mail; com ela, o Auth só conhece estas contas e as que o cadastro criar.
   */
  contas?: ContaDoAuth[]
  /**
   * As senhas que o Supabase Auth recusa como vazadas (`GOTRUE_PASSWORD_HIBP_ENABLED`), com `weak_password` e o
   * motivo `pwned`, no cadastro e na troca de senha.
   */
  senhasVazadasNoServidor?: string[]
}

/** Uma Conta de usuário no Supabase Auth do teste. Salvo `verificada: false`, o e-mail já foi confirmado. */
export interface ContaDoAuth {
  id: string
  email: string
  senha?: string
  nome?: string
  verificada?: boolean
}

type TipoDoCodigo = 'signup' | 'email' | 'recovery'

/** A recusa do Supabase Auth a uma senha que o HaveIBeenPwned conhece. */
const senhaVazadaNoServidor = () => ({
  message: 'Password is known to be weak and easy to guess, please choose a different one.',
  status: 422,
  code: 'weak_password',
  reasons: ['pwned'],
})

/** O SHA-256 em hexadecimal, como o Supabase Auth compara o nonce cru com o nonce do ID token do Google. */
async function sha256Hex(texto: string) {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, '0')).join('')
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
export function criarSupabaseFalso({ sessao = null, tabelas = {}, rpcs = {}, contas, senhasVazadasNoServidor = [] }: OpcoesDoSupabaseFalso = {}) {
  let sessaoAtual = sessao
  const ouvintesDaSessao = new Set<(evento: string, sessao: Session | null) => void>()
  const canaisAbertos = new Set<string>()
  const linksEnviados: { email: string; link: string }[] = []
  const simulaContas = contas !== undefined
  const usuarios = contas ?? []
  const codigosEnviados: { email: string; codigo: string; tipo: TipoDoCodigo; usado: boolean }[] = []
  /** As sessões abertas de cada Conta de usuário, em qualquer navegador; a desta aba é `idDaSessaoAtual`. */
  const sessoesAbertas: { id: string; usuarioId: string }[] = []
  let sessoesCriadas = 0
  let idDaSessaoAtual: string | null = null
  const contaCom = (email: string) => usuarios.find((conta) => conta.email === email.trim().toLowerCase())
  const verificada = (conta: ContaDoAuth) => conta.verificada !== false

  function abrirSessao(usuarioId: string) {
    const id = `sessao-${++sessoesCriadas}`
    sessoesAbertas.push({ id, usuarioId })
    return id
  }

  function encerrarSessoes(manter: (sessao: { id: string; usuarioId: string }) => boolean) {
    for (let i = sessoesAbertas.length - 1; i >= 0; i--) if (!manter(sessoesAbertas[i])) sessoesAbertas.splice(i, 1)
  }

  function comecarSessao(novaSessao: Session, evento = 'SIGNED_IN') {
    sessaoAtual = novaSessao
    idDaSessaoAtual = abrirSessao(novaSessao.user.id)
    for (const ouvinte of ouvintesDaSessao) ouvinte(evento, novaSessao)
  }

  function sessaoDaConta(conta: ContaDoAuth): Session {
    const nova = sessaoDe(conta)
    return conta.nome ? { ...nova, user: { ...nova.user, user_metadata: { full_name: conta.nome } } } : nova
  }

  /** O e-mail do Supabase: o link para `link` e um código novo de 6 dígitos, que substitui o anterior. */
  function enviarEmail(email: string, tipo: TipoDoCodigo, link = window.location.origin) {
    linksEnviados.push({ email, link })
    codigosEnviados.push({ email, tipo, codigo: String(100000 + (codigosEnviados.length + 1) * 7919).slice(-6), usado: false })
  }

  /** Consome o último código de `tipo` enviado a `email`, se for `token`; devolve a conta dele. */
  function consumirCodigo(email: string, token: string, tipo: TipoDoCodigo) {
    const ultimo = codigosEnviados.findLast((enviado) => enviado.email === email)
    const conta = contaCom(email)
    if (!conta || !ultimo || ultimo.usado || ultimo.tipo !== tipo || ultimo.codigo !== token.trim()) return null
    ultimo.usado = true
    return conta
  }

  if (sessao) idDaSessaoAtual = abrirSessao(sessao.user.id)

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
        if (simulaContas && !contaCom(email)) {
          if (options?.shouldCreateUser !== false) throw new Error('signInWithOtp criaria uma Conta de usuário: simule antes de usar')
          return { data: {}, error: { message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' } }
        }
        enviarEmail(email, 'email', options?.emailRedirectTo)
        return { data: {}, error: null }
      },
      // Com "Confirm email" ligado: nunca há sessão no cadastro, e um e-mail que já tem conta verificada recebe a mesma
      // resposta (usuário ofuscado), sem código nem e-mail enviado pelo Supabase.
      async signUp({ email, password, options }: {
        email: string
        password: string
        options?: { emailRedirectTo?: string; data?: { full_name?: string } }
      }) {
        if (password.length < 6) return { data: { user: null, session: null }, error: { message: 'Password should be at least 6 characters.', code: 'weak_password' } }
        if (senhasVazadasNoServidor.includes(password)) return { data: { user: null, session: null }, error: senhaVazadaNoServidor() }
        const existente = contaCom(email)
        if (existente && verificada(existente)) return { data: { user: { id: `ofuscado-${email}`, email, identities: [] }, session: null }, error: null }
        const nome = options?.data?.full_name ?? ''
        const conta = existente ?? { id: `usuario-${email.split('@')[0]}`, email, verificada: false }
        Object.assign(conta, { senha: password, nome })
        if (!existente) usuarios.push(conta)
        enviarEmail(email, 'signup', options?.emailRedirectTo)
        return { data: { user: { id: conta.id, email, identities: [{}] }, session: null }, error: null }
      },
      async resend({ email, type, options }: { email: string; type: string; options?: { emailRedirectTo?: string } }) {
        if (type !== 'signup') throw new Error(`resend do tipo ${type} não simulado`)
        const conta = contaCom(email)
        if (conta && !verificada(conta)) enviarEmail(email, 'signup', options?.emailRedirectTo)
        return { data: {}, error: null }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const conta = contaCom(email)
        if (!conta?.senha || !verificada(conta) || conta.senha !== password) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' } }
        }
        const novaSessao = sessaoDaConta(conta)
        comecarSessao(novaSessao)
        return { data: { user: novaSessao.user, session: novaSessao }, error: null }
      },
      // O ID token do Google: o Auth confere que o hash do nonce cru é o nonce do token e vincula pelo e-mail verificado
      // à Conta de usuário existente, ou cria uma com o nome do Google. Um cadastro com senha ainda não confirmado perde
      // a senha, para quem o fez sem ser dono do e-mail não entrar na conta.
      async signInWithIdToken({ provider, token, nonce, ...resto }: { provider: string; token: string; nonce?: string }) {
        if (provider !== 'google' || Object.keys(resto).length) throw new Error('signInWithIdToken só simula o Google com nonce')
        const claims = JSON.parse(atob(token.split('.')[1])) as { email: string; email_verified: boolean; name: string; nonce?: string }
        if (!nonce || !claims.nonce || (await sha256Hex(nonce)) !== claims.nonce) {
          return { data: { user: null, session: null }, error: { message: 'Nonces mismatch', status: 400, code: 'bad_jwt' } }
        }
        let conta = contaCom(claims.email)
        if (!conta) {
          conta = { id: `usuario-${claims.email.split('@')[0]}`, email: claims.email, nome: claims.name }
          usuarios.push(conta)
        } else if (!verificada(conta)) {
          Object.assign(conta, { senha: undefined, verificada: true, nome: claims.name })
        } else {
          conta.nome ??= claims.name
        }
        const novaSessao = sessaoDaConta(conta)
        comecarSessao(novaSessao)
        return { data: { user: novaSessao.user, session: novaSessao }, error: null }
      },
      async verifyOtp({ email, token, type }: { email: string; token: string; type: string }) {
        if (type !== 'signup' && type !== 'email' && type !== 'recovery') throw new Error(`verifyOtp do tipo ${type} não é simulado`)
        const conta = consumirCodigo(email, token, type)
        if (!conta) {
          return { data: { user: null, session: null }, error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' } }
        }
        conta.verificada = true
        const novaSessao = sessaoDaConta(conta)
        comecarSessao(novaSessao, type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN')
        return { data: { user: novaSessao.user, session: novaSessao }, error: null }
      },
      // Um e-mail sem conta recebe a mesma resposta, sem e-mail enviado.
      async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
        if (contaCom(email)) enviarEmail(email, 'recovery', options?.redirectTo)
        return { data: {}, error: null }
      },
      async updateUser({ password, ...resto }: { password?: string }) {
        if (password === undefined || Object.keys(resto).length) throw new Error('updateUser só simula a troca de senha')
        const conta = sessaoAtual && contaCom(sessaoAtual.user.email ?? '')
        if (!conta) return { data: { user: null }, error: { message: 'Auth session missing!', status: 400, code: 'session_not_found' } }
        if (password.length < 6) return { data: { user: null }, error: { message: 'Password should be at least 6 characters.', status: 422, code: 'weak_password' } }
        if (senhasVazadasNoServidor.includes(password)) return { data: { user: null }, error: senhaVazadaNoServidor() }
        if (password === conta.senha) {
          return { data: { user: null }, error: { message: 'New password should be different from the old password.', status: 422, code: 'same_password' } }
        }
        conta.senha = password
        for (const ouvinte of ouvintesDaSessao) ouvinte('USER_UPDATED', sessaoAtual)
        return { data: { user: sessaoAtual!.user }, error: null }
      },
      // Como no supabase-js, sem escopo a saída é global: encerra todas as sessões da Conta de usuário.
      async signOut({ scope = 'global' }: { scope?: 'global' | 'local' | 'others' } = {}) {
        const usuarioId = sessaoAtual?.user.id
        if (scope === 'others') {
          encerrarSessoes((aberta) => aberta.usuarioId !== usuarioId || aberta.id === idDaSessaoAtual)
          return { error: null }
        }
        encerrarSessoes((aberta) => (scope === 'global' ? aberta.usuarioId !== usuarioId : aberta.id !== idDaSessaoAtual))
        sessaoAtual = null
        idDaSessaoAtual = null
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
    /** O último código de 6 dígitos enviado a este e-mail, de qualquer tipo; nenhum, se o Auth não enviou e-mail. */
    codigoEnviadoPara: (email: string) => codigosEnviados.findLast((enviado) => enviado.email === email)?.codigo,
    /** A sessão que começa nesta aba, como quando o Supabase Auth confirma o acesso. */
    iniciarSessao: (novaSessao: Session) => comecarSessao(novaSessao),
    /** O nome que o cadastro gravou nos metadados da Conta de usuário. */
    nomeCadastrado: (email: string) => contaCom(email)?.nome,
    /** A pessoa abre o link de confirmação do cadastro neste navegador: o e-mail é verificado e a sessão começa. */
    abrirLinkDeConfirmacao(email: string) {
      const conta = contaCom(email)
      if (!conta || verificada(conta)) throw new Error(`nenhum cadastro a confirmar para ${email}`)
      conta.verificada = true
      comecarSessao(sessaoDaConta(conta))
    },
    /**
     * A pessoa abre, neste navegador, o link do último e-mail de redefinição de senha: o Supabase troca o link por uma
     * sessão de recuperação. Abra o endereço do link antes de renderizar o app.
     */
    abrirLinkDeRedefinicao(email: string) {
      const ultimo = codigosEnviados.findLast((enviado) => enviado.email === email)
      if (ultimo?.tipo !== 'recovery' || ultimo.usado) throw new Error(`nenhum link de redefinição válido para ${email}`)
      const conta = consumirCodigo(email, ultimo.codigo, 'recovery')!
      comecarSessao(sessaoDaConta(conta), 'PASSWORD_RECOVERY')
    },
    /** A Conta de usuário entra por outro navegador ou aparelho; devolve o id dessa sessão. */
    abrirSessaoEmOutroAparelho(email: string) {
      const conta = contaCom(email)
      if (!conta) throw new Error(`nenhuma Conta de usuário para ${email}`)
      return abrirSessao(conta.id)
    },
    /** As sessões abertas da Conta de usuário, em qualquer navegador, pelo id. */
    sessoesAbertasDe: (email: string) => sessoesAbertas.filter((aberta) => aberta.usuarioId === contaCom(email)?.id).map((aberta) => aberta.id),
    /** As Contas de usuário do Supabase Auth com este e-mail, pelo id: mais de uma seria uma conta duplicada. */
    contasDoAuthCom: (email: string) => usuarios.filter((conta) => conta.email === email.trim().toLowerCase()).map((conta) => conta.id),
    /** Os canais do Realtime inscritos agora, pelo nome. */
    canaisAbertos: () => [...canaisAbertos],
  }
}
