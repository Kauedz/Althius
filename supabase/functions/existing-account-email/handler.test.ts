import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { type Mail, MailRequestError } from '../workspace-invitation-email/handler.ts'
import { createHandler, type Db } from './handler.ts'

const MARINA = 'marina@cliente.com.br'

/**
 * O banco do teste: só as Contas de usuário confirmadas em `confirmadas` (e-mails guardados em minúsculas) recebem
 * aviso, e cada uma só uma vez.
 */
function fakeDb({ confirmadas = [MARINA], falha }: { confirmadas?: string[]; falha?: Error } = {}) {
  const reservas: string[] = []
  const db: Db = {
    claimNotice(email) {
      if (falha) return Promise.reject(falha)
      const guardado = email.trim().toLowerCase()
      if (!confirmadas.includes(guardado) || reservas.includes(guardado)) return Promise.resolve(null)
      reservas.push(guardado)
      return Promise.resolve(guardado)
    },
  }
  return { db, reservas }
}

function fakeMail(resultado: { id: string } | Error = { id: 'email-1' }) {
  const enviados: Parameters<Mail['send']>[0][] = []
  const mail: Mail = {
    send: (email) => {
      enviados.push(email)
      return resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)
    },
  }
  return { mail, enviados }
}

/** O trabalho que continua depois da resposta; o teste espera por ele antes de olhar o que saiu. */
function emSegundoPlano() {
  const trabalhos: Promise<unknown>[] = []
  return {
    waitUntil: (trabalho: Promise<unknown>) => void trabalhos.push(trabalho),
    terminar: () => Promise.all(trabalhos),
  }
}

function pedido(body: unknown, { origin = 'https://app.althius.com.br', method = 'POST' } = {}) {
  return new Request('https://fn.test/existing-account-email', {
    method,
    headers: { apikey: 'sb_publishable_x', Origin: origin, 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

const DEPS = { appOrigin: 'https://app.althius.com.br', from: 'Althius <contato@althius.com.br>', log: () => {} }

Deno.test('quem tenta se cadastrar com o e-mail de uma Conta de usuário confirmada recebe o e-mail que explica como entrar', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  const resposta = await createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil })(pedido({ email: MARINA }))
  await fundo.terminar()

  assertEquals(resposta.status, 202)
  assertEquals(await resposta.json(), { accepted: true })
  const [email] = enviados
  assertEquals(email.from, 'Althius <contato@althius.com.br>')
  assertEquals(email.to, MARINA)
  assertEquals(email.subject, 'Você já tem conta na Althius')
  assertStringIncludes(email.text, 'já tem uma conta na Althius')
  assertStringIncludes(email.text, 'com Google, com a sua senha ou com um código enviado por e-mail')
  assertStringIncludes(email.text, 'https://app.althius.com.br/entrar')
  assertStringIncludes(email.text, 'https://app.althius.com.br/esqueci-a-senha')
  assertStringIncludes(email.html, 'href="https://app.althius.com.br/entrar"')
  assertStringIncludes(email.html, 'href="https://app.althius.com.br/esqueci-a-senha"')
})

Deno.test('um e-mail sem Conta de usuário confirmada recebe a mesma resposta, e nada é enviado', async () => {
  const { db } = fakeDb({ confirmadas: [] })
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  const resposta = await createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil })(pedido({ email: 'ninguem@cliente.com.br' }))
  await fundo.terminar()

  assertEquals(resposta.status, 202)
  assertEquals(await resposta.json(), { accepted: true })
  assertEquals(enviados.length, 0)
})

Deno.test('a resposta sai antes de o banco responder, para o tempo não revelar se o e-mail tem conta', async () => {
  let liberar = () => {}
  const db: Db = { claimNotice: () => new Promise((resolve) => (liberar = () => resolve(MARINA))) }
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  const resposta = await createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil })(pedido({ email: MARINA }))

  assertEquals(resposta.status, 202)
  assertEquals(enviados.length, 0)
  liberar()
  await fundo.terminar()
  assertEquals(enviados.length, 1)
})

Deno.test('quando o banco não reserva outro aviso (limite por e-mail), o segundo pedido não manda outro e-mail', async () => {
  const { db, reservas } = fakeDb()
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  const handler = createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil })
  await handler(pedido({ email: MARINA }))
  const segunda = await handler(pedido({ email: ' Marina@Cliente.com.br ' }))
  await fundo.terminar()

  assertEquals(segunda.status, 202)
  assertEquals(reservas, [MARINA])
  assertEquals(enviados.length, 1)
})

Deno.test('o aviso vai para o e-mail guardado na Conta de usuário, não para o que foi digitado no cadastro', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  await createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil })(pedido({ email: ' Marina@Cliente.com.br ' }))
  await fundo.terminar()

  assertEquals(enviados.map((email) => email.to), [MARINA])
  assertStringIncludes(enviados[0].text, `com este e-mail (${MARINA})`)
})

Deno.test('uma falha do banco não envia nada e não muda a resposta', async () => {
  const { db } = fakeDb({ falha: new Error('connection reset') })
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  const resposta = await createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil })(pedido({ email: MARINA }))
  await fundo.terminar()

  assertEquals(resposta.status, 202)
  assertEquals(enviados.length, 0)
})

Deno.test('o log diz o desfecho de cada pedido, sem o e-mail de quem pediu', async () => {
  const registros: Record<string, unknown>[] = []
  const fundo = emSegundoPlano()
  const handlerCom = (db: Db, mail: Mail) =>
    createHandler({ ...DEPS, db, mail, waitUntil: fundo.waitUntil, log: (campos) => registros.push(campos) })
  await handlerCom(fakeDb().db, fakeMail().mail)(pedido({ email: MARINA }))
  await handlerCom(fakeDb({ confirmadas: [] }).db, fakeMail().mail)(pedido({ email: MARINA }))
  await handlerCom(fakeDb({ falha: new Error('x') }).db, fakeMail().mail)(pedido({ email: MARINA }))
  await handlerCom(fakeDb().db, fakeMail(new MailRequestError(403, 'domain not verified')).mail)(pedido({ email: MARINA }))
  await handlerCom(fakeDb().db, fakeMail(new Error('network')).mail)(pedido({ email: MARINA }))
  await fundo.terminar()

  assertEquals(registros.map((r) => r.outcome), ['sent', 'skipped', 'claim_failed', 'refused', 'uncertain'])
  assertEquals(JSON.stringify(registros).includes(MARINA), false)
})

Deno.test('o link usa a origem de quem pediu só quando ela está no APP_ORIGIN', async () => {
  const fundo = emSegundoPlano()
  const { mail, enviados } = fakeMail()
  const handler = createHandler({
    ...DEPS,
    appOrigin: 'https://app.althius.com.br,http://localhost:5173',
    db: fakeDb({ confirmadas: [MARINA, 'carla@cliente.com.br'] }).db,
    mail,
    waitUntil: fundo.waitUntil,
  })
  await handler(pedido({ email: MARINA }, { origin: 'http://localhost:5173' }))
  await handler(pedido({ email: 'carla@cliente.com.br' }, { origin: 'https://golpe.example' }))
  await fundo.terminar()

  assertStringIncludes(enviados[0].text, 'http://localhost:5173/entrar')
  assertStringIncludes(enviados[1].text, 'https://app.althius.com.br/entrar')
})

Deno.test('um e-mail fora do formato é recusado antes de consultar o banco', async () => {
  for (const email of ['', 'sem-arroba', 'a@b', `${'x'.repeat(250)}@b.co`, 42]) {
    const { db, reservas } = fakeDb()
    const fundo = emSegundoPlano()
    const resposta = await createHandler({ ...DEPS, db, mail: fakeMail().mail, waitUntil: fundo.waitUntil })(pedido({ email }))
    await fundo.terminar()
    assertEquals(resposta.status, 400)
    assertEquals(reservas.length, 0)
  }
})

Deno.test('o e-mail entra escapado no HTML do aviso', async () => {
  const estranho = '"<b>"@cliente.com.br'
  const { mail, enviados } = fakeMail()
  const fundo = emSegundoPlano()
  await createHandler({ ...DEPS, db: fakeDb({ confirmadas: [estranho] }).db, mail, waitUntil: fundo.waitUntil })(
    pedido({ email: estranho }),
  )
  await fundo.terminar()

  assertStringIncludes(enviados[0].html, '&quot;&lt;b&gt;&quot;@cliente.com.br')
  assertEquals(enviados[0].html.includes('<b>'), false)
})

Deno.test('só POST: outro método é recusado e o preflight do CORS responde', async () => {
  const handler = createHandler({ ...DEPS, db: fakeDb().db, mail: fakeMail().mail, waitUntil: () => {} })
  assertEquals((await handler(pedido(null, { method: 'GET' }))).status, 405)
  const preflight = await handler(pedido(null, { method: 'OPTIONS' }))
  assertEquals(preflight.status, 200)
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), 'https://app.althius.com.br')
})
