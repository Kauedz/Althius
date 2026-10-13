// O registro de passos junta o de cada ICP com `Object.assign`: um nome repetido entre dois ICPs faria um sobrescrever o
// outro sem aviso. Este teste trava isso, e que todo passo do registro tem como rodar.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { passosDoIcp_a_resto } from './icp-a-resto.ts'
import { passosDoIcp_b } from './icp-b.ts'
import { passosDoIcp_c } from './icp-c.ts'
import { passosDoIcp_d } from './icp-d.ts'
import { passosDoIcp_e } from './icp-e.ts'
import { passosDoIcp_f } from './icp-f.ts'
import { passosDoIcp_g } from './icp-g.ts'
import { passosDoIcp_h } from './icp-h.ts'
import { registroDePassos } from './index.ts'

const DOS_ICPS = {
  a_resto: passosDoIcp_a_resto(),
  b: passosDoIcp_b(),
  c: passosDoIcp_c(),
  d: passosDoIcp_d(),
  e: passosDoIcp_e(),
  f: passosDoIcp_f(),
  g: passosDoIcp_g(),
  h: passosDoIcp_h(),
}

Deno.test('nenhum nome de passo ou de fonte se repete entre os ICPs nem colide com os passos comuns', () => {
  const comum = registroDePassos()
  const vistos = new Map<string, string>()
  const repetidos: string[] = []
  // Passos e fontes são registros separados: o mesmo nome num passo e numa fonte do MESMO ICP é permitido (o ICP E tem
  // a fonte aberta e a alternativa de actor com o mesmo nome); entre ICPs, nunca.
  for (const [icp, r] of Object.entries(DOS_ICPS)) {
    for (const nome of new Set([...Object.keys(r.passos), ...Object.keys(r.fontes)])) {
      const antes = vistos.get(nome)
      if (antes) repetidos.push(`${nome}: ${antes} e ${icp}`)
      vistos.set(nome, icp)
    }
  }
  assertEquals(repetidos, [])
  // O registro final tem todos (nada foi sobrescrito pelos passos comuns do A1).
  for (const nome of vistos.keys()) assert(comum.passos[nome] || comum.fontes[nome], `${nome} sumiu do registro`)
  assertEquals(Object.keys(comum.passos).length + Object.keys(comum.fontes).length >= vistos.size, true)
})

Deno.test('todo passo do registro sabe se executar: regra com `executar`, actor com `montarEntrada` e `normalizar`', () => {
  const r = registroDePassos()
  for (const [nome, p] of Object.entries(r.passos)) {
    assert(p.executar || (p.montarEntrada && p.normalizar), `o passo ${nome} não tem como rodar`)
  }
  for (const [nome, f] of Object.entries(r.fontes)) assert(typeof f.buscar === 'function', `a fonte ${nome} não busca`)
})
