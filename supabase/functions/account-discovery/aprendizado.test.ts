import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1'
import { ajusteEfetivo, encaixeAjustado } from './pontuacao.ts'

Deno.test('ajuste aprendido: mínimo de 3 decisões, teto de ±15 e meia-vida de 60 dias', () => {
  assertEquals(ajusteEfetivo(-5, 2, 0), 0)
  assertEquals(ajusteEfetivo(-7.5, 3, 0), -7.5)
  assertEquals(ajusteEfetivo(-40, 16, 0), -15)
  assertEquals(ajusteEfetivo(20, 8, 0), 15)
  assertAlmostEquals(ajusteEfetivo(-10, 4, 60), -5)
  assertAlmostEquals(ajusteEfetivo(-10, 4, 120), -2.5)
})

Deno.test('encaixe ajustado: nunca abaixo da metade do Encaixe nem acima de 100', () => {
  assertEquals(encaixeAjustado(60, [-15, -15, -15]), 30)
  assertEquals(encaixeAjustado(60, [-7.5]), 52.5)
  assertEquals(encaixeAjustado(95, [15]), 100)
  assertEquals(encaixeAjustado(0, [-15]), 0)
})
