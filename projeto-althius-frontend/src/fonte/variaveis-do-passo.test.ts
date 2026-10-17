import { describe, expect, it } from 'vitest'
import { valorDaVariavel, variaveisSemValor } from './variaveis-do-passo'

const dados = {
  conta: { nome: 'Empresa Alvo', segmento: 'Varejo', dominio: 'empresa-alvo.test' },
  contato: { nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@empresa-alvo.test' },
  remetente: { nome: 'Renan' },
}

describe('variáveis do passo', () => {
  it('resolve os apelidos curtos e os nomes com grupo, como o envio', () => {
    expect(valorDaVariavel('primeiro_nome', dados)).toBe('Maria')
    expect(valorDaVariavel('contato.primeiro_nome', dados)).toBe('Maria')
    expect(valorDaVariavel('nome', dados)).toBe('Maria Souza')
    expect(valorDaVariavel('sobrenome', dados)).toBe('Souza')
    expect(valorDaVariavel('empresa', dados)).toBe('Empresa Alvo')
    expect(valorDaVariavel('cargo', dados)).toBe('Diretora')
    expect(valorDaVariavel('dominio', dados)).toBe('empresa-alvo.test')
  })

  it('lista o que ficaria sem valor, que segura o passo no envio', () => {
    expect(variaveisSemValor('Oi {{primeiro_nome}}, {{cargo}} na {{empresa}} {{persona}}', {
      ...dados,
      contato: { nome: 'Pedro' },
    })).toEqual(['cargo', 'persona'])
    expect(variaveisSemValor('Oi {{ primeiro_nome }}', dados)).toEqual([])
  })

  it('Sinal e Persona não são variáveis do envio: ficam como faltando, como no banco', () => {
    expect(valorDaVariavel('conta.sinal', dados)).toBeNull()
    expect(valorDaVariavel('persona', dados)).toBeNull()
    expect(variaveisSemValor('{{conta.sinal}} para {{persona}} na {{empresa}}', dados)).toEqual(['conta.sinal', 'persona'])
  })
})
