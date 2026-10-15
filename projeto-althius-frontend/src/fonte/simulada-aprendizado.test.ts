import { describe, expect, it } from 'vitest'
import { criarFonteDeDescobertasSimulada } from './simulada-descobertas'

describe('Aprendizado da Descoberta na Demonstração', () => {
  it('só conta a partir de 3 descartes com o mesmo motivo, e o reset apaga o ajuste', async () => {
    const fonte = criarFonteDeDescobertasSimulada({} as Parameters<typeof criarFonteDeDescobertasSimulada>[0])
    const [c] = (await fonte.listarDescobertas('nova')).filter((x) => x.uf)
    for (let i = 0; i < 2; i++) {
      await fonte.descartarDescoberta(c.id, undefined, 'regiao')
      await fonte.restaurarDescoberta(c.id)
    }
    expect(await fonte.aprendizado!()).toEqual([])
    await fonte.descartarDescoberta(c.id, undefined, 'regiao')
    const [ajuste] = await fonte.aprendizado!()
    expect(ajuste).toMatchObject({ dimensao: 'regiao', valor: c.uf!.toLowerCase(), ajuste: -7.5, decisoes: 3 })
    await fonte.desfazerAprendizado!(ajuste)
    expect(await fonte.aprendizado!()).toEqual([])
  })
})
