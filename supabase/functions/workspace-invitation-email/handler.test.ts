import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type ConviteParaEnviar,
  createHandler,
  type Db,
  type EmailDeConvite,
  type Mail,
  MailRequestError,
  type ReservaDoEnvio,
} from './handler.ts'
import { resendMail } from './resend.ts'

const WORKSPACE = '51000000-0000-0000-0000-000000000001'
const CONVITE = '70000000-0000-0000-0000-000000000001'
const ADMIN = '50000000-0000-0000-0000-000000000001'
const TOKEN = 'a'.repeat(64)

const PENDENTE: ConviteParaEnviar = {
  email: 'carla@cliente.com.br',
  role: 'member',
  token: TOKEN,
  expiresAt: '2026-10-06T01:30:00Z',
  workspaceName: 'Norte <Distribuidora>',
  inviterName: 'Marina Souza',
}

function fakeDb({ user = true, reserva = { kind: 'reserved', convite: PENDENTE } as ReservaDoEnvio | Error } = {}) {
  const pedidos: Parameters<Db['claimInvitationEmail']>[0][] = []
  const db: Db = {
    userFromJwt: (authorization) =>
      Promise.resolve(user && authorization === 'Bearer jwt-do-admin' ? { userId: ADMIN } : null),
    claimInvitationEmail: (args) => {
      pedidos.push(args)
      return reserva instanceof Error ? Promise.reject(reserva) : Promise.resolve(reserva)
    },
  }
  return { db, pedidos }
}

function fakeMail(resultado: { id: string } | Error = { id: 'email-1' }) {
  const enviados: EmailDeConvite[] = []
  const mail: Mail = {
    send: (email) => {
      enviados.push(email)
      return resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)
    },
  }
  return { mail, enviados }
}

function pedido(body: unknown, { origin = 'https://app.althius.com.br' } = {}) {
  return new Request('https://fn.test/workspace-invitation-email', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer jwt-do-admin',
      apikey: 'anon',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const DEPS = { appOrigin: 'https://app.althius.com.br', from: 'Althius <contato@althius.com.br>', log: () => {} }
const CORPO = { workspaceId: WORKSPACE, invitationId: CONVITE }

Deno.test('o Administrador reserva o envio no banco e o convite pendente sai por e-mail, com o link de aceite', async () => {
  const { db, pedidos } = fakeDb()
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))

  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { sent: true, email: 'carla@cliente.com.br' })
  assertEquals(pedidos, [{ ...CORPO, authorization: 'Bearer jwt-do-admin', apikey: 'anon' }])
  const [email] = enviados
  assertEquals(email.from, 'Althius <contato@althius.com.br>')
  assertEquals(email.to, 'carla@cliente.com.br')
  // Texto livre de quem usa o app (nome do Workspace, de quem convida) nunca vai no assunto.
  assertEquals(email.subject, 'Convite para um Workspace na Althius')
  const link = `https://app.althius.com.br/convite/${TOKEN}`
  assertStringIncludes(email.text, link)
  assertStringIncludes(email.text, 'como Membro')
  assertStringIncludes(email.text, 'crie sua conta, com este mesmo e-mail (carla@cliente.com.br)')
  // O prazo aparece no horário de Brasília: 01:30 UTC do dia 6 ainda é dia 5.
  assertStringIncludes(email.text, 'O convite vale até 05/10/2026')
  assertStringIncludes(email.html, `href="${link}"`)
  assertStringIncludes(email.html, 'Norte &lt;Distribuidora&gt;')
})

Deno.test('nomes longos entram cortados no corpo do e-mail', async () => {
  const { db } = fakeDb({ reserva: { kind: 'reserved', convite: { ...PENDENTE, workspaceName: 'x'.repeat(300) } } })
  const { mail, enviados } = fakeMail()
  await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertStringIncludes(enviados[0].text, `Workspace ${'x'.repeat(79)}… na Althius`)
})

Deno.test('o link usa a origem de quem pediu só quando ela está no APP_ORIGIN', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  const handler = createHandler({ ...DEPS, appOrigin: 'https://app.althius.com.br,http://localhost:5173', db, mail })
  await handler(pedido(CORPO, { origin: 'http://localhost:5173' }))
  assertStringIncludes(enviados[0].text, `http://localhost:5173/convite/${TOKEN}`)
})

Deno.test('uma origem fora do APP_ORIGIN, mesmo local, não vira link: vale a primeira origem publicada', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  const handler = createHandler({ ...DEPS, db, mail })
  await handler(pedido(CORPO, { origin: 'http://localhost:5173' }))
  await handler(pedido(CORPO, { origin: 'https://golpe.example' }))
  assertStringIncludes(enviados[0].text, `https://app.althius.com.br/convite/${TOKEN}`)
  assertStringIncludes(enviados[1].text, `https://app.althius.com.br/convite/${TOKEN}`)
})

Deno.test('sem sessão válida, nada é reservado nem enviado', async () => {
  const { db, pedidos } = fakeDb({ user: false })
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertEquals(resposta.status, 401)
  assertEquals(pedidos.length + enviados.length, 0)
})

Deno.test('quando o banco não reserva (não é Administrador ou o convite não está pendente), nada é enviado', async () => {
  const { db } = fakeDb({ reserva: { kind: 'not_found' } })
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertEquals(resposta.status, 404)
  assertEquals(enviados.length, 0)
})

Deno.test('acima do limite de e-mails, a função recusa sem enviar', async () => {
  const { db } = fakeDb({ reserva: { kind: 'limit_reached' } })
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertEquals(resposta.status, 429)
  assertStringIncludes((await resposta.json()).error, 'Espere alguns minutos')
  assertEquals(enviados.length, 0)
})

Deno.test('uma falha do banco não vira "convite não encontrado"', async () => {
  const { db } = fakeDb({ reserva: new Error('connection reset') })
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertEquals(resposta.status, 500)
  assertEquals(enviados.length, 0)
})

Deno.test('ids fora do formato são recusados antes de consultar o banco', async () => {
  const { db, pedidos } = fakeDb()
  const { mail } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ ...CORPO, workspaceId: 'x' }))
  assertEquals(resposta.status, 400)
  assertEquals(pedidos.length, 0)
})

Deno.test('quando o provedor recusa, a resposta diz que não aceitou o envio', async () => {
  const { db } = fakeDb()
  const { mail } = fakeMail(new MailRequestError(403))
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertEquals(resposta.status, 502)
  assertEquals((await resposta.json()).error, 'O provedor de e-mail não aceitou o envio.')
})

Deno.test('sem confirmação do provedor, a função não afirma que o e-mail saiu', async () => {
  const { db } = fakeDb()
  const { mail } = fakeMail(new Error('network'))
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido(CORPO))
  assertEquals(resposta.status, 504)
  assertEquals((await resposta.json()).error, 'O provedor de e-mail não confirmou o envio a tempo.')
})

const EMAIL: EmailDeConvite = { from: 'a@b.c', to: 'd@e.f', subject: 's', html: 'h', text: 't' }

Deno.test('Resend: 2xx com o id confirma o envio', async () => {
  const fetchFn = () => Promise.resolve(new Response(JSON.stringify({ id: 're-1' }), { status: 200 }))
  assertEquals(await resendMail('k', { fetchFn }).send(EMAIL), { id: 're-1' })
})

Deno.test('Resend: fora de 2xx é recusa', async () => {
  const fetchFn = () =>
    Promise.resolve(new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }))
  const erro = await assertRejects(() => resendMail('k', { fetchFn }).send(EMAIL), MailRequestError)
  assertEquals([erro.status, erro.detail], [403, 'domain not verified'])
})

Deno.test('Resend: 2xx sem o id deixa o envio incerto, não confirmado', async () => {
  const fetchFn = () => Promise.resolve(new Response('{}', { status: 200 }))
  const erro = await assertRejects(() => resendMail('k', { fetchFn }).send(EMAIL))
  assertEquals(erro instanceof MailRequestError, false)
})
