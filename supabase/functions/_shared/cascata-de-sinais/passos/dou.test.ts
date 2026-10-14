// A amostra real do monitor do Diário Oficial (13/10/2026, termo "licença de instalação", seção 1): a data vem
// dd/mm/aaaa. O teste lê o arquivo da execução, não um item inventado.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import amostra from '../__fixtures__/dou_brasildados.json' with { type: 'json' }
import { dentroDoPeriodo } from './comum.ts'
import { dataDoDou } from './data-dou.ts'
import { licencasDou } from './icp-e-licencas.ts'

const AGORA = Date.parse('2026-10-13T18:00:00.000Z')
const ITENS = amostra.items

const ctx = {
  agora: AGORA,
  criterios: {},
  def: { inputTemplate: { termo: 'licença de instalação', janelaDias: 3 } },
} as never

Deno.test('a amostra real do DOU traz data dd/mm/aaaa e cada uma vira 13/10/2026 ao meio-dia UTC', () => {
  assert(ITENS.length >= 1)
  assertEquals(amostra.input, { q: ['licença de instalação'], s: 'DO1' })
  for (const item of ITENS) {
    assertEquals(item.data, '13/10/2026')
    assertEquals(dataDoDou(item.data), '2026-10-13T12:00:00.000Z')
    assertEquals(dentroDoPeriodo(dataDoDou(item.data)!, AGORA, 3), true)
  }
})

Deno.test('data do DOU: dd/mm/aaaa primeiro; ISO é a reserva; data impossível não passa', () => {
  assertEquals(dataDoDou('09/10/2026'), '2026-10-09T12:00:00.000Z')
  assertEquals(dataDoDou('9/10/2026'), '2026-10-09T12:00:00.000Z')
  assertEquals(dataDoDou('2026-10-09'), '2026-10-09T12:00:00.000Z')
  assertEquals(dataDoDou('2026-10-09T15:30:00.000Z'), '2026-10-09T15:30:00.000Z')
  assertEquals(dataDoDou('31/02/2026'), null)
  assertEquals(dataDoDou('13/13/2026'), null)
  assertEquals(dataDoDou(''), null)
  // "13/10/2026" não é mês 13: o formato americano rejeitaria, e aqui a data existe.
  assertEquals(dataDoDou('13/10/2026'), '2026-10-13T12:00:00.000Z')
})

Deno.test('a amostra real cabe na janela de 3 dias; sem a frase exata não vira publicação, e com a frase vira', async () => {
  const cru = await licencasDou.normalizar!(ITENS, [], ctx, 'brasildados~dou-monitor')
  assertEquals(cru, [])
  const comFrase = {
    ...ITENS[0],
    resumo: 'O IBAMA concede licença de instalação 90/2026 à indústria de cimento.',
  }
  const um = await licencasDou.normalizar!([comFrase], [], ctx, 'brasildados~dou-monitor')
  assertEquals(um.length, 1)
  assertEquals(um[0].quando, '2026-10-13T12:00:00.000Z')
  assertEquals(um[0].url, ITENS[0].url)
})
