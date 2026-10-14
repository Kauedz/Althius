import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { MailRequestError, type Mail } from '../workspace-invitation-email/handler.ts'
import { DESTINO, type Db, type PedidoDeAcesso, type ReservaDoAviso, createHandler, montarEmail } from './handler.ts'

const PEDIDO = '70000000-0000-4000-8000-000000000001'
const USUARIO = '50000000-0000-4000-8000-000000000001'

const AVISO: PedidoDeAcesso = {
  nome: 'Eva <Dias>',
  empresa: 'Cliente SA',
  telefone: '11 99999-0000',
  mensagem: 'Quero conhecer a Althius & o plano.',
  email: 'eva@cliente.com.br',
}

function fakeDb({ user = true, reserva = { kind: 'reserved', pedido: AVISO } as ReservaDoAviso | Error } = {}) {
  const pedidos: string[] = []
  const soltos: string[] = []
  const db: Db = {
    userFromJwt: (authorization) =>
      Promise.resolve(user && authorization === 'Bearer jwt' ? { userId: USUARIO } : null),
    claimAccessRequestNotice: ({ requestId }) => {
      pedidos.push(requestId)
      return reserva instanceof Error ? Promise.reject(reserva) : Promise.resolve(reserva)
    },
    releaseAccessRequestNotice: ({ requestId }) => {
      soltos.push(requestId)
      return Promise.resolve()
    },
  }
  return { db, pedidos, soltos }
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

function pedido(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://funcoes.invalid/access-request-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt', apikey: 'chave', ...headers },
    body: JSON.stringify(body),
  })
}

const depsBase = { appOrigin: 'https://app.althius.com.br', from: 'Althius <contato@althius.com.br>', log: () => {} }

Deno.test('envia o pedido para a equipe, com o texto escapado e o assunto fixo', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { sent: true })
  assertEquals(enviados.length, 1)
  assertEquals(enviados[0].to, DESTINO)
  assertEquals(enviados[0].subject, 'Novo pedido de acesso à Althius')
  assertStringIncludes(enviados[0].html, 'Eva &lt;Dias&gt;')
  assertStringIncludes(enviados[0].html, 'Althius &amp; o plano')
  assertStringIncludes(enviados[0].text, 'eva@cliente.com.br')
  assertEquals(enviados[0].subject.includes('Eva'), false)
})

Deno.test('o destino não vem do corpo', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO, to: 'outro@exemplo.com', destino: 'outro@exemplo.com' }))
  assertEquals(enviados[0].to, DESTINO)
  assertEquals(montarEmail(AVISO, 'Althius <contato@althius.com.br>').to, DESTINO)
})

Deno.test('pedido já avisado não manda outro e-mail', async () => {
  const { db } = fakeDb({ reserva: { kind: 'already' } })
  const { mail, enviados } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { sent: true, already: true })
  assertEquals(enviados.length, 0)
})

Deno.test('sem sessão responde 401 e não reserva', async () => {
  const { db, pedidos } = fakeDb({ user: false })
  const { mail } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO }))
  assertEquals(res.status, 401)
  assertEquals(pedidos.length, 0)
})

Deno.test('corpo sem uuid responde 400', async () => {
  const { db, pedidos } = fakeDb()
  const { mail } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: 'norte' }))
  assertEquals(res.status, 400)
  assertEquals(pedidos.length, 0)
})

Deno.test('falha ao reservar responde 500 e não envia', async () => {
  const { db } = fakeDb({ reserva: new Error('banco fora') })
  const { mail, enviados } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO }))
  assertEquals(res.status, 500)
  assertEquals(enviados.length, 0)
})

Deno.test('o provedor recusa: responde 502 e solta o aviso para outra tentativa', async () => {
  const { db, soltos } = fakeDb()
  const { mail } = fakeMail(new MailRequestError(422, 'recusado'))
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO }))
  assertEquals(res.status, 502)
  assertEquals(soltos, [PEDIDO])
})

Deno.test('envio incerto responde 504 e não solta o aviso, para não mandar duas vezes', async () => {
  const { db, soltos } = fakeDb()
  const { mail } = fakeMail(new Error('timeout'))
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ requestId: PEDIDO }))
  assertEquals(res.status, 504)
  assertEquals(soltos.length, 0)
})

Deno.test('só POST', async () => {
  const { db } = fakeDb()
  const { mail } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(new Request('https://funcoes.invalid/access-request-notify', { method: 'GET' }))
  assertEquals(res.status, 405)
})
