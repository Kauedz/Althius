import { assertEquals } from 'jsr:@std/assert@1'
import { createUnipileEmail } from './unipile-email.ts'
import { simulatedUnipile } from './simulated-unipile.ts'

const config = { apiOrigin: 'https://api1.unipile.com:13111', apiKey: 'chave-privada' }

Deno.test('envia o passo pela rota v1 de e-mail, com a chave de idempotência da Althius', async () => {
  const unipile = simulatedUnipile()
  unipile.onSend(() => Response.json({ object: 'EmailSent', tracking_id: 'trk-1' }))
  const email = createUnipileEmail(config, unipile.fetch)

  const result = await email.send({
    accountId: 'acc-beto-email',
    to: { email: 'maria@alfa.com.br', name: 'Maria Souza' },
    subject: 'Proposta para a Alfa',
    body: 'Olá, Maria.\nTudo bem? <sem html>',
    idempotencyKey: '5c1d8f1e-0000-4000-8000-000000000001',
  })

  assertEquals(result, { kind: 'accepted', trackingId: 'trk-1' })
  const [request] = unipile.sends
  assertEquals(request.url, 'https://api1.unipile.com:13111/api/v1/emails')
  assertEquals(request.headers.get('X-API-KEY'), 'chave-privada')
  assertEquals(request.headers.get('Idempotency-Key'), '5c1d8f1e-0000-4000-8000-000000000001')
  assertEquals(request.form.get('account_id'), 'acc-beto-email')
  assertEquals(JSON.parse(String(request.form.get('to'))), [{ display_name: 'Maria Souza', identifier: 'maria@alfa.com.br' }])
  assertEquals(request.form.get('subject'), 'Proposta para a Alfa')
  assertEquals(request.form.get('body'), 'Olá, Maria.<br>Tudo bem? &lt;sem html&gt;')
})

Deno.test('recusa do provedor não é incerteza: nada saiu', async () => {
  const unipile = simulatedUnipile()
  unipile.onSend(() => Response.json({ title: 'Invalid recipient' }, { status: 422 }))
  const result = await createUnipileEmail(config, unipile.fetch).send(anySend())
  assertEquals(result, { kind: 'rejected', reason: 'http_422' })
})

Deno.test('erro do servidor, resposta estranha ou tempo esgotado deixam o envio incerto', async () => {
  const unipile = simulatedUnipile()
  unipile.onSend(() => new Response('Bad gateway', { status: 502 }))
  assertEquals(await createUnipileEmail(config, unipile.fetch).send(anySend()), { kind: 'uncertain', reason: 'http_502' })

  unipile.onSend(() => Response.json({ object: 'Algo' }))
  assertEquals(await createUnipileEmail(config, unipile.fetch).send(anySend()), { kind: 'uncertain', reason: 'invalid_response' })

  unipile.onSend(() => new Promise<Response>(() => {}))
  assertEquals(await createUnipileEmail(config, unipile.fetch, 20).send(anySend()), { kind: 'uncertain', reason: 'timeout' })
})

Deno.test('a reconciliação procura o e-mail entre os enviados da conta depois da reserva', async () => {
  const unipile = simulatedUnipile()
  unipile.onSearch(() => Response.json({
    object: 'EmailList',
    items: [
      { id: 'email-outro', subject: 'Outro assunto', message_id: '<outro@mail>' },
      { id: 'email-b1', subject: 'Proposta para a Beta', message_id: '<b1@mail.beto>', tracking_id: 'trk-b1' },
    ],
  }))
  const email = createUnipileEmail(config, unipile.fetch)

  const found = await email.findSent({
    accountId: 'acc-beto-email', to: 'pedro@beta.com.br', subject: 'Proposta para a Beta',
    since: new Date('2026-09-28T12:00:00.000Z'),
  })

  assertEquals(found, { found: true, trackingId: 'trk-b1', emailId: 'email-b1', messageId: '<b1@mail.beto>' })
  const search = new URL(unipile.searches[0].url)
  assertEquals(search.pathname, '/api/v1/emails')
  assertEquals(Object.fromEntries(search.searchParams), {
    account_id: 'acc-beto-email', role: 'sent', to: 'pedro@beta.com.br',
    after: '2026-09-28T11:55:00.000Z', limit: '50',
  })
})

Deno.test('sem o e-mail entre os enviados, a busca responde que não achou; com erro, que não deu para saber', async () => {
  const unipile = simulatedUnipile()
  unipile.onSearch(() => Response.json({ object: 'EmailList', items: [] }))
  const email = createUnipileEmail(config, unipile.fetch)
  const search = { accountId: 'a', to: 'b@c.com', subject: 'Assunto', since: new Date() }
  assertEquals(await email.findSent(search), { found: false })

  unipile.onSearch(() => new Response('down', { status: 503 }))
  assertEquals(await email.findSent(search), { found: 'unknown' })
})

function anySend() {
  return {
    accountId: 'acc', to: { email: 'x@y.com' }, subject: 'Assunto', body: 'Corpo',
    idempotencyKey: '5c1d8f1e-0000-4000-8000-000000000002',
  }
}
