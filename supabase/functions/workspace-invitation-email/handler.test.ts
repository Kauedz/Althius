import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type ConviteParaEnviar,
  createHandler,
  type Db,
  type EmailDeConvite,
  type Mail,
  MailRequestError,
} from './handler.ts'

const WORKSPACE = '51000000-0000-0000-0000-000000000001'
const CONVITE = '70000000-0000-0000-0000-000000000001'
const ADMIN = '50000000-0000-0000-0000-000000000001'
const TOKEN = 'a'.repeat(64)

const PENDENTE: ConviteParaEnviar = {
  email: 'carla@cliente.com.br',
  role: 'member',
  token: TOKEN,
  expiresAt: '2026-10-05T12:00:00Z',
  workspaceName: 'Norte <Distribuidora>',
  inviterName: 'Marina Souza',
}

function fakeDb({ user = true, convite = PENDENTE as ConviteParaEnviar | null } = {}) {
  const pedidos: Parameters<Db['pendingInvitation']>[0][] = []
  const db: Db = {
    userFromJwt: (authorization) =>
      Promise.resolve(user && authorization === 'Bearer jwt-do-admin' ? { userId: ADMIN } : null),
    pendingInvitation: (args) => {
      pedidos.push(args)
      return Promise.resolve(convite)
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

function pedido(body: unknown, { origin = 'https://app.althius.com.br', jwt = 'jwt-do-admin' } = {}) {
  return new Request('https://fn.test/workspace-invitation-email', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: 'anon', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const DEPS = { appOrigin: 'https://app.althius.com.br', from: 'Althius <contato@althius.com.br>' }

Deno.test('o Administrador envia o convite pendente por e-mail, com o link de aceite na origem do app', async () => {
  const { db, pedidos } = fakeDb()
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }))

  assertEquals(resposta.status, 200)
  assertEquals(await resposta.json(), { sent: true, email: 'carla@cliente.com.br' })
  assertEquals(pedidos, [{
    workspaceId: WORKSPACE,
    invitationId: CONVITE,
    authorization: 'Bearer jwt-do-admin',
    apikey: 'anon',
  }])
  assertEquals(enviados.length, 1)
  const [email] = enviados
  assertEquals(email.from, 'Althius <contato@althius.com.br>')
  assertEquals(email.to, 'carla@cliente.com.br')
  assertEquals(email.subject, 'Marina Souza convidou você para o Workspace Norte <Distribuidora> na Althius')
  const link = `https://app.althius.com.br/convite/${TOKEN}`
  assertStringIncludes(email.text, link)
  assertStringIncludes(email.text, 'Membro')
  assertStringIncludes(email.html, `href="${link}"`)
  // O nome do Workspace vem de quem administra: no HTML ele sai escapado.
  assertStringIncludes(email.html, 'Norte &lt;Distribuidora&gt;')
})

Deno.test('o link volta para a origem de quem pediu quando ela é permitida, como o app local', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  await createHandler({ ...DEPS, db, mail })(
    pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }, { origin: 'http://localhost:5173' }),
  )
  assertStringIncludes(enviados[0].text, `http://localhost:5173/convite/${TOKEN}`)
})

Deno.test('uma origem que não é do app não vira link no e-mail: vale a primeira origem publicada', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  await createHandler({ ...DEPS, db, mail })(
    pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }, { origin: 'https://golpe.example' }),
  )
  assertStringIncludes(enviados[0].text, `https://app.althius.com.br/convite/${TOKEN}`)
})

Deno.test('sem sessão válida, nada é enviado', async () => {
  const { db } = fakeDb({ user: false })
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }))
  assertEquals(resposta.status, 401)
  assertEquals(enviados.length, 0)
})

Deno.test('quem não é Administrador, ou um convite que não está pendente, não gera e-mail', async () => {
  const { db } = fakeDb({ convite: null })
  const { mail, enviados } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }))
  assertEquals(resposta.status, 404)
  assertEquals((await resposta.json()).error, 'Convite pendente não encontrado para você enviar.')
  assertEquals(enviados.length, 0)
})

Deno.test('ids fora do formato são recusados antes de consultar o banco', async () => {
  const { db, pedidos } = fakeDb()
  const { mail } = fakeMail()
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ workspaceId: 'x', invitationId: CONVITE }))
  assertEquals(resposta.status, 400)
  assertEquals(pedidos.length, 0)
})

Deno.test('quando o provedor recusa, a resposta diz que o e-mail não saiu', async () => {
  const { db } = fakeDb()
  const { mail } = fakeMail(new MailRequestError(403))
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }))
  assertEquals(resposta.status, 502)
  assertEquals(
    (await resposta.json()).error,
    'O provedor de e-mail não aceitou o envio. O convite continua valendo: copie o link e envie à pessoa.',
  )
})

Deno.test('sem resposta do provedor, a função não afirma que o e-mail saiu', async () => {
  const { db } = fakeDb()
  const { mail } = fakeMail(new Error('network'))
  const resposta = await createHandler({ ...DEPS, db, mail })(pedido({ workspaceId: WORKSPACE, invitationId: CONVITE }))
  assertEquals(resposta.status, 504)
  assertStringIncludes((await resposta.json()).error, 'Não foi possível confirmar o envio')
})
