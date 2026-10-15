import { assert, assertEquals } from 'jsr:@std/assert@1'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { createHandler, type Db, type TentativaDeInstalacao } from './handler.ts'

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const URL_DE_RETORNO = 'https://proj.supabase.co/functions/v1/slack-channel-callback'
const CANAL: Record<string, string> = { SLACK_CHANNEL_CLIENT_ID: 'cid-canal', SLACK_CHANNEL_CLIENT_SECRET: 'segredo-canal-xyz' }
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const INSTALADO = {
  ok: true,
  access_token: 'xoxb-token-do-bot',
  token_type: 'bot',
  scope: 'app_mentions:read,chat:write',
  bot_user_id: 'U0BOT',
  app_id: 'A0ALTHIUS',
  team: { id: 'T0NORTE', name: 'Norte' },
}

interface Montagem {
  tentativa?: TentativaDeInstalacao | null
  erroAoConcluir?: ErroDoBanco
  troca?: () => Response
  ambiente?: Record<string, string>
}

function montar(m: Montagem = {}) {
  const c = {
    conclusoes: [] as Parameters<Db['concluir']>[0][],
    trocas: [] as URLSearchParams[],
    logs: [] as Record<string, unknown>[],
  }
  const db: Db = {
    tentativa: () =>
      Promise.resolve(m.tentativa === undefined ? { status: 'ok', workspaceId: WS, returnTo: 'https://app.althius.test' } : m.tentativa),
    concluir: (a) => (m.erroAoConcluir ? Promise.reject(m.erroAoConcluir) : (c.conclusoes.push(a), Promise.resolve())),
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    if (req.url === 'https://slack.com/api/oauth.v2.access') {
      c.trocas.push(new URLSearchParams(await req.text()))
      return m.troca?.() ?? json(INSTALADO)
    }
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
  const voltar = async (consulta: string) => {
    const resposta = await handler(new Request(`${URL_DE_RETORNO}?${consulta}`))
    assertEquals(resposta.status, 302)
    return new URL(resposta.headers.get('Location')!)
  }
  return { c, voltar, handler }
}

Deno.test('o retorno troca o código, fixa o Slack e volta a Conexões com o Canal conectado', async () => {
  const { voltar, c } = montar()
  const destino = await voltar('code=codigo-1&state=estado-1')
  assertEquals(destino.origin + destino.pathname, 'https://app.althius.test/conexoes')
  assertEquals(Object.fromEntries(destino.searchParams), { conexao: 'ok', canal: 'slack' })
  assertEquals(c.trocas[0].get('code'), 'codigo-1')
  assertEquals(c.trocas[0].get('redirect_uri'), URL_DE_RETORNO)
  assertEquals(c.conclusoes, [{
    state: 'estado-1',
    teamId: 'T0NORTE',
    teamName: 'Norte',
    botUserId: 'U0BOT',
    appId: 'A0ALTHIUS',
    token: 'xoxb-token-do-bot',
    escopos: 'app_mentions:read,chat:write',
  }])
  assert(!destino.toString().includes('xoxb'))
  assert(!JSON.stringify(c.logs).includes('xoxb-token-do-bot'))
})

Deno.test('um state desconhecido volta como inválido, sem trocar o código', async () => {
  const { voltar, c } = montar({ tentativa: null })
  const destino = await voltar('code=codigo-1&state=forjado')
  assertEquals(Object.fromEntries(destino.searchParams), { conexao: 'erro', canal: 'slack', motivo: 'invalida' })
  assertEquals(c.trocas, [])
  const semState = await montar().voltar('code=codigo-1')
  assertEquals(semState.searchParams.get('motivo'), 'invalida')
})

Deno.test('tentativa usada, vencida ou de quem deixou de ser Administrador: volta com o motivo, sem trocar', async () => {
  for (const status of ['usada', 'expirada', 'nao_administrador'] as const) {
    const { voltar, c } = montar({ tentativa: { status, workspaceId: WS, returnTo: 'https://app.althius.test' } })
    assertEquals((await voltar('code=k&state=s')).searchParams.get('motivo'), status)
    assertEquals(c.trocas, [])
  }
})

Deno.test('a instalação cancelada no Slack volta como recusada', async () => {
  const { voltar, c } = montar()
  assertEquals((await voltar('error=access_denied&state=s')).searchParams.get('motivo'), 'recusada')
  assertEquals(c.trocas, [])
})

Deno.test('outro Slack no Workspace e Slack de outro Workspace: recusas com motivo próprio', async () => {
  const outro = montar({ erroAoConcluir: new ErroDoBanco('P0001', 'slack team mismatch') })
  assertEquals((await outro.voltar('code=k&state=s')).searchParams.get('motivo'), 'slack_diferente')
  const deOutro = montar({ erroAoConcluir: new ErroDoBanco('P0001', 'slack team in another workspace') })
  assertEquals((await deOutro.voltar('code=k&state=s')).searchParams.get('motivo'), 'slack_de_outro_workspace')
  const repetido = montar({ erroAoConcluir: new ErroDoBanco('55000', 'install attempt already used') })
  assertEquals((await repetido.voltar('code=k&state=s')).searchParams.get('motivo'), 'usada')
  const rebaixada = montar({ erroAoConcluir: new ErroDoBanco('42501', 'only administrators can manage the slack channel') })
  assertEquals((await rebaixada.voltar('code=k&state=s')).searchParams.get('motivo'), 'nao_administrador')
})

Deno.test('o Slack recusa a troca ou está fora do ar: volta sem conectar', async () => {
  const recusada = montar({ troca: () => json({ ok: false, error: 'invalid_code' }) })
  assertEquals((await recusada.voltar('code=k&state=s')).searchParams.get('motivo'), 'falha_na_troca')
  assertEquals(recusada.c.conclusoes, [])
  const fora = montar({ troca: () => json({}, 503) })
  assertEquals((await fora.voltar('code=k&state=s')).searchParams.get('motivo'), 'indisponivel')
})

Deno.test('sem os segredos do app do Canal, o retorno não troca o código', async () => {
  const { voltar, c } = montar({ ambiente: {} })
  assertEquals((await voltar('code=k&state=s')).searchParams.get('motivo'), 'erro')
  assertEquals(c.trocas, [])
})

Deno.test('só volta a uma origem do APP_ORIGIN, mesmo que a tentativa diga outra', async () => {
  const { voltar } = montar({ tentativa: { status: 'ok', workspaceId: WS, returnTo: 'https://malicioso.test' } })
  assertEquals((await voltar('code=k&state=s')).origin, 'https://app.althius.test')
})

Deno.test('só GET', async () => {
  const { handler } = montar()
  assertEquals((await handler(new Request(URL_DE_RETORNO, { method: 'POST' }))).status, 405)
})
