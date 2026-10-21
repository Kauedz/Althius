import { describe, expect, it } from 'vitest'
import { copiarTemplate } from './templates-althius'
import {
  previaParametrizada,
  sugerirTemplateProprio,
  templateProntoParaSalvar,
} from './templates-proprios'

const MARIA = '11111111-1111-4111-8111-111111111111'
const PASSO = '22222222-2222-4222-8222-222222222222'

describe('prévia parametrizada de template próprio', () => {
  it('tira IDs, destino, histórico e autorização e troca dados reais por variáveis', () => {
    const previa = previaParametrizada({
      nome: 'Abertura da Maria Souza',
      resumo: 'Estrutura sem o e-mail maria.souza@alfa.com.',
      literais: [{ nome: 'Maria Souza', email: 'maria.souza@alfa.com', empresa: 'Alfa', cargo: 'Diretora' }],
      passos: [
        {
          id: PASSO,
          ordem: 1,
          canal: 'email',
          contatoId: MARIA,
          destino: 2,
          delayDiasUteis: 0,
          titulo: 'Abertura',
          assunto: 'Oi Maria Souza, da Alfa',
          corpo: 'Escreva para maria.souza@alfa.com ou 11 98888-7777. Cargo: Diretora. ref ' + MARIA,
          objetivo: 'Abrir',
          metricas: { aberturas: 3 },
          anexos: [{ nome: 'proposta.pdf' }],
          historico: [{ quando: 'ontem' }],
          autorizacao: { em: '2026-10-21' },
          respostas: ['pode falar'],
          evidencias: ['indicou a Maria'],
          liberacao: 'ativacao',
        },
      ],
    })

    expect(previa.nome).toBe('Abertura da {{nome}}')
    expect(previa.resumo).toBe('Estrutura sem o e-mail {{email}}.')
    expect(previa.passos).toEqual([
      {
        id: 'passo-1',
        ordem: 1,
        canal: 'email',
        delayDiasUteis: 0,
        titulo: 'Abertura',
        assunto: 'Oi {{nome}}, da {{empresa}}',
        corpo: 'Escreva para {{email}} ou . Cargo: {{cargo}}. ref',
        objetivo: 'Abrir',
        liberacao: 'ativacao',
      },
    ])
    expect(JSON.stringify(previa)).not.toContain(MARIA)
    expect(JSON.stringify(previa)).not.toContain('maria.souza@alfa.com')
    expect(JSON.stringify(previa)).not.toContain('98888')
    expect(JSON.stringify(previa)).not.toContain('contatoId')
    expect(JSON.stringify(previa)).not.toContain('autorizacao')
  })

  it('não deixa salvar o texto cru: só a prévia já parametrizada', () => {
    const cru = {
      nome: 'Meu',
      resumo: 'Com maria@alfa.com',
      passos: [{ id: 'p1', ordem: 1, canal: 'email', titulo: 'Oi', corpo: 'maria@alfa.com', contatoId: MARIA }],
    }
    expect(templateProntoParaSalvar(cru)).toBe(false)
    const previa = previaParametrizada(cru)
    expect(templateProntoParaSalvar(previa)).toBe(true)
    expect(previa.passos[0]).not.toHaveProperty('contatoId')
    expect(previa.passos[0].corpo).toBe('{{email}}')
  })

  it('preserva liberação e predecessor, sem levar o id real', () => {
    const previa = previaParametrizada({
      nome: 'Com espera',
      resumo: 'Dois passos.',
      passos: [
        { id: 't-a', ordem: 1, canal: 'email', titulo: 'Primeiro', liberacao: 'ativacao', contatoId: MARIA },
        {
          id: PASSO,
          ordem: 2,
          canal: 'email',
          titulo: 'Depois',
          liberacao: 'predecessor',
          predecessorId: 't-a',
          destino: 1,
        },
      ],
    })

    expect(previa.passos[0].id).toBe('t-a')
    expect(previa.passos[0].liberacao).toBe('ativacao')
    expect(previa.passos[1].id).toBe('passo-2')
    expect(previa.passos[1].liberacao).toBe('predecessor')
    expect(previa.passos[1].predecessorId).toBe('t-a')
    expect(previa.passos[1]).not.toHaveProperty('destino')
  })
})

describe('cópia de template próprio', () => {
  it('criar a cópia e acrescentar um passo não altera o template', () => {
    const template = {
      id: 'meu',
      ...previaParametrizada({
      nome: 'Minha abertura',
      resumo: 'Dois e-mails.',
      passos: [
        { id: 'meu-1', ordem: 1, canal: 'email', titulo: 'Abertura', assunto: 'Oi {{primeiro_nome}}' },
        {
          id: 'meu-2',
          ordem: 2,
          canal: 'email',
          titulo: 'Retomada',
          liberacao: 'predecessor',
          predecessorId: 'meu-1',
        },
      ],
    }),
    }
    const original = structuredClone(template)
    const copia = copiarTemplate(template, 'contato-figma-1')
    copia.push({
      ...copia[0],
      id: 'passo-extra',
      ordem: 3,
      titulo: 'Passo só da cópia',
    })
    copia[0].titulo = 'Título só da cópia'
    copia[0].corpo = 'Corpo só da cópia'

    expect(template).toEqual(original)
    expect(copia[0].contatoId).toBe('contato-figma-1')
    expect(copia[1].predecessorId).toBe(copia[0].id)
    expect(template.passos).toHaveLength(2)
    expect(template.passos.some((passo) => 'contatoId' in passo)).toBe(false)
  })
})

describe('sugestão de template próprio', () => {
  const meu = previaParametrizada({
    nome: 'Minha abertura',
    resumo: 'Estrutura minha.',
    passos: [{ id: 'meu-1', ordem: 1, canal: 'email', titulo: 'Abertura' }],
  })

  it('só devolve template que o leitor pode ler, e não o da Althius no lugar', () => {
    const sugestao = sugerirTemplateProprio({
      templates: [
        { ...meu, id: 'tpl-da-ana', donoId: 'ana' },
        { ...meu, id: 'tpl-da-bia', donoId: 'bia' },
      ],
      leitorId: 'bia',
      conta: 'Alfa',
      sinal: { frase: 'Abriu 12 vagas de vendas' },
    })

    expect(sugestao.templateId).toBe('tpl-da-bia')
    expect(sugestao.motivo).toBe('ok')
    expect(sugestao.justificativa).toContain('Abriu 12 vagas de vendas')
    expect(sugestao.justificativa).toContain('Minha abertura')
    expect(sugestao.justificativa).not.toMatch(/comprovad|aumenta|convers[aã]o|\d+\s*%/i)
    expect(sugestao.justificativa).not.toContain('abertura-por-sinal')
  })

  it('sem template legível, sem Sinal ou com teto, não escolhe e a escolha manual continua', () => {
    expect(sugerirTemplateProprio({
      templates: [{ ...meu, id: 'tpl-da-ana', donoId: 'ana' }],
      leitorId: 'bia',
      conta: 'Alfa',
      sinal: { frase: 'Abriu vagas' },
    })).toEqual({ templateId: null, justificativa: '', motivo: 'indisponivel' })

    expect(sugerirTemplateProprio({
      templates: [{ ...meu, id: 'tpl-da-bia', donoId: 'bia' }],
      leitorId: 'bia',
      conta: 'Alfa',
      sinal: null,
    }).motivo).toBe('sem_contexto')

    expect(sugerirTemplateProprio({
      templates: [{ ...meu, id: 'tpl-da-bia', donoId: 'bia' }],
      leitorId: 'bia',
      conta: 'Alfa',
      sinal: { frase: 'Abriu vagas' },
      teto: 'teto_atingido',
    }).motivo).toBe('teto')
  })
})
