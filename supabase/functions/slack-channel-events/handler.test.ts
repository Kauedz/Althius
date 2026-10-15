import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type AgenteDoSlack, type Db, RESPOSTAS } from './handler.ts'

const SEGREDO = 'segredo-de-assinatura'
const AGORA = 1_760_000_000
const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ANA = '5d000000-0000-0000-0000-000000000001'
const URL_DA_FUNCAO = 'https://proj.supabase.co/functions/v1/slack-channel-events'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const AGENTES: AgenteDoSlack[] = [
  { id: 'ag-scopus', nome: 'Scopus', noSlack: true },
  { id: 'ag-scopus-latam', nome: 'Scopus · Enterprise LATAM', noSlack: true },
  { id: 'ag-ethos', nome: 'Ethos', noSlack: false },
  { id: 'ag-rhetor', nome: 'Rhetor', noSlack: true },
]

interface UsuarioFalso {
  team_id?: string
  is_restricted?: boolean
  is_ultra_restricted?: boolean
  is_stranger?: boolean
  is_bot?: boolean
  deleted?: boolean
  profile?: { email?: string }
}

const USUARIOS: Record<string, UsuarioFalso> = {
  UANA: { team_id: 'T0NORTE', profile: { email: 'ana@norte.test' } },
  UESTRANHO: { team_id: 'T0NORTE', profile: { email: 'quem@fora.test' } },
  UCONVIDADO: { team_id: 'T0NORTE', is_restricted: true, profile: { email: 'ana@norte.test' } },
  UULTRA: { team_id: 'T0NORTE', is_ultra_restricted: true, profile: { email: 'ana@norte.test' } },
  UCONNECT: { team_id: 'T0OUTRO', is_stranger: true, profile: { email: 'ana@norte.test' } },
  UOUTROTIME: { team_id: 'T0OUTRO', profile: { email: 'ana@norte.test' } },
}

interface Montagem {
  instalacao?: boolean
  contas?: Record<string, string>
  agentes?: AgenteDoSlack[]
}

function montar(m: Montagem = {}) {
  const c = {
    reservas: new Set<string>(),
    retiradas: [] as { teamId: string; motivo: string }[],
    postagens: [] as { canal: string; thread_ts: string; text: string; token: string }[],
    leiturasDeUsuario: [] as string[],
    consultasDeEmail: [] as string[],
    logs: [] as Record<string, unknown>[],
    pendentes: [] as Promise<unknown>[],
  }
  const contas = m.contas ?? { 'ana@norte.test': ANA }
  const db: Db = {
    reservarEvento: (eventId) => {
      if (c.reservas.has(eventId)) return Promise.resolve(false)
      c.reservas.add(eventId)
      return Promise.resolve(true)
    },
    instalacaoAtiva: (teamId) =>
      Promise.resolve(
        m.instalacao === false || teamId !== 'T0NORTE' ? null : { workspaceId: WS, botUserId: 'U0BOT', token: 'xoxb-norte' },
      ),
    contaPorEmail: (_ws, email) => {
      c.consultasDeEmail.push(email)
      return Promise.resolve(contas[email] ?? null)
    },
    agentes: () => Promise.resolve(m.agentes ?? AGENTES),
    retirarPeloSlack: (teamId, motivo) => {
      c.retiradas.push({ teamId, motivo })
      return Promise.resolve(true)
    },
  }
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (req.url === 'https://slack.com/api/users.info') {
      const id = new URLSearchParams(await req.text()).get('user') ?? ''
      c.leiturasDeUsuario.push(id)
      const usuario = USUARIOS[id]
      return json(usuario ? { ok: true, user: { id, ...usuario } } : { ok: false, error: 'user_not_found' })
    }
    if (req.url === 'https://slack.com/api/chat.postMessage') {
      const corpo = await req.json()
      c.postagens.push({ canal: corpo.channel, thread_ts: corpo.thread_ts, text: corpo.text, token })
      return json({ ok: true, ts: '1.2' })
    }
    return json({ ok: false, error: 'unknown_method' }, 404)
  }) as typeof fetch
  const handler = createHandler({
    db,
    segredoDeAssinatura: SEGREDO,
    agora: () => AGORA,
    fetch: fetchFalso,
    esperarDepois: (trabalho) => {
      c.pendentes.push(trabalho)
    },
    log: (campos) => c.logs.push(campos),
  })
  const terminar = () => Promise.all(c.pendentes)
  return { c, handler, terminar }
}

async function assinar(corpo: string, timestamp: number, segredo = SEGREDO) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`v0:${timestamp}:${corpo}`)))
  return `v0=${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function pedido(corpo: unknown, opcoes: { timestamp?: number; segredo?: string } = {}) {
  const texto = JSON.stringify(corpo)
  const timestamp = opcoes.timestamp ?? AGORA
  return new Request(URL_DA_FUNCAO, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Slack-Request-Timestamp': String(timestamp),
      'X-Slack-Signature': await assinar(texto, timestamp, opcoes.segredo),
    },
    body: texto,
  })
}

let contador = 0
function evento(interno: Record<string, unknown>, envelope: Record<string, unknown> = {}) {
  contador += 1
  return {
    type: 'event_callback',
    team_id: 'T0NORTE',
    api_app_id: 'A0ALTHIUS',
    event_id: `Ev${String(contador).padStart(6, '0')}`,
    event_time: AGORA,
    event: interno,
    ...envelope,
  }
}

const mencao = (texto: string, extra: Record<string, unknown> = {}) =>
  evento({ type: 'app_mention', user: 'UANA', text: `<@U0BOT> ${texto}`, ts: '1700000000.000100', channel: 'C0GERAL', ...extra })

const noDm = (texto: string, extra: Record<string, unknown> = {}) =>
  evento({ type: 'message', channel_type: 'im', user: 'UANA', text: texto, ts: '1700000000.000300', channel: 'D0ANA', ...extra })

async function entregar(montagem: ReturnType<typeof montar>, corpo: unknown) {
  const resposta = await montagem.handler(await pedido(corpo))
  await montagem.terminar()
  return resposta
}

// Assinatura e desafio

Deno.test('o desafio de verificação da URL é respondido com o challenge', async () => {
  const { handler } = montar()
  const resposta = await handler(await pedido({ type: 'url_verification', token: 'x', challenge: 'desafio-123' }))
  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { challenge: 'desafio-123' })
})

Deno.test('assinatura inválida, velha ou ausente é recusada sem tocar o banco', async () => {
  const m = montar()
  const corpo = mencao('@Scopus oi')
  assertEquals((await m.handler(await pedido(corpo, { segredo: 'outro' }))).status, 401)
  assertEquals((await m.handler(await pedido(corpo, { timestamp: AGORA - 301 }))).status, 401)
  const semAssinatura = new Request(URL_DA_FUNCAO, { method: 'POST', body: JSON.stringify(corpo) })
  assertEquals((await m.handler(semAssinatura)).status, 401)
  const desafioForjado = await m.handler(await pedido({ type: 'url_verification', challenge: 'x' }, { segredo: 'outro' }))
  assertEquals(desafioForjado.status, 401)
  await m.terminar()
  assertEquals(m.c.reservas.size, 0)
  assertEquals(m.c.postagens, [])
})

Deno.test('só POST', async () => {
  const { handler } = montar()
  assertEquals((await handler(new Request(URL_DA_FUNCAO))).status, 405)
})

Deno.test('confirma com 200 antes de processar, e processa depois', async () => {
  const m = montar()
  const resposta = await m.handler(await pedido(mencao('oi')))
  assertEquals(resposta.status, 200)
  assertEquals(m.c.postagens, [], 'nada foi postado antes da confirmação')
  assertEquals(m.c.pendentes.length, 1)
  await m.terminar()
  assertEquals(m.c.postagens.length, 1)
})

Deno.test('o mesmo event_id reenviado é confirmado sem efeito', async () => {
  const m = montar()
  const corpo = mencao('oi')
  assertEquals((await entregar(m, corpo)).status, 200)
  assertEquals((await entregar(m, corpo)).status, 200)
  assertEquals(m.c.postagens.length, 1, 'postado uma vez só')
})

// Eventos ignorados

Deno.test('mensagens de bots, do próprio @Althius, edições, remoções e outros subtipos são ignoradas', async () => {
  const m = montar()
  const ignorados = [
    noDm('@Scopus oi', { bot_id: 'B0OUTRO' }),
    noDm('@Scopus oi', { subtype: 'bot_message' }),
    noDm('Mencione um Agente', { user: 'U0BOT' }),
    noDm('@Scopus editado', { subtype: 'message_changed' }),
    noDm('', { subtype: 'message_deleted' }),
    noDm('entrou', { subtype: 'channel_join' }),
    mencao('@Scopus oi', { bot_id: 'B0OUTRO' }),
    mencao('@Scopus oi', { edited: { user: 'UANA', ts: '1.1' } }),
  ]
  for (const corpo of ignorados) assertEquals((await entregar(m, corpo)).status, 200)
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.leiturasDeUsuario, [], 'nem lê quem escreveu')
})

Deno.test('mensagens de canal sem menção ao bot são ignoradas (nenhum fio mapeado neste ticket)', async () => {
  const m = montar()
  await entregar(m, evento({ type: 'message', channel_type: 'channel', user: 'UANA', text: '@Scopus oi', ts: '1.1', channel: 'C0GERAL' }))
  await entregar(
    m,
    evento({ type: 'message', channel_type: 'channel', user: 'UANA', text: 'segue', ts: '1.3', thread_ts: '1.1', channel: 'C0GERAL' }),
  )
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.leiturasDeUsuario, [])
})

Deno.test('sem instalação ativa para o team_id, o evento é ignorado', async () => {
  const m = montar({ instalacao: false })
  await entregar(m, mencao('oi'))
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.leiturasDeUsuario, [])
})

Deno.test('outro tipo de evento é confirmado e ignorado', async () => {
  const m = montar()
  assertEquals((await entregar(m, evento({ type: 'reaction_added', user: 'UANA' }))).status, 200)
  assertEquals(m.c.postagens, [])
})

// Identidade

for (
  const [nome, usuario] of [
    ['e-mail sem Participação ativa (ou Participação removida)', 'UESTRANHO'],
    ['convidado restrito do Slack', 'UCONVIDADO'],
    ['convidado ultra-restrito do Slack', 'UULTRA'],
    ['pessoa de Slack Connect', 'UCONNECT'],
    ['pessoa de outro workspace Slack', 'UOUTROTIME'],
    ['usuário que o Slack não encontra', 'UNINGUEM'],
  ] as const
) {
  Deno.test(`${nome} recebe "não reconhecido" no thread`, async () => {
    const m = montar()
    await entregar(m, mencao('@Scopus oi', { user: usuario }))
    assertEquals(m.c.postagens, [
      { canal: 'C0GERAL', thread_ts: '1700000000.000100', text: RESPOSTAS.naoReconhecido, token: 'xoxb-norte' },
    ])
  })
}

Deno.test('convidado e Slack Connect não chegam a ser procurados pelo e-mail', async () => {
  const m = montar()
  await entregar(m, mencao('@Scopus oi', { user: 'UCONVIDADO' }))
  await entregar(m, mencao('@Scopus oi', { user: 'UCONNECT' }))
  await entregar(m, mencao('@Scopus oi', { user: 'UANA', user_team: 'T0OUTRO' }))
  assertEquals(m.c.consultasDeEmail, [])
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.naoReconhecido, RESPOSTAS.naoReconhecido, RESPOSTAS.naoReconhecido])
})

Deno.test('a Participação removida deixa de ser atendida na hora', async () => {
  const contas: Record<string, string> = { 'ana@norte.test': ANA }
  const m = montar({ contas })
  await entregar(m, mencao('oi'))
  delete contas['ana@norte.test']
  await entregar(m, mencao('oi'))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.mencioneUmAgente, RESPOSTAS.naoReconhecido])
})

// Do evento à decisão

Deno.test('@Althius sem @Agente recebe o aviso no thread da mensagem', async () => {
  const m = montar()
  await entregar(m, mencao('pode me ajudar?'))
  assertEquals(m.c.postagens, [
    { canal: 'C0GERAL', thread_ts: '1700000000.000100', text: RESPOSTAS.mencioneUmAgente, token: 'xoxb-norte' },
  ])
})

Deno.test('a resposta vai no thread de cima quando a menção já está num thread', async () => {
  const m = montar()
  await entregar(m, mencao('oi', { ts: '1700000000.000500', thread_ts: '1700000000.000100' }))
  assertEquals(m.c.postagens[0].thread_ts, '1700000000.000100')
})

Deno.test('no DM, mensagem sem @Agente recebe o aviso, sem Agente padrão', async () => {
  const m = montar()
  await entregar(m, noDm('me ajuda com o funil'))
  assertEquals(m.c.postagens, [
    { canal: 'D0ANA', thread_ts: '1700000000.000300', text: RESPOSTAS.mencioneUmAgente, token: 'xoxb-norte' },
  ])
})

Deno.test('Agente fora da lista de canais recebe "não atende no Slack"', async () => {
  const m = montar()
  await entregar(m, mencao('@Ethos escreva um e-mail'))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.naoAtendeNoSlack('Ethos')])
})

Deno.test('mais de um Agente na abertura é recusado pedindo um Agente por fio', async () => {
  const m = montar()
  await entregar(m, mencao('@Scopus e @Rhetor, olhem isso'))
  await entregar(m, noDm('@Scopus e @Ethos'))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.umAgentePorFio, RESPOSTAS.umAgentePorFio])
})

Deno.test('um Agente do Slack e outro fora da lista: a recusa é a de um Agente por fio', async () => {
  const m = montar()
  await entregar(m, mencao('@Scopus e @Ethos'))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.umAgentePorFio])
})

Deno.test('o thread_broadcast é outro subtipo e é ignorado', async () => {
  const m = montar()
  await entregar(m, noDm('@Scopus oi', { subtype: 'thread_broadcast' }))
  assertEquals(m.c.postagens, [])
  assertEquals(m.c.logs.filter((l) => l.resultado === 'abrir_fio'), [])
})

Deno.test('sem instalação ativa nada é reservado', async () => {
  const m = montar({ instalacao: false })
  await entregar(m, mencao('oi'))
  assertEquals(m.c.reservas.size, 0)
})

Deno.test('só arquivo, áudio ou canvas recebe "só leio texto por enquanto"', async () => {
  const m = montar()
  await entregar(m, mencao('', { files: [{ id: 'F1' }] }))
  await entregar(m, noDm('', { subtype: 'file_share', files: [{ id: 'F2', subtype: 'slack_audio' }] }))
  await entregar(m, noDm('', { attachments: [{ id: 1 }] }))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.soTexto, RESPOSTAS.soTexto, RESPOSTAS.soTexto])
  assertEquals(m.c.postagens[1], { canal: 'D0ANA', thread_ts: '1700000000.000300', text: RESPOSTAS.soTexto, token: 'xoxb-norte' })
})

Deno.test('exatamente um Agente no Slack chega à decisão "abrir fio" e para ali, sem postar', async () => {
  const m = montar()
  await entregar(m, mencao('@Scopus · Enterprise LATAM, quem são as contas quentes?'))
  await entregar(m, noDm('@scopus oi', { files: [{ id: 'F3' }] }))
  assertEquals(m.c.postagens, [])
  const decisoes = m.c.logs.filter((l) => l.resultado === 'abrir_fio')
  assertEquals(decisoes.map((l) => [l.agentId, l.canal, l.threadTs]), [
    ['ag-scopus-latam', 'C0GERAL', '1700000000.000100'],
    ['ag-scopus', 'D0ANA', '1700000000.000300'],
  ])
  assert(decisoes.every((l) => l.userId === ANA))
})

Deno.test('a menção ao bot e de outras pessoas não conta como Agente', async () => {
  const m = montar()
  await entregar(m, mencao('<@UOUTRO> veja isso'))
  assertEquals(m.c.postagens.map((p) => p.text), [RESPOSTAS.mencioneUmAgente])
})

Deno.test('o log não traz o e-mail nem o texto da pessoa', async () => {
  const m = montar()
  await entregar(m, mencao('@Scopus segredo comercial', { user: 'UESTRANHO' }))
  const tudo = JSON.stringify(m.c.logs)
  assert(!tudo.includes('fora.test'))
  assert(!tudo.includes('segredo comercial'))
})

Deno.test('uma falha ao postar fica no log e não derruba a função', async () => {
  const m = montar()
  const quebrado = createHandler({
    db: {
      reservarEvento: () => Promise.resolve(true),
      instalacaoAtiva: () => Promise.resolve({ workspaceId: WS, botUserId: 'U0BOT', token: 'xoxb-norte' }),
      contaPorEmail: () => Promise.resolve(null),
      agentes: () => Promise.resolve(AGENTES),
      retirarPeloSlack: () => Promise.resolve(false),
    },
    segredoDeAssinatura: SEGREDO,
    agora: () => AGORA,
    fetch: (() => Promise.resolve(json({ ok: false, error: 'not_in_channel' }))) as typeof fetch,
    esperarDepois: (t) => {
      m.c.pendentes.push(t)
    },
    log: (campos) => m.c.logs.push(campos),
  })
  assertEquals((await quebrado(await pedido(mencao('oi')))).status, 200)
  await m.terminar()
  assert(m.c.logs.some((l) => l.resultado === 'falha'))
})

// Retirada pelo Slack

Deno.test('app_uninstalled marca a instalação como retirada', async () => {
  const m = montar()
  await entregar(m, evento({ type: 'app_uninstalled' }))
  assertEquals(m.c.retiradas, [{ teamId: 'T0NORTE', motivo: 'desinstalado' }])
})

Deno.test('tokens_revoked do token do bot marca a instalação como retirada; só tokens de usuário, não', async () => {
  const m = montar()
  await entregar(m, evento({ type: 'tokens_revoked', tokens: { oauth: ['UANA'] } }))
  assertEquals(m.c.retiradas, [])
  await entregar(m, evento({ type: 'tokens_revoked', tokens: { bot: ['U0BOT'] } }))
  assertEquals(m.c.retiradas, [{ teamId: 'T0NORTE', motivo: 'token_revogado' }])
})

Deno.test('corpo ilegível ou sem event_id é recusado', async () => {
  const m = montar()
  const texto = 'nao-json'
  const ilegivel = new Request(URL_DA_FUNCAO, {
    method: 'POST',
    headers: { 'X-Slack-Request-Timestamp': String(AGORA), 'X-Slack-Signature': await assinar(texto, AGORA) },
    body: texto,
  })
  assertEquals((await m.handler(ilegivel)).status, 400)
  assertEquals((await m.handler(await pedido({ type: 'event_callback', team_id: 'T0NORTE', event: { type: 'app_mention' } }))).status, 400)
})
