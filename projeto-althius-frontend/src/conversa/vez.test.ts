import { describe, expect, it } from 'vitest'
import type { Agente } from '@/fonte/tipos'
import type { ItemDaConversa } from './contexto'
import { quemEstaRespondendo } from './vez'

const agente = (id: string, nome: string) => ({ id, nome }) as unknown as Agente
const SCOPUS = agente('a-scopus', 'Scopus')
const RHETOR = agente('a-rhetor', 'Rhetor')
const ETHOS = agente('a-ethos', 'Ethos')
const AGENTES = [SCOPUS, RHETOR, ETHOS]

describe('quem está respondendo na Conversa com um Agente', () => {
  it('o anfitrião, antes de qualquer fala', () => {
    const itens: ItemDaConversa[] = [{ id: 1, tipo: 'usuario', texto: 'Oi @Rhetor' }]
    expect(quemEstaRespondendo(itens, SCOPUS, AGENTES).nome).toBe('Scopus')
  })

  it('o mencionado no pedido, depois que o anfitrião falou', () => {
    const itens: ItemDaConversa[] = [
      { id: 1, tipo: 'usuario', texto: 'Oi @Rhetor' },
      { id: 2, tipo: 'texto', agenteId: 'a-scopus', texto: 'Minha parte.' },
    ] as ItemDaConversa[]
    expect(quemEstaRespondendo(itens, SCOPUS, AGENTES).nome).toBe('Rhetor')
  })

  it('o Agente que outro chamou com @ na fala', () => {
    const itens: ItemDaConversa[] = [
      { id: 1, tipo: 'usuario', texto: 'Uma abordagem para a Alfa' },
      { id: 2, tipo: 'texto', agenteId: 'a-scopus', texto: 'Aderente. @Ethos, confira o ICP.' },
    ] as ItemDaConversa[]
    expect(quemEstaRespondendo(itens, SCOPUS, AGENTES).nome).toBe('Ethos')
  })

  it('só olha o último pedido', () => {
    const itens: ItemDaConversa[] = [
      { id: 1, tipo: 'usuario', texto: '@Rhetor antes' },
      { id: 2, tipo: 'texto', agenteId: 'a-scopus', texto: 'Ok.' },
      { id: 3, tipo: 'usuario', texto: 'Agora outra coisa' },
    ] as ItemDaConversa[]
    expect(quemEstaRespondendo(itens, SCOPUS, AGENTES).nome).toBe('Scopus')
  })
})
