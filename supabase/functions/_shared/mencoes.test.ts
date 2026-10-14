import { assertEquals } from 'jsr:@std/assert@1'
import { reconhecerMencoes } from './mencoes.ts'

const A = [{ name: 'Scopus' }, { name: 'Scopus · Enterprise LATAM' }, { name: 'Rhetor' }]

Deno.test('a mesma regra do app: ordem, sem repetir, nome mais longo vence, sem pegar prefixo de palavra', () => {
  assertEquals(reconhecerMencoes('@rhetor e @Scopus  ·  enterprise latam, depois @Rhetor', A).map((a) => a.name),
    ['Rhetor', 'Scopus · Enterprise LATAM'])
  assertEquals(reconhecerMencoes('@Scopusinho e @Scopus.', A).map((a) => a.name), ['Scopus'])
  assertEquals(reconhecerMencoes('sem menção', A), [])
})
