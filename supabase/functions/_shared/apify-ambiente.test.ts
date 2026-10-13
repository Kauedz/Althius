import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { contasDeColeta, tokensDoApify } from './apify-ambiente.ts'

Deno.test('contas de coleta: APIFY_TOKEN_1 a 5, legado no índice 0, vazio é pulado', () => {
  const ler = (nome: string) => ({ APIFY_TOKEN: 'legado', APIFY_TOKEN_1: '', APIFY_TOKEN_2: 'dois', APIFY_TOKEN_5: 'cinco' })[nome]
  assertEquals(contasDeColeta(ler), [
    { slot: 2, token: 'dois' },
    { slot: 5, token: 'cinco' },
    { slot: 0, token: 'legado' },
  ])
  assertEquals(tokensDoApify(ler), ['dois', 'cinco', 'legado'])
})

Deno.test('sem nenhuma conta de coleta a função não sobe', () => {
  assertThrows(() => contasDeColeta(() => undefined), Error, 'Backend is not configured')
  assertThrows(() => tokensDoApify(() => '   '), Error, 'Backend is not configured')
})
