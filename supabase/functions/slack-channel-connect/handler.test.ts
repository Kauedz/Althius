import { assert, assertEquals } from 'jsr:@std/assert@1'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const URL_DE_RETORNO = 'https://proj.supabase.co/functions/v1/slack-channel-callback'
const CANAL: Record<string, string> = { SLACK_CHANNEL_CLIENT_ID: 'cid-canal', SLACK_CHANNEL_CLIENT_SECRET: 'segredo-canal-xyz' }
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

interface Montagem {
  ambiente?: Record<string, string>
  semSessao?: boolean
  /** O erro que o banco devolve em qualquer chamada. */
  erroDoBanco?: ErroDoBanco
  /** O que o auth.revoke do Slack responde. */
  revogacao?: () => Response
}

function montar(m: Montagem = {}) {
  const c = {
    tentativas: [] as Parameters<Db['iniciarTentativa']>[0][],
    retiradas: [] as Parameters<Db['retirar']>[0][],
    rede: [] as { url: string; autorizacao: string | null }[],
    logs: [] as Record<string, unknown>[],
  }
  const falhar = <T>(valor: T) => (m.erroDoBanco ? Promise.reject(m.erroDoBanco) : Promise.resolve(valor))
  const db: Db = {
    userFromJwt: () => Promise.resolve(m.semSessao ? null : { userId: 'u-ana' }),
    iniciarTentativa: (a) => (m.erroDoBanco ? Promise.reject(m.erroDoBanco) : (c.tentativas.push(a), Promise.resolve('estado-canal-123'))),
    tokenParaRetirar: () => falhar('xoxb-token-do-bot'),
    retirar: (a) => (m.erroDoBanco ? Promise.reject(m.erroDoBanco) : (c.retiradas.push(a), Promise.resolve())),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    c.rede.push({ url: req.url, autorizacao: req.headers.get('Authorization') })
    if (req.url === 'https://slack.com/api/auth.revoke') return m.revogacao?.() ?? json({ ok: true, revoked: true })
    return json({}, 404)
  }) as typeof fetch
  const ambiente = m.ambiente ?? CANAL
  const handler = createHandler({
    db,
    ambiente: (nome) => ambiente[nome],
    appOrigin: 'https://app.althius.test',
    urlDeRetorno: URL_DE_RETORNO,
    fetch: fetchFalso,
    log: (campos) => c.logs.push(campos),
  })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/slack-channel-connect', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { c, pedir, handler }
}

Deno.test('sem sessão, sem Workspace ou com ação desconhecida, nada é feito', async () => {
  assertEquals((await montar({ semSessao: true }).pedir({ action: 'iniciar', workspaceId: WS })).status, 401)
  const { pedir, c } = montar()
  assertEquals((await pedir({ action: 'iniciar', workspaceId: 'x' })).status, 400)
  assertEquals((await pedir({ action: 'apagar', workspaceId: WS })).status, 400)
  assertEquals(c.tentativas, [])
  assertEquals(c.rede, [])
})

Deno.test('iniciar: abre a tentativa e devolve o endereço de instalação do app do Canal', async () => {
  const { pedir, c } = montar()
  const resposta = await pedir({ action: 'iniciar', workspaceId: WS })
  assertEquals(resposta.status, 200)
  const texto = await resposta.text()
  assert(!texto.includes('segredo-canal-xyz'))
  const url = new URL(JSON.parse(texto).url)
  assertEquals(url.origin + url.pathname, 'https://slack.com/oauth/v2/authorize')
  assertEquals(url.searchParams.get('client_id'), 'cid-canal')
  assertEquals(url.searchParams.get('state'), 'estado-canal-123')
  assertEquals(url.searchParams.get('redirect_uri'), URL_DE_RETORNO)
  assertEquals(c.tentativas, [{ workspaceId: WS, userId: 'u-ana', returnTo: 'https://app.althius.test' }])
})

Deno.test('iniciar sem o app do Canal configurado: "Precisa configurar", sem tentativa', async () => {
  for (const ambiente of [{}, { SLACK_CHANNEL_CLIENT_ID: 'cid' }] as Record<string, string>[]) {
    const { pedir, c } = montar({ ambiente })
    const resposta = await pedir({ action: 'iniciar', workspaceId: WS })
    const corpo = await resposta.json()
    assertEquals([resposta.status, corpo.code], [503, 'nao_configurada'])
    assert(corpo.error.startsWith('Precisa configurar'))
    assertEquals(c.tentativas, [])
  }
})

Deno.test('iniciar e retirar como Membro: 403 com a mensagem do Administrador, sem tocar no Slack', async () => {
  const erro = new ErroDoBanco('42501', 'only administrators can manage the slack channel')
  const iniciar = await montar({ erroDoBanco: erro }).pedir({ action: 'iniciar', workspaceId: WS })
  const corpo = await iniciar.json()
  assertEquals([iniciar.status, corpo.code], [403, 'nao_administrador'])
  assertEquals(corpo.error, 'Só um Administrador do Workspace conecta ou retira o Slack.')

  const retirando = montar({ erroDoBanco: erro })
  const retirar = await retirando.pedir({ action: 'retirar', workspaceId: WS })
  assertEquals(retirar.status, 403)
  assertEquals(retirando.c.rede, [])
})

Deno.test('retirar: revoga o token no Slack e só então marca a instalação como retirada', async () => {
  const { pedir, c } = montar()
  const resposta = await pedir({ action: 'retirar', workspaceId: WS })
  assertEquals(resposta.status, 200)
  const texto = await resposta.text()
  assertEquals(JSON.parse(texto), { ok: true })
  assert(!texto.includes('xoxb-token-do-bot'))
  assertEquals(c.rede, [{ url: 'https://slack.com/api/auth.revoke', autorizacao: 'Bearer xoxb-token-do-bot' }])
  assertEquals(c.retiradas, [{ workspaceId: WS, userId: 'u-ana' }])
  assert(!JSON.stringify(c.logs).includes('xoxb-token-do-bot'))
})

Deno.test('retirar com o app já desinstalado no Slack: o token não vale mais e a instalação é retirada', async () => {
  const { pedir, c } = montar({ revogacao: () => json({ ok: false, error: 'token_revoked' }) })
  assertEquals((await pedir({ action: 'retirar', workspaceId: WS })).status, 200)
  assertEquals(c.retiradas.length, 1)
})

Deno.test('retirar com o Slack fora do ar: não marca como retirada, para não deixar um token vivo', async () => {
  const { pedir, c } = montar({ revogacao: () => json({}, 503) })
  const resposta = await pedir({ action: 'retirar', workspaceId: WS })
  assertEquals([resposta.status, (await resposta.json()).code], [502, 'indisponivel'])
  assertEquals(c.retiradas, [])
})

Deno.test('retirar um Canal que não está ativo: 409, sem chamar o Slack', async () => {
  const { pedir, c } = montar({ erroDoBanco: new ErroDoBanco('P0002', 'slack channel not installed') })
  const resposta = await pedir({ action: 'retirar', workspaceId: WS })
  assertEquals([resposta.status, (await resposta.json()).code], [409, 'nao_instalado'])
  assertEquals(c.rede, [])
})

Deno.test('o preflight do app é respondido com a origem permitida', async () => {
  const { handler } = montar()
  const r = await handler(new Request('https://x/slack-channel-connect', { method: 'OPTIONS', headers: { Origin: 'https://app.althius.test' } }))
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.test')
})
