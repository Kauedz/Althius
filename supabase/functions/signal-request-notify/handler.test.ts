import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { MailRequestError, type Mail } from '../workspace-invitation-email/handler.ts'
import {
  DESTINO,
  type Db,
  type PedidoParaAvisar,
  type ReservaDoAviso,
  createHandler,
  montarEmail,
} from './handler.ts'

const WORKSPACE = '51000000-0000-0000-0000-000000000001'
const PEDIDO = '70000000-0000-0000-0000-000000000001'
const USUARIO = '50000000-0000-0000-0000-000000000001'

const AVISO: PedidoParaAvisar = {
  evento: 'Hospitais que anunciam <alas>',
  empresasOuNicho: 'Saúde',
  fontesConhecidas: 'Diário oficial',
  urgencia: 'esta_semana',
  contato: { nome: 'Marina Alves', email: 'marina.alves@databricks.com', whatsapp: '11999990000' },
  workspaceName: 'Databricks',
}

function fakeDb({ user = true, reserva = { kind: 'reserved', pedido: AVISO } as ReservaDoAviso | Error } = {}) {
  const pedidos: Parameters<Db['claimSignalRequestNotice']>[0][] = []
  const db: Db = {
    userFromJwt: (authorization) =>
      Promise.resolve(user && authorization === 'Bearer jwt' ? { userId: USUARIO } : null),
    claimSignalRequestNotice: (args) => {
      pedidos.push(args)
      return reserva instanceof Error ? Promise.reject(reserva) : Promise.resolve(reserva)
    },
  }
  return { db, pedidos }
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
  return new Request('https://funcoes.invalid/signal-request-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt', apikey: 'chave', ...headers },
    body: JSON.stringify(body),
  })
}

const depsBase = { appOrigin: 'https://app.althius.com.br', from: 'Althius <contato@althius.com.br>' }

Deno.test('envia o pedido para a equipe, com o texto escapado e assunto fixo', async () => {
  const { db } = fakeDb()
  const { mail, enviados } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ workspaceId: WORKSPACE, requestId: PEDIDO }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { sent: true })
  assertEquals(enviados.length, 1)
  assertEquals(enviados[0].to, DESTINO)
  assertEquals(enviados[0].subject, 'Novo pedido de Sinal')
  assertStringIncludes(enviados[0].html, 'Hospitais que anunciam &lt;alas&gt;')
  assertStringIncludes(enviados[0].html, 'Esta semana')
  assertStringIncludes(enviados[0].text, 'marina.alves@databricks.com')
  assertEquals(enviados[0].subject.includes('alas'), false)
})

Deno.test('pedido já avisado não manda outro e-mail', async () => {
  const { db } = fakeDb({ reserva: { kind: 'already' } })
  const { mail, enviados } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ workspaceId: WORKSPACE, requestId: PEDIDO }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { sent: true, already: true })
  assertEquals(enviados.length, 0)
})

Deno.test('sem sessão responde 401 e não reserva', async () => {
  const { db, pedidos } = fakeDb({ user: false })
  const { mail } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ workspaceId: WORKSPACE, requestId: PEDIDO }))
  assertEquals(res.status, 401)
  assertEquals(pedidos.length, 0)
})

Deno.test('corpo sem uuid responde 400', async () => {
  const { db, pedidos } = fakeDb()
  const { mail } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ workspaceId: 'norte', requestId: PEDIDO }))
  assertEquals(res.status, 400)
  assertEquals(pedidos.length, 0)
})

Deno.test('falha ao reservar responde 500', async () => {
  const { db } = fakeDb({ reserva: new Error('banco fora') })
  const { mail, enviados } = fakeMail()
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ workspaceId: WORKSPACE, requestId: PEDIDO }))
  assertEquals(res.status, 500)
  assertEquals(enviados.length, 0)
})

Deno.test('provedor recusa responde 502', async () => {
  const { db } = fakeDb()
  const { mail } = fakeMail(new MailRequestError(422, 'recusado'))
  const res = await createHandler({ ...depsBase, db, mail })(pedido({ workspaceId: WORKSPACE, requestId: PEDIDO }))
  assertEquals(res.status, 502)
})

Deno.test('o destino não vem do corpo', () => {
  const email = montarEmail(AVISO, 'Althius <contato@althius.com.br>')
  assertEquals(email.to, DESTINO)
})
