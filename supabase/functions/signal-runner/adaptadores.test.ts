import { assertEquals } from 'jsr:@std/assert@1'
import { ADAPTADORES } from './adaptadores.ts'

// Os 9 Sinais do lançamento e o Google (PR-7) (o registro de actors, sinais-reais 01) têm, cada um, o seu adaptador (tickets 03 a 06).
Deno.test('cada Sinal do registro de actors tem um adaptador, e cada adaptador é do Sinal da chave', () => {
  assertEquals(Object.keys(ADAPTADORES).sort(), [
    'anuncio_de_movimentacao', 'anuncio_google', 'anuncio_linkedin', 'anuncio_meta', 'avaliacoes_google_maps', 'entradas_e_saidas',
    'mudanca_de_emprego', 'nova_lideranca', 'vaga_indeed', 'vaga_linkedin',
  ])
  for (const [tipo, adaptador] of Object.entries(ADAPTADORES)) assertEquals(adaptador.signalType, tipo)
})
