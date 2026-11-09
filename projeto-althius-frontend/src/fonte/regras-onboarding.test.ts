import { describe, expect, it } from 'vitest'
import type { ChecklistNorte, EstadoDeOnboarding } from './onboarding-tipos'
import { identidadeDoWorkspace, progressoDoOnboarding } from './regras-onboarding'

const VAZIO: ChecklistNorte = { contexto: 'pendente', sinal: 'pendente' }

const estado = (mudanca: Partial<EstadoDeOnboarding>) =>
  ({ workspace: null, checklist: VAZIO, logoDoSite: null, ...mudanca }) as EstadoDeOnboarding

describe('Regras do onboarding: o Contexto da empresa no progresso', () => {
  const criador = (mudanca: Partial<EstadoDeOnboarding> = {}) =>
    estado({ ramo: 'criador', day0Concluido: true, dominio: 'norte.test', ...mudanca })

  it('o Contexto da empresa conta pela versão vigente, não por uma marca do onboarding', () => {
    expect(progressoDoOnboarding(criador()).proximo).toBe('contexto')
    expect(progressoDoOnboarding(criador(), true).proximo).toBe('sinal')
    expect(progressoDoOnboarding(criador({ checklist: { contexto: 'concluido', sinal: 'pendente' } })).proximo).toBe('contexto')
  })

  it('com o site pulado, o marco do site fica faltando e o onboarding não chega a 100%', () => {
    const { marcos, percentual } = progressoDoOnboarding(
      criador({ dominio: '', sitePulado: true, checklist: { contexto: 'pulado', sinal: 'concluido' } }),
    )
    expect(marcos).toEqual([
      { marco: 'workspace', feito: true },
      { marco: 'site', feito: false },
      { marco: 'contexto', feito: false },
      { marco: 'sinal', feito: true },
    ])
    expect(percentual).toBe(50)
  })

  it('completo com Workspace, site, contexto vigente e Sinal', () => {
    const progresso = progressoDoOnboarding(criador({ checklist: { contexto: 'pendente', sinal: 'concluido' } }), true)
    expect(progresso).toMatchObject({ percentual: 100, proximo: null })
  })
})

describe('Regras do onboarding: a identidade do Workspace na Casca', () => {
  it('sem um Workspace criado com nome, a Casca fica com o da demonstração', () => {
    expect(identidadeDoWorkspace(estado({}))).toBeNull()
    expect(identidadeDoWorkspace(estado({ workspace: { id: 'ws', nomeSugerido: '' } }))).toBeNull()
  })

  it('o Workspace criado aparece com o nome sugerido e o logo do site; a descrição fica no Contexto da empresa', () => {
    const logo = 'https://nortedados.com.br/favicon.svg'
    expect(identidadeDoWorkspace(estado({ workspace: { id: 'ws', nomeSugerido: 'Norte Dados' }, logoDoSite: logo }))).toEqual({
      nome: 'Norte Dados',
      descricao: '',
      logo,
    })
  })
})
