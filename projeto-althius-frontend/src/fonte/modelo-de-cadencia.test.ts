import { describe, expect, it } from 'vitest'
import { modeloDeCadencia, passosDoModelo } from './modelo-de-cadencia'

const CADENCIA = [
  { toque: 'Abertura', canal: 'E-mail', dia: 'Dia 1', objetivo: 'Conectar o Sinal' },
  { toque: 'Conexão', canal: 'LinkedIn', dia: 'Dia 3', objetivo: '' },
  { toque: 'Ligar', canal: 'Ligação', dia: 'Dia 4', objetivo: '' },
  { toque: 'Mensagem', canal: 'WhatsApp', dia: 'Dia 6', objetivo: 'Alinhar' },
  { toque: '', canal: 'E-mail', dia: 'Dia 7', objetivo: '' },
]
const TEMPLATES = [{ nome: 'abertura', canal: 'E-mail', assunto: 'Assunto A', corpo: 'Corpo A' }]

describe('modelo de Cadência do Playbook', () => {
  it('vira toques só nos canais suportados, lista os que ficam de fora e marca WhatsApp e LinkedIn como dependentes do canal', () => {
    const modelo = modeloDeCadencia(CADENCIA, TEMPLATES)
    expect(modelo.toques.map((t) => [t.titulo, t.canal, t.dia, t.dependeDoCanal])).toEqual([
      ['Abertura', 'email', 1, false],
      ['Conexão', 'linkedin', 3, true],
      ['Mensagem', 'whatsapp', 6, true],
    ])
    expect(modelo.foraDoEscopo).toEqual(['Ligar'])
  })

  it('o Template de mesmo nome dá o assunto e o corpo, sem olhar caixa nem acento', () => {
    const [abertura, conexao] = modeloDeCadencia(CADENCIA, TEMPLATES).toques
    expect([abertura.assunto, abertura.corpo]).toEqual(['Assunto A', 'Corpo A'])
    expect([conexao.assunto, conexao.corpo]).toEqual(['', ''])
  })

  it('o dia que falta ou volta para trás não faz o toque sair antes do anterior', () => {
    const modelo = modeloDeCadencia(
      [
        { toque: 'A', canal: 'E-mail', dia: 'Dia 5' },
        { toque: 'B', canal: 'E-mail', dia: 'Dia 2' },
        { toque: 'C', canal: 'E-mail', dia: '' },
      ],
      [],
    )
    expect(modelo.toques.map((t) => t.dia)).toEqual([5, 5, 5])
  })

  it('os passos nascem com o espaço entre toques, no primeiro Contato, e sem inventar o que o modelo não traz', () => {
    const passos = passosDoModelo(modeloDeCadencia(CADENCIA, TEMPLATES).toques, 'contato-1')
    expect(passos.map((p) => [p.ordem, p.canal, p.contatoId, p.delayDiasUteis])).toEqual([
      [1, 'email', 'contato-1', 0],
      [2, 'linkedin', 'contato-1', 2],
      [3, 'whatsapp', 'contato-1', 3],
    ])
    expect(passos[0]).toMatchObject({ assunto: 'Assunto A', corpo: 'Corpo A', objetivo: 'Conectar o Sinal', modoEmail: 'manual' })
    expect(passos[1]).toMatchObject({ subtipoLinkedIn: 'mensagem' })
    expect(passos[1]).not.toHaveProperty('corpo')
    expect(new Set(passos.map((p) => p.id)).size).toBe(3)
  })

  it('sem linhas na Cadência, não há modelo', () => {
    expect(modeloDeCadencia([], TEMPLATES)).toEqual({ toques: [], foraDoEscopo: [] })
  })
})
