import { describe, expect, it } from 'vitest'
import {
  classificarContasDoLote,
  rotuloDoDesfechoDoLote,
  rotuloDoMotivoForaDoLote,
} from './previsao-do-lote-de-sequencias'

describe('prévia da criação em lote de Sequências', () => {
  it('separa as Contas que nascem Sequência das que ficam de fora, com o motivo em português', () => {
    const previsao = classificarContasDoLote({
      contas: [
        { id: 'alfa', nome: 'Alfa' },
        { id: 'beta', nome: 'Beta' },
        { id: 'gama', nome: 'Gama' },
        { id: 'delta', nome: 'Delta' },
        { id: 'epsilon', nome: 'Épsilon', sobMinhaResponsabilidade: false },
      ],
      contatos: [
        { id: 'c-alfa', contaId: 'alfa', email: 'ana@alfa.test' },
        { id: 'c-beta', contaId: 'beta' },
        { id: 'c-gama', contaId: 'gama', email: 'gina@gama.test' },
        { id: 'c-delta', contaId: 'delta', email: 'dani@saiu.test' },
      ],
      sequencias: [{ contaId: 'gama', status: 'ativa', participantesIds: ['c-gama'] }],
      supressoes: [{ kind: 'email', value: 'dani@saiu.test' }],
    })

    expect(previsao.criar.map((c) => c.nome)).toEqual(['Alfa'])
    expect(previsao.fora.map((c) => ({ nome: c.nome, motivo: rotuloDoMotivoForaDoLote(c.motivo) }))).toEqual([
      { nome: 'Beta', motivo: 'Sem e-mail' },
      { nome: 'Gama', motivo: 'Já em Sequência ativa' },
      { nome: 'Delta', motivo: 'Suprimida' },
      { nome: 'Épsilon', motivo: 'Outro Vendedor responsável' },
    ])
  })

  it('traduz o desfecho da RPC para o português da tela', () => {
    expect(rotuloDoDesfechoDoLote('created')).toBe('Sequência criada')
    expect(rotuloDoDesfechoDoLote('sequence_in_progress')).toBe('Já tem Sequência em andamento')
    expect(rotuloDoDesfechoDoLote('not_responsible')).toBe('Outro Vendedor responsável')
    expect(rotuloDoDesfechoDoLote('no_eligible_contact')).toBe('Sem Contato elegível')
    expect(rotuloDoDesfechoDoLote('not_found')).toBe('Conta-alvo não encontrada')
  })
})
