import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type UnsubscribeOutcome } from './handler.ts'

function fakeDb(outcomes: Record<string, UnsubscribeOutcome>) {
  const calls: string[] = []
  return {
    calls,
    db: {
      unsubscribe: async (token: string) => {
        calls.push(token)
        return outcomes[token] ?? 'invalid'
      },
    },
  }
}

const handlerWith = (db: ReturnType<typeof fakeDb>['db']) => createHandler({ db, appOrigin: 'https://app.test' })

Deno.test('abrir o link pelo navegador leva à página de confirmação do app, sem registrar nada', async () => {
  const { db, calls } = fakeDb({ tok: 'registered' })
  const res = await handlerWith(db)(new Request('https://fn.test/descadastro?t=tok'))
  assertEquals(res.status, 302)
  assertEquals(res.headers.get('Location'), 'https://app.test/descadastro?t=tok')
  assertEquals(calls, [])
})

Deno.test('o clique único do provedor (List-Unsubscribe-Post) registra o descadastro', async () => {
  const { db, calls } = fakeDb({ tok: 'registered' })
  const res = await handlerWith(db)(new Request('https://fn.test/descadastro?t=tok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  }))
  assertEquals(res.status, 200)
  assertEquals(calls, ['tok'])
})

Deno.test('a página do app confirma pelo corpo JSON; repetir é idempotente', async () => {
  const { db } = fakeDb({ tok: 'already_registered' })
  const res = await handlerWith(db)(new Request('https://fn.test/descadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://app.test' },
    body: JSON.stringify({ token: 'tok' }),
  }))
  assertEquals(res.status, 200)
  assertEquals((await res.json()).outcome, 'already_registered')
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://app.test')
})

Deno.test('token desconhecido ou ausente não revela nada e responde 404', async () => {
  const { db, calls } = fakeDb({})
  const res = await handlerWith(db)(new Request('https://fn.test/descadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'nao-existe' }),
  }))
  assertEquals(res.status, 404)
  assertEquals((await res.json()).outcome, 'invalid')
  const vazio = await handlerWith(db)(new Request('https://fn.test/descadastro', { method: 'POST', body: '{}' }))
  assertEquals(vazio.status, 404)
  assertEquals(calls, ['nao-existe'])
})
