import { describe, expect, it } from 'vitest'
import {
  mensagemAutorizadaMudou,
  previaDoPasso,
  type ContextoComEvidencia,
} from './variaveis-com-evidencia'

const WS = 'ws-1'
const CONTA = 'conta-1'

function contexto(extra: Partial<ContextoComEvidencia> = {}): ContextoComEvidencia {
  return {
    workspaceId: WS,
    contaId: CONTA,
    conta: { nome: 'Empresa Alvo', segmento: 'Varejo', dominio: 'empresa-alvo.test' },
    contato: { nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@empresa-alvo.test' },
    remetente: { nome: 'Renan' },
    sinais: [{
      workspaceId: WS,
      contaId: CONTA,
      frase: 'Abriu vaga de dados',
      fonte: 'LinkedIn',
      evidencia: 'linkedin.com/jobs/1',
      valido: true,
    }],
    referenciaContatoId: 'joao',
    referencia: { id: 'joao', nome: 'João Lima', workspaceId: WS, contaId: CONTA },
    envios: [],
    respostas: [],
    indicacoes: [],
    ...extra,
  }
}

describe('prévia com evidência', () => {
  it('resolve Conta, Contato e Sinal reais desta Conta', () => {
    const previa = previaDoPasso(
      'Oi {{primeiro_nome}}',
      '{{sinal.frase}} na {{empresa}} ({{sinal.fonte}})',
      contexto(),
    )
    expect(previa.assunto).toBe('Oi Maria')
    expect(previa.corpo).toBe('Abriu vaga de dados na Empresa Alvo (LinkedIn)')
    expect(previa.bloqueado).toBe(false)
    expect(previa.faltando).toEqual([])
  })

  it('não esvazia variável ausente: o passo fica bloqueado com o motivo', () => {
    const previa = previaDoPasso('Oi', 'Como {{cargo}} na {{empresa}}', contexto({
      contato: { nome: 'Pedro' },
    }))
    expect(previa.corpo).toBe('Como {{cargo}} na Empresa Alvo')
    expect(previa.bloqueado).toBe(true)
    expect(previa.faltando).toEqual(['cargo'])
    expect(previa.motivo).toBe(
      'Falta evidência para {{cargo}}. O passo não sai com variável vazia.',
    )
  })

  it('ignora Sinal de outra Conta ou outro Workspace', () => {
    const previa = previaDoPasso('{{sinal.frase}}', '{{sinal.evidencia}}', contexto({
      sinais: [
        {
          workspaceId: 'ws-outro',
          contaId: CONTA,
          frase: 'Sinal alheio',
          evidencia: 'nao-deve-entrar',
          valido: true,
        },
        {
          workspaceId: WS,
          contaId: 'conta-outra',
          frase: 'Outra conta',
          evidencia: 'tambem-nao',
          valido: true,
        },
        {
          workspaceId: WS,
          contaId: CONTA,
          frase: 'Sinal vencido',
          evidencia: 'velho',
          valido: false,
        },
      ],
    }))
    expect(previa.assunto).toBe('{{sinal.frase}}')
    expect(previa.corpo).toBe('{{sinal.evidencia}}')
    expect(previa.faltando).toEqual(['sinal.frase', 'sinal.evidencia'])
    expect(previa.motivo).toContain('outra Conta')
  })

  it('envio confirmado não vira resposta nem indicação', () => {
    const comEnvio = contexto({
      envios: [{ contatoId: 'joao', workspaceId: WS, contaId: CONTA, status: 'sent' }],
    })
    expect(previaDoPasso('', '{{referencia.envio}}', comEnvio).corpo).toBe('João Lima')
    const resposta = previaDoPasso('', '{{referencia.resposta}}', comEnvio)
    expect(resposta.corpo).toBe('{{referencia.resposta}}')
    expect(resposta.motivo).toBe('O envio a João Lima não é resposta nem indicação.')
    const indicacao = previaDoPasso('', '{{referencia.indicacao}}', comEnvio)
    expect(indicacao.corpo).toBe('{{referencia.indicacao}}')
    expect(indicacao.motivo).toBe('O nome de João Lima não é indicação comprovada.')
  })

  it('tentativa agendada não conta como envio', () => {
    const previa = previaDoPasso('', '{{referencia.envio}}', contexto({
      envios: [{ contatoId: 'joao', workspaceId: WS, contaId: CONTA, status: 'scheduled' }],
    }))
    expect(previa.bloqueado).toBe(true)
    expect(previa.motivo).toBe('Não há envio confirmado a João Lima. Tentativa agendada não conta.')
  })

  it('resposta e indicação comprovada resolvem; o nome sozinho não', () => {
    const soNome = previaDoPasso('', '{{referencia.indicacao}}', contexto({
      indicacoes: [{ contatoId: 'joao', workspaceId: WS, contaId: CONTA, evidencia: 'João Lima' }],
    }))
    expect(soNome.bloqueado).toBe(true)
    expect(soNome.motivo).toBe('O nome de João Lima não é indicação comprovada.')

    const comprovada = previaDoPasso('', '{{referencia.indicacao}} {{referencia.resposta}}', contexto({
      respostas: [{ contatoId: 'joao', workspaceId: WS, contaId: CONTA }],
      indicacoes: [{
        contatoId: 'joao',
        workspaceId: WS,
        contaId: CONTA,
        evidencia: 'João pediu para falar com a Maria em 12/09.',
      }],
    }))
    expect(comprovada.corpo).toBe('João Lima João Lima')
    expect(comprovada.bloqueado).toBe(false)
  })

  it('mudança posterior não é a mensagem autorizada', () => {
    const autorizada = previaDoPasso('Oi {{primeiro_nome}}', 'na {{empresa}}', contexto())
    const depois = previaDoPasso('Oi {{primeiro_nome}}', 'na {{empresa}}', contexto({
      contato: { nome: 'Ana Souza', cargo: 'Diretora', email: 'maria@empresa-alvo.test' },
    }))
    expect(autorizada.assunto).toBe('Oi Maria')
    expect(depois.assunto).toBe('Oi Ana')
    expect(mensagemAutorizadaMudou(
      { assunto: autorizada.assunto, corpo: autorizada.corpo },
      { assunto: depois.assunto, corpo: depois.corpo },
    )).toBe(true)
    expect(mensagemAutorizadaMudou(
      { assunto: autorizada.assunto, corpo: autorizada.corpo },
      { assunto: autorizada.assunto, corpo: autorizada.corpo },
    )).toBe(false)
  })
})
