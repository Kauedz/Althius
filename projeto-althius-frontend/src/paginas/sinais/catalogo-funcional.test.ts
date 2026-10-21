import { describe, expect, it } from 'vitest'
import { cardsParaOCliente, disponibilidadeDoCard, ehFuncional, temMonitoramento } from './catalogo-funcional'
import { CATALOGO_VISIVEL, cardPorId } from './catalogo-visivel'
import { ESTADOS_DE_20_10, FUNCIONAIS_EM_20_10 } from '@/test/estados-dos-coletores'

const card = (id: string) => cardPorId(id)!

describe('A regra de Sinal funcional', () => {
  it('um card é funcional quando um dos coletores está disponível', () => {
    const vagas = card('abertura-de-vagas')
    expect(ehFuncional(vagas, new Map([['vaga_indeed', 'available']]))).toBe(true)
    expect(ehFuncional(vagas, new Map([['vaga_linkedin', 'testing'], ['vaga_indeed', 'out']]))).toBe(false)
    expect(ehFuncional(vagas, new Map())).toBe(false)
  })

  it('um card sem coletor nunca é funcional', () => {
    const tudoDisponivel = new Map(CATALOGO_VISIVEL.flatMap((c) => c.coletores.map((coletor) => [coletor, 'available'] as const)))
    expect(ehFuncional(card('anuncios-google'), tudoDisponivel)).toBe(false)
    expect(ehFuncional(card('publicacoes-da-empresa'), tudoDisponivel)).toBe(false)
  })

  it('a disponibilidade é o melhor estado entre os coletores', () => {
    const filial = card('nova-filial-ou-sede')
    expect(disponibilidadeDoCard(filial, new Map([['troca_de_sede', 'testing'], ['nova_planta_filial', 'out']]))).toBe('em-teste')
    expect(disponibilidadeDoCard(filial, new Map([['troca_de_sede', 'testing'], ['expansao_de_planta', 'available']]))).toBe('disponivel')
    expect(disponibilidadeDoCard(filial, new Map([['troca_de_sede', 'out']]))).toBe('em-breve')
    expect(disponibilidadeDoCard(card('anuncios-google'), new Map())).toBe('em-breve')
  })

  it('pela leitura de produção de 20/10, o cliente vê 15 cards e não vê 11', () => {
    const visiveis = cardsParaOCliente({ cards: CATALOGO_VISIVEL, estados: ESTADOS_DE_20_10, monitoramentos: [] })
    expect(visiveis.map((c) => c.id)).toEqual(FUNCIONAIS_EM_20_10)
    expect(CATALOGO_VISIVEL.length - visiveis.length).toBe(11)
  })

  it('a lista não é fixa: o coletor promovido para available faz o card aparecer', () => {
    const promovido = new Map([...ESTADOS_DE_20_10, ['entrada_de_socio', 'available']])
    const visiveis = cardsParaOCliente({ cards: CATALOGO_VISIVEL, estados: promovido, monitoramentos: [] })
    expect(visiveis.map((c) => c.id)).toContain('entrada-de-socio')
    expect(visiveis).toHaveLength(16)
  })

  it('o card que o Workspace já monitora continua, mesmo fora do ar', () => {
    const socio = card('entrada-de-socio')
    expect(temMonitoramento(socio, [{ tipoId: 'entrada-de-socio' }])).toBe(true)
    expect(temMonitoramento(card('abertura-de-vagas'), [{ tipoId: 'vagas-no-indeed' }])).toBe(true)
    expect(temMonitoramento(socio, [{ tipoId: 'nova-lideranca' }])).toBe(false)
    const visiveis = cardsParaOCliente({
      cards: CATALOGO_VISIVEL,
      estados: ESTADOS_DE_20_10,
      monitoramentos: [{ tipoId: 'entrada-de-socio' }],
    })
    expect(visiveis.map((c) => c.id)).toContain('entrada-de-socio')
    expect(visiveis).toHaveLength(16)
  })

  it('sem estado nenhum, o cliente não vê card algum', () => {
    expect(cardsParaOCliente({ cards: CATALOGO_VISIVEL, estados: new Map(), monitoramentos: [] })).toEqual([])
  })
})
