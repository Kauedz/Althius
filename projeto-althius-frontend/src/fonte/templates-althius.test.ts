import { describe, expect, it } from 'vitest'
import {
  TEMPLATES_DA_ALTHIUS,
  copiarTemplate,
  sugerirTemplateDaAlthius,
  templateSemDestinoReal,
} from './templates-althius'

const ABERTURA = TEMPLATES_DA_ALTHIUS[0]

describe('cópia de template da Althius', () => {
  it('o catálogo não traz Contato, destino nem histórico', () => {
    for (const template of TEMPLATES_DA_ALTHIUS) {
      expect(templateSemDestinoReal(template)).toBe(true)
      expect(template.passos.length).toBeGreaterThan(0)
    }
  })

  it('copia a estrutura para o Contato escolhido sem alterar o original', () => {
    const original = structuredClone(ABERTURA)
    const copia = copiarTemplate(ABERTURA, 'contato-figma-1')

    expect(copia.map((passo) => passo.titulo)).toEqual(['Abertura com o Sinal', 'Retomada', 'Último toque'])
    expect(copia.every((passo) => passo.contatoId === 'contato-figma-1')).toBe(true)
    expect(copia.every((passo) => passo.destino == null && passo.metricas == null)).toBe(true)
    expect(copia.map((passo) => passo.id)).not.toEqual(ABERTURA.passos.map((passo) => passo.id))

    copia[0].titulo = 'Texto adaptado na cópia'
    copia[0].corpo = 'Corpo só da cópia'
    expect(ABERTURA).toEqual(original)
  })

  it('preserva liberação e predecessor, remapeando o id na cópia', () => {
    const comPredecessor = {
      ...ABERTURA,
      passos: [
        { ...ABERTURA.passos[0], id: 't-a', liberacao: 'ativacao' as const },
        {
          ...ABERTURA.passos[1],
          id: 't-b',
          liberacao: 'predecessor' as const,
          predecessorId: 't-a',
        },
      ],
    }

    const copia = copiarTemplate(comPredecessor, 'contato-2')

    expect(copia[0].liberacao).toBe('ativacao')
    expect(copia[1].liberacao).toBe('predecessor')
    expect(copia[1].predecessorId).toBe(copia[0].id)
    expect(copia[1].predecessorId).not.toBe('t-a')
  })
})

describe('sugestão de template da Althius', () => {
  it('só devolve um template existente e justifica com o Sinal real', () => {
    const sugestao = sugerirTemplateDaAlthius({
      templates: TEMPLATES_DA_ALTHIUS,
      conta: 'Figma',
      sinal: {
        frase: 'Anunciou parceria estratégica para expansão de recursos corporativos de IA',
        data: '2026-09-17',
      },
    })

    expect(sugestao.motivo).toBe('ok')
    expect(sugestao.templateId).toBe('abertura-por-sinal')
    expect(TEMPLATES_DA_ALTHIUS.map((t) => t.id)).toContain(sugestao.templateId)
    expect(sugestao.justificativa).toContain('Figma')
    expect(sugestao.justificativa).toContain('Anunciou parceria estratégica para expansão de recursos corporativos de IA')
    expect(sugestao.justificativa).not.toMatch(/comprovad|aumenta|efic[aá]cia comprovada|convers[aã]o|\d+\s*%/i)
  })

  it('sem Sinal recente não escolhe template e não inventa adequação', () => {
    const sugestao = sugerirTemplateDaAlthius({
      templates: TEMPLATES_DA_ALTHIUS,
      conta: 'Conta sem sinal',
      sinal: null,
    })

    expect(sugestao).toEqual({
      templateId: null,
      justificativa: '',
      motivo: 'sem_contexto',
    })
  })

  it('teto ou falta de teto não devolve template', () => {
    for (const teto of ['teto_atingido', 'sem_teto', 'sem_espaco'] as const) {
      const sugestao = sugerirTemplateDaAlthius({
        templates: TEMPLATES_DA_ALTHIUS,
        conta: 'Figma',
        sinal: { frase: 'Abriu vagas', data: '2026-09-18' },
        teto,
      })
      expect(sugestao.templateId).toBeNull()
      expect(sugestao.motivo).toBe('teto')
    }
  })

  it('ignora um id que não está no catálogo acessível', () => {
    const sugestao = sugerirTemplateDaAlthius({
      templates: TEMPLATES_DA_ALTHIUS.filter((t) => t.id !== 'abertura-por-sinal'),
      conta: 'Figma',
      sinal: { frase: 'Abriu vagas', data: '2026-09-18' },
    })

    expect(sugestao.templateId).toBeNull()
    expect(sugestao.motivo).toBe('indisponivel')
  })
})
