import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDeFontePublica, lerJson } from './fonte-publica.ts'

const resposta = (status: number, corpo: unknown = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status })

Deno.test('lê o JSON; repete em 429 e 5xx esperando entre as tentativas', async () => {
  const esperas: number[] = []
  let n = 0
  const fetchFn = (() => Promise.resolve([resposta(429), resposta(503), resposta(200, { ok: true })][n++])) as typeof fetch
  assertEquals(await lerJson('https://api.test/x', { fetchFn, dormir: (ms) => (esperas.push(ms), Promise.resolve()), esperaMs: 10_000 }), { ok: true })
  assertEquals(esperas, [10_000, 10_000])
})

Deno.test('erro de quem pede (404) não é repetido; o erro leva só o status', async () => {
  let n = 0
  const fetchFn = (() => (n++, Promise.resolve(resposta(404, 'conteúdo com segredo')))) as typeof fetch
  const e = await assertRejects(() => lerJson('https://api.test/x', { fetchFn, dormir: () => Promise.resolve() }), ErroDeFontePublica) as ErroDeFontePublica
  assertEquals([n, e.status, e.message.includes('segredo')], [1, 404, false])
})

Deno.test('esgotadas as tentativas, falha com o último status; rede e corpo ilegível também', async () => {
  const sempre429 = (() => Promise.resolve(resposta(429))) as typeof fetch
  const e = await assertRejects(() => lerJson('https://api.test/x', { fetchFn: sempre429, dormir: () => Promise.resolve(), repeticoes: 1 }), ErroDeFontePublica) as ErroDeFontePublica
  assertEquals(e.status, 429)
  const rede = (() => Promise.reject(new TypeError('reset'))) as typeof fetch
  assertEquals(((await assertRejects(() => lerJson('https://api.test/x', { fetchFn: rede, dormir: () => Promise.resolve(), repeticoes: 0 }), ErroDeFontePublica)) as ErroDeFontePublica).status, null)
  const ilegivel = (() => Promise.resolve(resposta(200, '<html>'))) as typeof fetch
  await assertRejects(() => lerJson('https://api.test/x', { fetchFn: ilegivel, dormir: () => Promise.resolve(), repeticoes: 0 }), ErroDeFontePublica, 'ilegível')
})
