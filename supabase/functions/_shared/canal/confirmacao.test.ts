import { assertEquals } from 'jsr:@std/assert@1'
import { confirmarTexto, resumoDaConfirmacao } from './confirmacao.ts'

Deno.test('confirmação reversível apresenta payload e cotação exatos', () => {
  assertEquals(resumoDaConfirmacao('Pausar Sequência Fintechs SP', 3), 'Pausar Sequência Fintechs SP\nCusto: 3 Créditos. Responda SIM para confirmar ou NAO para recusar.')
})

Deno.test('somente SIM e NAO reconhecidos como decisões', () => {
  assertEquals(confirmarTexto(' SIM '), 'aprovar')
  assertEquals(confirmarTexto('nao'), 'recusar')
  assertEquals(confirmarTexto('talvez'), null)
})
