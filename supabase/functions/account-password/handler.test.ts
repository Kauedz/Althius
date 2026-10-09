import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db } from './handler.ts'

const URL_DO_PROJETO = 'https://projeto.supabase.co'
const APIKEY = 'sb_publishable_teste'
const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const BRUNO = { id: 'usuario-bruno', email: 'bruno@cliente.com.br' }
const SENHA_ATUAL = 'senha-antiga-da-marina'
const NOVA = 'uma frase longa e nova'
const CODIGO = '482913'
const CAPTCHA = 'token-do-turnstile-1'

/** SHA-1 de "password": 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8. */
const SUFIXO_DE_PASSWORD = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

interface ContaDoAuth {
  id: string
  email: string
  senha?: string
}

interface Chamada {
  metodo: string
  caminho: string
  headers: Headers
  corpo: Record<string, unknown> | null
}

/**
 * O Supabase Auth e o Pwned Passwords do teste, atrás de um único `fetch`. As sessões ficam em memória; a do JWT de
 * quem chama já está aberta (`token-inicial`), e cada Conta de usuário pode ter outra num segundo aparelho. Como o
 * GoTrue: o CAPTCHA vale em /token (cada token uma vez), não em /verify; a troca em PUT /user recusa a mesma senha e
 * encerra as outras sessões da Conta.
 */
function supabaseAuthFalso({
  contas = [{ ...MARINA, senha: SENHA_ATUAL }, { ...BRUNO, senha: 'senha-do-bruno-123' }] as ContaDoAuth[],
  exigeCaptcha = true,
  codigos = { [MARINA.email]: CODIGO } as Record<string, string>,
  confirmacaoAbreSessaoDe,
  limiteNoAuth = false,
  falhaAoEncerrarOutras = false,
  senhasVazadas = [] as string[],
  pwnedPasswords = 'responde' as 'responde' | 'fora',
}: {
  contas?: ContaDoAuth[]
  exigeCaptcha?: boolean
  codigos?: Record<string, string>
  /** A confirmação abre a sessão de outra Conta de usuário (o Auth devolvendo quem não devia). */
  confirmacaoAbreSessaoDe?: ContaDoAuth
  /** O Auth responde 429 (limite de taxa) à confirmação. */
  limiteNoAuth?: boolean
  falhaAoEncerrarOutras?: boolean
  senhasVazadas?: string[]
  pwnedPasswords?: 'responde' | 'fora'
} = {}) {
  const chamadas: Chamada[] = []
  const sessoes = new Map<string, { id: string; usuario: string }>([
    ['token-inicial', { id: 'sessao-inicial', usuario: MARINA.id }],
    ['token-outro-aparelho', { id: 'sessao-outro-aparelho', usuario: MARINA.id }],
    ['token-do-bruno', { id: 'sessao-do-bruno', usuario: BRUNO.id }],
  ])
  const captchasUsados = new Set<string>()
  let sessoesCriadas = 0

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const erro = (status: number, error_code: string, extra: Record<string, unknown> = {}) =>
    json({ code: status, error_code, msg: 'recusado', ...extra }, status)
  const contaPorId = (id: string) => contas.find((conta) => conta.id === id)!

  function abrirSessao(conta: ContaDoAuth) {
    const numero = ++sessoesCriadas
    const token = `token-confirmacao-${numero}`
    sessoes.set(token, { id: `sessao-confirmacao-${numero}`, usuario: conta.id })
    return json({
      access_token: token,
      refresh_token: `refresh-confirmacao-${numero}`,
      expires_in: 3600,
      expires_at: 1_900_000_000,
      token_type: 'bearer',
      user: { id: conta.id, email: conta.email },
    })
  }

  function sessaoDo(headers: Headers) {
    const token = (headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    return sessoes.get(token) ? { token, ...sessoes.get(token)! } : null
  }

  function conferirCaptcha(corpo: Record<string, unknown> | null) {
    const token = (corpo?.gotrue_meta_security as { captcha_token?: string } | undefined)?.captcha_token
    if (!exigeCaptcha) return null
    if (!token || !token.startsWith('token-do-turnstile') || captchasUsados.has(token)) {
      return erro(400, 'captcha_failed')
    }
    captchasUsados.add(token)
    return null
  }

  const fetch: typeof globalThis.fetch = async (entrada, init) => {
    const url = new URL(String(entrada))
    const metodo = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const corpo = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null

    if (url.host === 'api.pwnedpasswords.com') {
      chamadas.push({ metodo, caminho: url.href, headers, corpo })
      if (pwnedPasswords === 'fora') return new Response('', { status: 503 })
      const linhas = await Promise.all(senhasVazadas.map(async (senha) => {
        const resumo = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(senha))
        const hash = Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
        return url.pathname.endsWith(hash.slice(0, 5)) ? `${hash.slice(5)}:12` : null
      }))
      return new Response([...linhas.filter(Boolean), `${SUFIXO_DE_PASSWORD}:0`].join('\r\n'))
    }

    assertEquals(url.origin + url.pathname.replace(/\/[^/]+$/, ''), `${URL_DO_PROJETO}/auth/v1`)
    assertEquals(headers.get('apikey'), APIKEY)
    const caminho = url.pathname.replace('/auth/v1', '') + url.search
    chamadas.push({ metodo, caminho, headers, corpo })

    if (caminho === '/user' && metodo === 'GET') {
      const sessao = sessaoDo(headers)
      if (!sessao) return erro(403, 'session_not_found')
      const conta = contaPorId(sessao.usuario)
      return json({ id: conta.id, email: conta.email })
    }

    if (caminho === '/token?grant_type=password') {
      const recusaDoCaptcha = conferirCaptcha(corpo)
      if (recusaDoCaptcha) return recusaDoCaptcha
      if (limiteNoAuth) return erro(429, 'over_request_rate_limit')
      const conta = contas.find((c) => c.email === corpo?.email)
      if (!conta?.senha || conta.senha !== corpo?.password) return erro(400, 'invalid_credentials')
      return abrirSessao(confirmacaoAbreSessaoDe ?? conta)
    }

    if (caminho === '/verify') {
      if (limiteNoAuth) return erro(429, 'over_request_rate_limit')
      const email = String(corpo?.email)
      const conta = contas.find((c) => c.email === email)
      if (corpo?.type !== 'email' || !conta || codigos[email] !== corpo?.token) return erro(403, 'otp_expired')
      delete codigos[email]
      return abrirSessao(confirmacaoAbreSessaoDe ?? conta)
    }

    if (caminho === '/user' && metodo === 'PUT') {
      const sessao = sessaoDo(headers)
      if (!sessao) return erro(403, 'session_not_found')
      const conta = contaPorId(sessao.usuario)
      const senha = String(corpo?.password)
      if (conta.senha && conta.senha === senha) return erro(422, 'same_password')
      if (senha.length < 6) return erro(422, 'weak_password', { weak_password: { reasons: ['length'] } })
      conta.senha = senha
      // Como o GoTrue: as outras sessões da Conta de usuário caem na mesma transação da troca.
      for (const [token, aberta] of sessoes) {
        if (aberta.usuario === conta.id && token !== sessao.token) sessoes.delete(token)
      }
      return json({ id: conta.id, email: conta.email })
    }

    if (caminho === '/logout?scope=local' || caminho === '/logout?scope=others') {
      const sessao = sessaoDo(headers)
      if (!sessao) return erro(403, 'session_not_found')
      if (caminho === '/logout?scope=local') {
        sessoes.delete(sessao.token)
        return new Response(null, { status: 204 })
      }
      if (falhaAoEncerrarOutras) return erro(500, 'unexpected_failure')
      for (const [token, aberta] of sessoes) {
        if (aberta.usuario === sessao.usuario && token !== sessao.token) sessoes.delete(token)
      }
      return new Response(null, { status: 204 })
    }

    throw new Error(`${metodo} ${caminho} não simulado`)
  }

  return {
    fetch,
    chamadas,
    senhaDe: (id: string) => contaPorId(id).senha,
    sessoesAbertasDe: (id: string) => [...sessoes.values()].filter((s) => s.usuario === id).map((s) => s.id),
    chamou: (caminho: string, metodo?: string) =>
      chamadas.some((c) => c.caminho === caminho && (metodo === undefined || c.metodo === metodo)),
  }
}

/** O limite de tentativas do banco: `reservadas` diz quantas já foram gastas; `limite` é o teto. */
function bancoFalso({ limite = 5, falha }: { limite?: number; falha?: Error } = {}) {
  const estado = { reservadas: 0, limpezas: 0 }
  const db: Db = {
    claimAttempt() {
      if (falha) return Promise.reject(falha)
      if (estado.reservadas >= limite) return Promise.resolve(false)
      estado.reservadas++
      return Promise.resolve(true)
    },
    clearAttempts() {
      estado.reservadas = 0
      estado.limpezas++
      return Promise.resolve()
    },
  }
  return { db, estado }
}

function pedido(body: unknown, { token = 'token-inicial', apikey = APIKEY }: { token?: string | null; apikey?: string } = {}) {
  const headers: Record<string, string> = { Origin: 'https://app.althius.com.br', 'Content-Type': 'application/json', apikey }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request('https://projeto.supabase.co/functions/v1/account-password', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

/** A confirmação pela senha atual; `null` manda sem o token do Turnstile. */
const comSenha = (senhaAtual = SENHA_ATUAL, captchaToken: string | null = CAPTCHA) => ({
  confirmacao: { tipo: 'senha', senhaAtual, ...(captchaToken ? { captchaToken } : {}) },
  novaSenha: NOVA,
})
const comCodigo = (codigo = CODIGO) => ({ confirmacao: { tipo: 'codigo', codigo }, novaSenha: NOVA })

/** A função com o Auth e o banco do teste; os logs ficam em `logs`. */
function montar(auth = supabaseAuthFalso(), banco = bancoFalso()) {
  const logs: Record<string, unknown>[] = []
  const handler = createHandler({
    db: banco.db,
    supabaseUrl: URL_DO_PROJETO,
    appOrigin: 'https://app.althius.com.br',
    fetch: auth.fetch,
    log: (campos) => logs.push(campos),
    tempoLimiteDaConsultaDeVazadasMs: 50,
  })
  return { handler, auth, banco, logs }
}

Deno.test('sem o JWT da sessão, nada é conferido nem trocado', async () => {
  const { handler, auth } = montar()

  const resposta = await handler(pedido(comSenha(), { token: null }))
  assertEquals(resposta.status, 401)
  assertEquals(await resposta.json(), { erro: 'sem_sessao' })
  assertEquals(auth.chamadas, [])

  // Um JWT de sessão que o Auth já encerrou também não passa.
  const encerrada = await handler(pedido(comSenha(), { token: 'token-que-nao-existe' }))
  assertEquals(encerrada.status, 401)
  assertEquals(auth.chamou('/token?grant_type=password'), false)
})

Deno.test('com a senha atual certa, a senha é trocada, as outras sessões caem e a sessão da confirmação volta ao navegador', async () => {
  const { handler, auth, banco } = montar()

  const resposta = await handler(pedido(comSenha()))
  assertEquals(resposta.status, 200)
  const corpo = await resposta.json()
  assertEquals(corpo.ok, true)
  assertEquals(corpo.outrasSessoesEncerradas, true)
  assertEquals(corpo.sessao.access_token, 'token-confirmacao-1')
  assertEquals(corpo.sessao.refresh_token, 'refresh-confirmacao-1')
  assertEquals(auth.senhaDe(MARINA.id), NOVA)
  // Só a sessão aberta pela confirmação continua: a que chamou e a do outro aparelho caíram.
  assertEquals(auth.sessoesAbertasDe(MARINA.id), ['sessao-confirmacao-1'])
  assertEquals(auth.sessoesAbertasDe(BRUNO.id), ['sessao-do-bruno'])

  // A confirmação usou o e-mail da sessão e o CAPTCHA do navegador; a troca levou a senha atual.
  const confirmacao = auth.chamadas.find((c) => c.caminho === '/token?grant_type=password')!
  assertEquals(confirmacao.corpo, { email: MARINA.email, password: SENHA_ATUAL, gotrue_meta_security: { captcha_token: CAPTCHA } })
  assertEquals(confirmacao.headers.get('Authorization'), null)
  const troca = auth.chamadas.find((c) => c.caminho === '/user' && c.metodo === 'PUT')!
  assertEquals(troca.headers.get('Authorization'), 'Bearer token-confirmacao-1')
  assertEquals(troca.corpo, { password: NOVA, current_password: SENHA_ATUAL })
  assertEquals(banco.estado, { reservadas: 0, limpezas: 1 })
})

Deno.test('com a senha atual errada, nada muda e a resposta não diz mais que "confirmação inválida"', async () => {
  const { handler, auth, banco } = montar()

  const resposta = await handler(pedido(comSenha('nao-e-a-senha')))
  assertEquals(resposta.status, 400)
  assertEquals(await resposta.json(), { erro: 'confirmacao_invalida' })
  assertEquals(auth.senhaDe(MARINA.id), SENHA_ATUAL)
  assertEquals(auth.chamou('/user', 'PUT'), false)
  assertEquals(auth.sessoesAbertasDe(MARINA.id), ['sessao-inicial', 'sessao-outro-aparelho'])
  // A tentativa errada fica contada.
  assertEquals(banco.estado, { reservadas: 1, limpezas: 0 })
})

Deno.test('a Conta de usuário vem do JWT: e-mail e id no corpo são ignorados', async () => {
  const { handler, auth } = montar()

  // Com o JWT do Bruno, mesmo dizendo ser a Marina e mandando a senha dela, a confirmação é a do Bruno e falha.
  const resposta = await handler(pedido({ ...comSenha(), email: MARINA.email, userId: MARINA.id }, { token: 'token-do-bruno' }))
  assertEquals(await resposta.json(), { erro: 'confirmacao_invalida' })
  assertEquals(auth.chamadas.find((c) => c.caminho === '/token?grant_type=password')?.corpo?.email, BRUNO.email)
  assertEquals(auth.senhaDe(MARINA.id), SENHA_ATUAL)
})

Deno.test('se a confirmação abre a sessão de outra Conta de usuário, nada é trocado e essa sessão é descartada', async () => {
  const outra = { ...BRUNO, senha: 'senha-do-bruno-123' }
  const auth = supabaseAuthFalso({ confirmacaoAbreSessaoDe: outra, contas: [{ ...MARINA, senha: SENHA_ATUAL }, outra] })
  const { handler } = montar(auth)

  const resposta = await handler(pedido(comSenha()))
  assertEquals(await resposta.json(), { erro: 'confirmacao_invalida' })
  assertEquals(auth.chamou('/user', 'PUT'), false)
  assertEquals(auth.chamou('/logout?scope=local'), true)
  assertEquals(auth.sessoesAbertasDe(BRUNO.id), ['sessao-do-bruno'])
  assertEquals(auth.senhaDe(MARINA.id), SENHA_ATUAL)
  assertEquals(auth.senhaDe(BRUNO.id), 'senha-do-bruno-123')
})

Deno.test('com o código certo a senha é trocada; com o errado, o erro é o mesmo da senha errada', async () => {
  const errado = montar()
  const recusa = await errado.handler(pedido(comCodigo('000000')))
  assertEquals(recusa.status, 400)
  assertEquals(await recusa.json(), { erro: 'confirmacao_invalida' })
  assertEquals(errado.auth.senhaDe(MARINA.id), SENHA_ATUAL)
  assertEquals(errado.auth.chamou('/user', 'PUT'), false)

  const certo = montar()
  const resposta = await certo.handler(pedido(comCodigo()))
  assertEquals(resposta.status, 200)
  assertEquals((await resposta.json()).outrasSessoesEncerradas, true)
  assertEquals(certo.auth.senhaDe(MARINA.id), NOVA)
  const verificacao = certo.auth.chamadas.find((c) => c.caminho === '/verify')!
  assertEquals(verificacao.corpo, { type: 'email', email: MARINA.email, token: CODIGO })
  // Sem senha atual, a troca não manda `current_password`: o Auth trata a sessão do código como recuperação.
  assertEquals(certo.auth.chamadas.find((c) => c.caminho === '/user' && c.metodo === 'PUT')?.corpo, { password: NOVA })
})

Deno.test('quem entrou só com Google define a primeira senha pelo código, na mesma Conta de usuário', async () => {
  const auth = supabaseAuthFalso({ contas: [{ ...MARINA }, { ...BRUNO }] })
  const { handler } = montar(auth)

  // Sem senha, a senha atual nunca confere.
  assertEquals(await (await handler(pedido(comSenha('qualquer-coisa', 'token-do-turnstile-a')))).json(), { erro: 'confirmacao_invalida' })

  const resposta = await handler(pedido(comCodigo()))
  assertEquals(resposta.status, 200)
  assertEquals(auth.senhaDe(MARINA.id), NOVA)
  const troca = auth.chamadas.find((c) => c.caminho === '/user' && c.metodo === 'PUT')!
  assertEquals(troca.corpo, { password: NOVA })
})

Deno.test('sem CAPTCHA, ou com um CAPTCHA recusado, nada é confirmado nem trocado', async () => {
  for (const captcha of [null, 'token-falsificado']) {
    const { handler, auth } = montar()
    const resposta = await handler(pedido(comSenha(SENHA_ATUAL, captcha)))
    assertEquals(resposta.status, 400)
    assertEquals(await resposta.json(), { erro: 'captcha_invalido' })
    assertEquals(auth.chamou('/user', 'PUT'), false)
    assertEquals(auth.senhaDe(MARINA.id), SENHA_ATUAL)
  }

  // Cada token vale uma vez: o mesmo token numa segunda tentativa é recusado.
  const { handler, auth } = montar()
  assertEquals((await handler(pedido({ ...comSenha(), novaSenha: SENHA_ATUAL }))).status, 422)
  assertEquals(await (await handler(pedido(comSenha()))).json(), { erro: 'captcha_invalido' })
  assertEquals(auth.senhaDe(MARINA.id), SENHA_ATUAL)
})

Deno.test('a nova senha segue a política antes da confirmação: curta, longa ou vazada não gasta o código', async () => {
  const auth = supabaseAuthFalso({ senhasVazadas: ['senha-vazada-conhecida'] })
  const banco = bancoFalso()
  const { handler } = montar(auth, banco)

  for (const [novaSenha, motivo] of [['curta', 'curta'], ['a'.repeat(73), 'longa'], ['senha-vazada-conhecida', 'vazada']]) {
    const resposta = await handler(pedido({ ...comCodigo(), novaSenha }))
    assertEquals(resposta.status, 422)
    assertEquals(await resposta.json(), { erro: 'senha_fraca', motivo })
  }
  assertEquals(auth.chamou('/verify'), false)
  assertEquals(banco.estado.reservadas, 0)

  // O código continua valendo para uma senha que serve.
  assertEquals((await handler(pedido(comCodigo()))).status, 200)
})

Deno.test('com o Pwned Passwords fora do ar, a troca segue', async () => {
  const { handler, auth, logs } = montar(supabaseAuthFalso({ pwnedPasswords: 'fora' }))

  assertEquals((await handler(pedido(comSenha()))).status, 200)
  assertEquals(auth.senhaDe(MARINA.id), NOVA)
  assert(logs.some((linha) => linha.outcome === 'consulta_de_vazadas_indisponivel'))
})

Deno.test('a nova senha igual à atual é recusada e a sessão da confirmação é descartada', async () => {
  const { handler, auth } = montar()

  const resposta = await handler(pedido({ ...comSenha(), novaSenha: SENHA_ATUAL }))
  assertEquals(resposta.status, 422)
  assertEquals(await resposta.json(), { erro: 'mesma_senha' })
  assertEquals(auth.senhaDe(MARINA.id), SENHA_ATUAL)
  assertEquals(auth.sessoesAbertasDe(MARINA.id), ['sessao-inicial', 'sessao-outro-aparelho'])
})

Deno.test('o limite do Supabase Auth e o limite de tentativas da Conta de usuário respondem "limite"', async () => {
  const doAuth = montar(supabaseAuthFalso({ limiteNoAuth: true }))
  const resposta = await doAuth.handler(pedido(comSenha()))
  assertEquals(resposta.status, 429)
  assertEquals(await resposta.json(), { erro: 'limite' })
  assertEquals(doAuth.auth.senhaDe(MARINA.id), SENHA_ATUAL)

  // Cinco tentativas erradas; a sexta nem chega ao Supabase Auth, mesmo com o código certo.
  const proprio = montar()
  for (let i = 0; i < 5; i++) {
    assertEquals(await (await proprio.handler(pedido(comCodigo(`00000${i}`)))).json(), { erro: 'confirmacao_invalida' })
  }
  const verificacoes = proprio.auth.chamadas.filter((c) => c.caminho === '/verify').length
  const sexta = await proprio.handler(pedido(comCodigo()))
  assertEquals(sexta.status, 429)
  assertEquals(await sexta.json(), { erro: 'limite' })
  assertEquals(proprio.auth.chamadas.filter((c) => c.caminho === '/verify').length, verificacoes)
  assertEquals(proprio.auth.senhaDe(MARINA.id), SENHA_ATUAL)
})

Deno.test('sem o banco das tentativas, nada é confirmado', async () => {
  const { handler, auth } = montar(supabaseAuthFalso(), bancoFalso({ falha: new Error('banco fora') }))

  const resposta = await handler(pedido(comSenha()))
  assertEquals(resposta.status, 502)
  assertEquals(await resposta.json(), { erro: 'falha' })
  assertEquals(auth.chamou('/token?grant_type=password'), false)
})

Deno.test('se encerrar as outras sessões falha, a resposta diz isso com a senha já trocada', async () => {
  const { handler, auth } = montar(supabaseAuthFalso({ falhaAoEncerrarOutras: true }))

  const resposta = await handler(pedido(comSenha()))
  assertEquals(resposta.status, 200)
  const corpo = await resposta.json()
  assertEquals(corpo.ok, true)
  assertEquals(corpo.outrasSessoesEncerradas, false)
  assertEquals(corpo.sessao.access_token, 'token-confirmacao-1')
  assertEquals(auth.senhaDe(MARINA.id), NOVA)
})

Deno.test('um pedido fora do formato não chega à confirmação', async () => {
  const { handler, auth } = montar()

  for (const corpo of [
    {},
    { confirmacao: { tipo: 'senha', senhaAtual: '' }, novaSenha: NOVA },
    { confirmacao: { tipo: 'codigo', codigo: 'abc123' }, novaSenha: NOVA },
    { confirmacao: { tipo: 'outro' }, novaSenha: NOVA },
    { confirmacao: { tipo: 'senha', senhaAtual: SENHA_ATUAL } },
  ]) {
    const resposta = await handler(pedido(corpo))
    assertEquals(resposta.status, 400)
    assertEquals(await resposta.json(), { erro: 'pedido_invalido' })
  }
  assertEquals(auth.chamou('/token?grant_type=password') || auth.chamou('/verify'), false)
})

Deno.test('nenhum log leva senha, código, token, CAPTCHA ou e-mail', async () => {
  const logs: Record<string, unknown>[] = []
  const cenarios: [ReturnType<typeof supabaseAuthFalso>, unknown][] = [
    [supabaseAuthFalso(), comSenha()],
    [supabaseAuthFalso(), comSenha('senha-errada-qualquer')],
    [supabaseAuthFalso(), comCodigo()],
    [supabaseAuthFalso(), comCodigo('111111')],
    [supabaseAuthFalso(), comSenha(SENHA_ATUAL, null)],
    [supabaseAuthFalso(), { ...comSenha(), novaSenha: SENHA_ATUAL }],
    [supabaseAuthFalso({ limiteNoAuth: true }), comSenha()],
    [supabaseAuthFalso({ falhaAoEncerrarOutras: true }), comSenha()],
    [supabaseAuthFalso({ pwnedPasswords: 'fora' }), comCodigo()],
  ]
  for (const [auth, corpo] of cenarios) {
    const handler = createHandler({
      db: bancoFalso().db,
      supabaseUrl: URL_DO_PROJETO,
      appOrigin: 'https://app.althius.com.br',
      fetch: auth.fetch,
      log: (campos) => logs.push(campos),
      tempoLimiteDaConsultaDeVazadasMs: 50,
    })
    await (await handler(pedido(corpo))).text()
  }

  assert(logs.length >= cenarios.length)
  const texto = JSON.stringify(logs)
  for (const segredo of [SENHA_ATUAL, NOVA, 'senha-errada-qualquer', CODIGO, '111111', CAPTCHA, 'token-', 'refresh-', MARINA.email]) {
    assertEquals(texto.includes(segredo), false, `o log contém ${segredo}`)
  }
})
