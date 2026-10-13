import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import { apifyPhotoActor, caminhoDoActor, identificadorDoPerfil, montarEntrada } from './apify.ts'
import {
  type Actor,
  ActorRequestError,
  ActorTimeoutError,
  createHandler,
  type Db,
  type FotoDoPerfil,
  type Reserva,
  type Resultado,
  urlDaFotoValida,
  validadeDaUrl,
} from './handler.ts'

const CONTATO = 'c0000000-0000-0000-0000-000000000001'
const RESERVA_ID = 'd0000000-0000-0000-0000-000000000001'
const PERFIL = 'https://www.linkedin.com/in/maria-souza'
const FOTO = 'https://media.licdn.com/dms/image/maria.jpg?e=4102444800&t=abc'
const RESERVADA: Reserva = { kind: 'reserved', lookupId: RESERVA_ID, linkedinUrl: PERFIL }

function fakeDb({ user = true, reserva = RESERVADA as Reserva | Error, finish = undefined as Error | undefined } = {}) {
  const pedidos: Parameters<Db['beginLookup']>[0][] = []
  const gravados: Resultado[] = []
  const db: Db = {
    userFromJwt: (authorization) =>
      Promise.resolve(user && authorization === 'Bearer jwt-da-ana' ? { userId: 'ana' } : null),
    beginLookup: (args) => {
      pedidos.push(args)
      return reserva instanceof Error ? Promise.reject(reserva) : Promise.resolve(reserva)
    },
    finishLookup: (resultado) => {
      gravados.push(resultado)
      return finish ? Promise.reject(finish) : Promise.resolve()
    },
  }
  return { db, pedidos, gravados }
}

function fakeActor(resultado: FotoDoPerfil | Error = { photoUrl: FOTO, runId: 'run-1' }) {
  const consultados: string[] = []
  const actor: Actor = {
    actorId: 'harvestapi~linkedin-profile-scraper',
    fetchPhoto: (url) => {
      consultados.push(url)
      return resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)
    },
  }
  return { actor, consultados }
}

function pedido(body: unknown, { origin = 'https://app.althius.com.br', method = 'POST' } = {}) {
  return new Request('https://fn.test/contact-photo-lookup', {
    method,
    headers: {
      Authorization: 'Bearer jwt-da-ana',
      apikey: 'anon',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
}

const DEPS = { appOrigin: 'https://app.althius.com.br', log: () => {} }
const CORPO = { contactId: CONTATO }

Deno.test('a busca reserva no banco com a sessão de quem pede, roda o Actor e grava a foto com a validade da URL', async () => {
  const { db, pedidos, gravados } = fakeDb()
  const { actor, consultados } = fakeActor()
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))

  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { status: 'found' })
  assertEquals(pedidos, [{ contactId: CONTATO, authorization: 'Bearer jwt-da-ana', apikey: 'anon' }])
  assertEquals(consultados, [PERFIL])
  assertEquals(gravados, [{
    lookupId: RESERVA_ID,
    outcome: 'found',
    photoUrl: FOTO,
    photoUrlExpiresAt: '2100-01-01T00:00:00.000Z',
    actorId: 'harvestapi~linkedin-profile-scraper',
    runId: 'run-1',
  }])
})

Deno.test('uma URL sem validade declarada é gravada sem validade', async () => {
  const { db, gravados } = fakeDb()
  const { actor } = fakeActor({ photoUrl: 'https://cdn.exemplo/maria.jpg', runId: null })
  await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(gravados[0].photoUrlExpiresAt, undefined)
  assertEquals(gravados[0].runId, undefined)
})

Deno.test('perfil sem foto pública: o resultado é not_found, sem foto inventada', async () => {
  const { db, gravados } = fakeDb()
  const { actor } = fakeActor({ photoUrl: null, runId: 'run-2' })
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { status: 'not_found' })
  assertEquals(gravados, [{
    lookupId: RESERVA_ID,
    outcome: 'not_found',
    actorId: 'harvestapi~linkedin-profile-scraper',
    runId: 'run-2',
  }])
})

Deno.test('uma URL de foto que não é https não vira foto: fica not_found com o motivo registrado', async () => {
  const { db, gravados } = fakeDb()
  const { actor } = fakeActor({ photoUrl: 'http://cdn.exemplo/maria.jpg', runId: null })
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(await resposta.json(), { status: 'not_found' })
  assertEquals([gravados[0].outcome, gravados[0].errorCode, gravados[0].photoUrl], [
    'not_found',
    'invalid_photo_url',
    undefined,
  ])
})

Deno.test('o Apify recusa: a falha é gravada com o código HTTP e a resposta é 502', async () => {
  const { db, gravados } = fakeDb()
  const { actor } = fakeActor(new ActorRequestError(500, 'boom'))
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 502)
  assertStringIncludes((await resposta.json()).error, 'A fonte pública está indisponível agora')
  assertEquals([gravados[0].outcome, gravados[0].errorCode], ['failed', 'actor_http_500'])
})

Deno.test('o Apify sem cota ou com token recusado também não vira foto', async () => {
  for (const status of [401, 402, 429]) {
    const { db, gravados } = fakeDb()
    const { actor } = fakeActor(new ActorRequestError(status))
    const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
    assertEquals(resposta.status, 502)
    assertEquals(gravados[0].errorCode, `actor_http_${status}`)
  }
})

Deno.test('o Actor passa do prazo: a falha é gravada como timeout e a resposta é 504', async () => {
  const { db, gravados } = fakeDb()
  const { actor } = fakeActor(new ActorTimeoutError())
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 504)
  assertEquals([gravados[0].outcome, gravados[0].errorCode], ['failed', 'timeout'])
})

Deno.test('falha de rede até o Apify: gravada como actor_unreachable', async () => {
  const { db, gravados } = fakeDb()
  const { actor } = fakeActor(new TypeError('network'))
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 502)
  assertEquals(gravados[0].errorCode, 'actor_unreachable')
})

Deno.test('acima do limite, a função recusa com 429 e o Actor não roda', async () => {
  for (const scope of ['contact', 'workspace'] as const) {
    const { db, gravados } = fakeDb({ reserva: { kind: 'limit_reached', scope } })
    const { actor, consultados } = fakeActor()
    const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
    assertEquals(resposta.status, 429)
    assertStringIncludes(
      (await resposta.json()).error,
      scope === 'workspace' ? 'Workspace atingiu' : 'Este Contato já teve',
    )
    assertEquals(consultados.length + gravados.length, 0)
  }
})

Deno.test('sem sessão válida, nada é reservado nem consultado', async () => {
  const { db, pedidos } = fakeDb({ user: false })
  const { actor, consultados } = fakeActor()
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 401)
  assertEquals(pedidos.length + consultados.length, 0)
})

Deno.test('sem o cabeçalho de autorização, é 401 sem consultar o banco', async () => {
  const { db, pedidos } = fakeDb()
  const { actor } = fakeActor()
  const req = new Request('https://fn.test/contact-photo-lookup', { method: 'POST', body: JSON.stringify(CORPO) })
  const resposta = await createHandler({ ...DEPS, db, actor })(req)
  assertEquals(resposta.status, 401)
  assertEquals(pedidos.length, 0)
})

Deno.test('um Contato de outro Workspace, ou de quem não participa, não é encontrado e o Actor não roda', async () => {
  const { db, gravados } = fakeDb({ reserva: { kind: 'not_found' } })
  const { actor, consultados } = fakeActor()
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 404)
  assertEquals(consultados.length + gravados.length, 0)
})

Deno.test('recusas do banco viram respostas próprias, sem rodar o Actor', async () => {
  const casos: [Reserva, number][] = [
    [{ kind: 'no_profile' }, 422],
    [{ kind: 'in_flight' }, 409],
    [{ kind: 'manual_photo' }, 409],
  ]
  for (const [reserva, status] of casos) {
    const { db } = fakeDb({ reserva })
    const { actor, consultados } = fakeActor()
    const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
    assertEquals(resposta.status, status)
    assertEquals(consultados.length, 0)
  }
})

Deno.test('uma falha do banco ao reservar não vira "Contato não encontrado" e não roda o Actor', async () => {
  const { db } = fakeDb({ reserva: new Error('connection reset') })
  const { actor, consultados } = fakeActor()
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 500)
  assertEquals(consultados.length, 0)
})

Deno.test('se o resultado não pôde ser gravado, a função não diz que a foto foi encontrada', async () => {
  const { db } = fakeDb({ finish: new Error('connection reset') })
  const { actor } = fakeActor()
  const resposta = await createHandler({ ...DEPS, db, actor })(pedido(CORPO))
  assertEquals(resposta.status, 500)
})

Deno.test('o corpo precisa de um contactId em UUID, antes de consultar o banco', async () => {
  const { db, pedidos } = fakeDb()
  const { actor } = fakeActor()
  const handler = createHandler({ ...DEPS, db, actor })
  assertEquals((await handler(pedido({ contactId: 'x' }))).status, 400)
  assertEquals((await handler(pedido({}))).status, 400)
  const invalido = new Request('https://fn.test/x', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt-da-ana', apikey: 'anon' },
    body: 'não é json',
  })
  assertEquals((await handler(invalido)).status, 400)
  assertEquals(pedidos.length, 0)
})

Deno.test('só POST, e o preflight do CORS passa', async () => {
  const { db } = fakeDb()
  const { actor } = fakeActor()
  const handler = createHandler({ ...DEPS, db, actor })
  assertEquals((await handler(pedido(null, { method: 'GET' }))).status, 405)
  const preflight = await handler(pedido(null, { method: 'OPTIONS' }))
  assertEquals(preflight.status, 200)
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.com.br')
})

Deno.test('o log não leva a URL do perfil nem a da foto', async () => {
  const linhas: string[] = []
  const { db } = fakeDb()
  const { actor } = fakeActor()
  await createHandler({ ...DEPS, db, actor, log: (campos) => linhas.push(JSON.stringify(campos)) })(pedido(CORPO))
  assertEquals(linhas.length, 1)
  assertEquals(linhas[0].includes('linkedin'), false)
  assertEquals(linhas[0].includes('licdn'), false)
})

Deno.test('urlDaFotoValida: só https, com tamanho razoável', () => {
  assertEquals(urlDaFotoValida(' https://cdn.exemplo/a.jpg '), 'https://cdn.exemplo/a.jpg')
  assertEquals(urlDaFotoValida('http://cdn.exemplo/a.jpg'), null)
  assertEquals(urlDaFotoValida('javascript:alert(1)'), null)
  assertEquals(urlDaFotoValida('data:image/png;base64,AAAA'), null)
  assertEquals(urlDaFotoValida('https://cdn.exemplo/' + 'a'.repeat(2100)), null)
  assertEquals(urlDaFotoValida(42), null)
  assertEquals(urlDaFotoValida(''), null)
})

Deno.test('validadeDaUrl: lê o parâmetro e do LinkedIn e ignora o que não é data', () => {
  assertEquals(validadeDaUrl('https://media.licdn.com/a.jpg?e=1893456000&v=beta'), '2030-01-01T00:00:00.000Z')
  assertEquals(validadeDaUrl('https://media.licdn.com/a.jpg'), null)
  assertEquals(validadeDaUrl('https://media.licdn.com/a.jpg?e=logo'), null)
})

// O Actor do Apify, com o fetch injetado.

function fetchQueResponde(resposta: () => Response | Promise<Response>) {
  const chamadas: { url: string; init: RequestInit }[] = []
  const fetchFn = ((url: string, init: RequestInit) => {
    chamadas.push({ url, init })
    return Promise.resolve(resposta())
  }) as unknown as typeof fetch
  return { fetchFn, chamadas }
}

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers })

Deno.test('Apify: chama o Actor síncrono com o token no cabeçalho, a entrada do perfil e os limites de custo', async () => {
  const { fetchFn, chamadas } = fetchQueResponde(() => json([{ photo: FOTO }], 201, { 'x-apify-run-id': 'run-9' }))
  const actor = apifyPhotoActor({ token: 'segredo', fetchFn })
  const foto = await actor.fetchPhoto(PERFIL)

  assertEquals(foto, { photoUrl: FOTO, runId: 'run-9' })
  const [{ url, init }] = chamadas
  assertStringIncludes(
    url,
    'https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/run-sync-get-dataset-items?',
  )
  assertStringIncludes(url, 'timeout=60')
  assertStringIncludes(url, 'maxItems=1')
  assertStringIncludes(url, 'maxTotalChargeUsd=0.05')
  assertEquals(url.includes('segredo'), false, 'o token não vai na URL')
  assertEquals((init.headers as Record<string, string>).Authorization, 'Bearer segredo')
  assertEquals(JSON.parse(init.body as string), {
    profileScraperMode: 'Profile details no email ($4 per 1k)',
    queries: [PERFIL],
  })
})

Deno.test('Apify: o Actor e a entrada são configuráveis, e a URL inteira pode ir no lugar do identificador', async () => {
  const { fetchFn, chamadas } = fetchQueResponde(() => json([]))
  const actor = apifyPhotoActor({
    token: 't',
    actorId: 'outro/actor',
    entrada: '{"startUrls":[{"url":"{{url}}"}],"maxProfiles":1}',
    maxTotalChargeUsd: 0.2,
    fetchFn,
  })
  await actor.fetchPhoto(PERFIL)
  assertStringIncludes(chamadas[0].url, '/acts/outro~actor/')
  assertStringIncludes(chamadas[0].url, 'maxTotalChargeUsd=0.2')
  assertEquals(JSON.parse(chamadas[0].init.body as string), { startUrls: [{ url: PERFIL }], maxProfiles: 1 })
})

Deno.test('Apify: todo campo do perfil é opcional; sem item, sem imagem ou com erro do Actor, não há foto', async () => {
  const respostas: unknown[] = [
    [],
    [{}],
    [{ error: 'Profile not found' }],
    [{ photo: null, firstName: 'Maria' }],
    {},
    null,
  ]
  for (const corpo of respostas) {
    const { fetchFn } = fetchQueResponde(() => json(corpo))
    assertEquals((await apifyPhotoActor({ token: 't', fetchFn }).fetchPhoto(PERFIL)).photoUrl, null)
  }
})

Deno.test('Apify: a imagem pode vir em outros campos, como texto ou como objeto com url', async () => {
  const itens = [
    [{ profilePicture: { url: FOTO, width: 400 } }],
    [{ profilePictureUrl: FOTO }],
    [{ pictureUrl: FOTO }],
  ]
  for (const corpo of itens) {
    const { fetchFn } = fetchQueResponde(() => json(corpo))
    assertEquals((await apifyPhotoActor({ token: 't', fetchFn }).fetchPhoto(PERFIL)).photoUrl, FOTO)
  }
})

Deno.test('Apify: fora de 2xx é recusa, com só a mensagem curta do Apify', async () => {
  const { fetchFn } = fetchQueResponde(() => json({ error: { type: 'x', message: 'Insufficient credits' } }, 402))
  const erro = await assertRejects(() => apifyPhotoActor({ token: 't', fetchFn }).fetchPhoto(PERFIL), ActorRequestError)
  assertEquals([erro.status, erro.detail], [402, 'Insufficient credits'])
})

Deno.test('Apify: 408 (a execução síncrona passou do prazo) é timeout', async () => {
  const { fetchFn } = fetchQueResponde(() => json({ error: { message: 'timed out' } }, 408))
  await assertRejects(() => apifyPhotoActor({ token: 't', fetchFn }).fetchPhoto(PERFIL), ActorTimeoutError)
})

Deno.test('Apify: a chamada que não responde no prazo é abortada e vira timeout', async () => {
  const fetchFn = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
  await assertRejects(
    () => apifyPhotoActor({ token: 't', fetchFn, timeoutMs: 20 }).fetchPhoto(PERFIL),
    ActorTimeoutError,
  )
})

Deno.test('Apify: falha de rede segue como erro comum, que a função grava como actor_unreachable', async () => {
  const fetchFn = (() => Promise.reject(new TypeError('network'))) as unknown as typeof fetch
  const erro = await assertRejects(() => apifyPhotoActor({ token: 't', fetchFn }).fetchPhoto(PERFIL))
  assertEquals(erro instanceof ActorTimeoutError || erro instanceof ActorRequestError, false)
})

Deno.test('entrada: o modelo troca url e identifier sem quebrar o JSON, e um modelo inválido é recusado', () => {
  assertEquals(identificadorDoPerfil('https://www.linkedin.com/in/maria-souza'), 'maria-souza')
  assertEquals(caminhoDoActor(' usuario/actor '), 'usuario~actor')
  assertEquals(montarEntrada('{"a":["{{identifier}}","{{url}}"],"n":1}', 'https://www.linkedin.com/in/a"b'), {
    a: ['a"b', 'https://www.linkedin.com/in/a"b'],
    n: 1,
  })
  try {
    montarEntrada('não é json', PERFIL)
    throw new Error('deveria lançar')
  } catch (erro) {
    assertEquals(erro instanceof SyntaxError, true)
  }
})
