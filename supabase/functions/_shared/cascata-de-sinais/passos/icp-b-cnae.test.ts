// A tabela interna de CNAEs do ICP B (setor mais afetado pela CBS/IBS): forma, unicidade, máscara, busca e rodízio.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { MARCA_INTERNA } from '../../marca.ts'
import { CRITERIO_DA_TABELA, mascaraCnae, SETORES_AFETADOS, setorDoCnae, setorDoMes } from './icp-b-cnae.ts'

Deno.test('a tabela é um critério interno revisável: subclasses de 7 dígitos, sem repetir, com motivo e sem marca', () => {
  assertEquals(CRITERIO_DA_TABELA, 'interno-revisavel')
  assert(SETORES_AFETADOS.length >= 10)
  const codigos = SETORES_AFETADOS.map((s) => s.cnae)
  assertEquals(new Set(codigos).size, codigos.length, 'um CNAE aparece uma vez só')
  for (const s of SETORES_AFETADOS) {
    assert(/^\d{7}$/.test(s.cnae), `CNAE de 7 dígitos: ${s.cnae}`)
    assert(['alto', 'medio'].includes(s.impacto))
    assert(s.motivo.startsWith('Hipótese de trabalho'), 'o motivo avisa que não é regra oficial')
    assert(s.descricao.length > 3 && s.grupo.length > 2)
    assert(!MARCA_INTERNA.test(JSON.stringify(s)))
  }
})

Deno.test('mascaraCnae e setorDoCnae aceitam o código com ou sem máscara', () => {
  assertEquals(mascaraCnae('6920601'), '6920-6/01')
  assertEquals(mascaraCnae('6920-6/01'), '6920-6/01')
  assertEquals(mascaraCnae('69'), '69')
  assertEquals(setorDoCnae('6920-6/01')?.cnae, '6920601')
  assertEquals(setorDoCnae('6920601')?.descricao.toLowerCase().includes('contabilidade'), true)
  assertEquals(setorDoCnae('0000000'), undefined)
  assertEquals(setorDoCnae(undefined), undefined)
})

Deno.test('setorDoMes gira pela tabela, um setor por mês, sempre o mesmo para o mesmo mês', () => {
  const n = SETORES_AFETADOS.length
  assertEquals(setorDoMes(2026, 10).cnae, setorDoMes(2026, 10).cnae)
  const sequencia = Array.from({ length: n }, (_, i) => setorDoMes(2026, 1 + i).cnae)
  assertEquals(new Set(sequencia).size, n, 'n meses seguidos passam por todos os setores, uma vez cada')
  // Depois de n meses, volta ao começo.
  assertEquals(setorDoMes(2026, 1 + n).cnae, setorDoMes(2026, 1).cnae)
})
