import { assertEquals } from 'jsr:@std/assert@1'
import { ADAPTADORES } from './adaptadores.ts'

// Os 9 Sinais do lançamento, o Google (PR-7) e Equipes e Publicações (PR-8) (o registro de actors, sinais-reais 01) têm, cada um, o seu adaptador (tickets 03 a 06).
Deno.test('cada Sinal do registro de actors tem um adaptador, e cada adaptador é do Sinal da chave', () => {
  assertEquals(Object.keys(ADAPTADORES).sort(), [
    'anuncio_de_movimentacao', 'anuncio_google', 'anuncio_linkedin', 'anuncio_meta', 'avaliacoes_google_maps', 'crescimento_de_equipes', 'entradas_e_saidas',
    'mudanca_de_emprego', 'nova_lideranca', 'publicacao_da_empresa', 'vaga_indeed', 'vaga_linkedin',
  ])
  for (const [tipo, adaptador] of Object.entries(ADAPTADORES)) assertEquals(adaptador.signalType, tipo)
})
