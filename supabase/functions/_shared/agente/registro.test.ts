import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { cartaoDeConfirmacao, formatarCreditos, portao } from './registro.ts'

Deno.test('portão: livre roda sempre, mesmo acima do teto', () => {
  assertEquals(portao({ aprovacao: 'livre' }, 999, 999, 1), { estado: 'rodar' })
})

Deno.test('portão: teto roda enquanto cabe e pergunta quando passa', () => {
  assertEquals(portao({ aprovacao: 'teto' }, 5, 45, 50), { estado: 'rodar' })
  assertEquals(portao({ aprovacao: 'teto' }, 6, 45, 50), { estado: 'aguardar', motivo: 'teto' })
  assertEquals(portao({ aprovacao: 'teto' }, 0, 80, 50), { estado: 'rodar' })
})

Deno.test('portão: sempre pergunta, mesmo sem custo', () => {
  assertEquals(portao({ aprovacao: 'sempre' }, 0, 0, 50), { estado: 'aguardar', motivo: 'prospect' })
})

Deno.test('cartão de confirmação fala em créditos, nunca em dólar', () => {
  const c = cartaoDeConfirmacao({ titulo: 'Buscar 50 empresas', custo: 5, motivo: 'teto', gastos: 48, teto: 50 })
  assertEquals(c.tipo, 'confirmacao')
  assertStringIncludes(String(c.texto), '5 créditos')
  assertStringIncludes(String(c.texto), '48 créditos de 50 créditos')
  assertEquals(String(c.texto).includes('US$'), false)
  assertEquals(formatarCreditos(1), '1 crédito')
})

Deno.test('portão: sempre usa o motivo da ferramenta quando ela muda algo salvo (ICP)', () => {
  assertEquals(portao({ aprovacao: 'sempre', motivo: 'alteracao' }, 0, 0, 50), { estado: 'aguardar', motivo: 'alteracao' })
})

Deno.test('confirmação de alteração diz que vira uma versão nova, sem falar de prospect', () => {
  const c = cartaoDeConfirmacao({ titulo: 'Salvar o ICP', custo: 0, motivo: 'alteracao', gastos: 0, teto: 50 })
  assertEquals(c.motivo, 'alteracao')
  assert(String(c.texto).includes('nova versão'))
  assert(!String(c.texto).includes('prospect'))
})

Deno.test('uma ferramenta sempre pode explicar o que liga; o texto padrão fica para a mensagem a prospect', () => {
  const c = cartaoDeConfirmacao({ titulo: 'Ativar o Sinal', custo: 0, motivo: 'prospect', gastos: 0, teto: 50, explicacao: 'Liga o Sinal na Agenda dele.' })
  assertEquals(c.texto, 'Ativar o Sinal: Liga o Sinal na Agenda dele. Nada muda sem a sua confirmação.')
})
