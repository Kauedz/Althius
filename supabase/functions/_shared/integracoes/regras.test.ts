// A regra da ferramenta somada à Permissão do Agente (ADR-0022, tabela da decisão). Os valores esperados vêm da tabela
// da ADR, não do código.
import { assertEquals } from 'jsr:@std/assert@1'
import { decidirChamada, regraVigente } from './regras.ts'

const LEITURA = { nome: 'buscar', escreve: false }
const ESCRITA = { nome: 'criar', escreve: true }

Deno.test('sem regra definida, a leitura roda sempre e a escrita pede Aprovação; a definida vale', () => {
  assertEquals(regraVigente({}, LEITURA), 'sempre')
  assertEquals(regraVigente({}, ESCRITA), 'aprovacao')
  assertEquals(regraVigente({ criar: 'sempre' }, ESCRITA), 'sempre')
  assertEquals(regraVigente({ buscar: 'bloqueada' }, LEITURA), 'bloqueada')
  // Uma regra que não é uma das três (dado estranho) conta como o padrão.
  assertEquals(regraVigente({ criar: 'talvez' as never }, ESCRITA), 'aprovacao')
})

Deno.test('a tabela da ADR-0022: Ler, Propor e Executar contra sempre, aprovação e bloqueada', () => {
  const casos: [string, boolean, string, string][] = [
    // permissão, escreve, regra, decisão
    ['ler', false, 'sempre', 'executa'],
    ['ler', true, 'sempre', 'negada'],
    ['ler', false, 'aprovacao', 'negada'],
    ['ler', true, 'aprovacao', 'negada'],
    ['propor', false, 'sempre', 'executa'],
    ['propor', true, 'sempre', 'pede_aprovacao'],
    ['propor', false, 'aprovacao', 'pede_aprovacao'],
    ['propor', true, 'aprovacao', 'pede_aprovacao'],
    ['executar', false, 'sempre', 'executa'],
    ['executar', true, 'sempre', 'executa'],
    ['executar', false, 'aprovacao', 'pede_aprovacao'],
    ['executar', true, 'aprovacao', 'pede_aprovacao'],
    ['ler', false, 'bloqueada', 'negada'],
    ['propor', true, 'bloqueada', 'negada'],
    ['executar', true, 'bloqueada', 'negada'],
  ]
  for (const [permissao, escreve, regra, esperada] of casos) {
    const decisao = decidirChamada({ permissao: permissao as never, escreve, regra: regra as never })
    assertEquals(decisao.tipo, esperada, `${permissao} ${escreve ? 'escrita' : 'leitura'} ${regra}`)
  }
})

Deno.test('o motivo da recusa: bloqueada vence a Permissão; sem Permissão nada roda; Ler não escreve nem propõe', () => {
  assertEquals(decidirChamada({ permissao: 'executar', escreve: false, regra: 'bloqueada' }), { tipo: 'negada', motivo: 'bloqueada' })
  assertEquals(decidirChamada({ permissao: null, escreve: false, regra: 'sempre' }), { tipo: 'negada', motivo: 'sem_permissao' })
  assertEquals(decidirChamada({ permissao: 'ler', escreve: true, regra: 'sempre' }), { tipo: 'negada', motivo: 'so_ler' })
  assertEquals(decidirChamada({ permissao: 'ler', escreve: false, regra: 'aprovacao' }), { tipo: 'negada', motivo: 'so_ler' })
})
