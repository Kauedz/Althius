import { describe, expect, it } from 'vitest'
import type { ChecklistNorte, EstadoDeOnboarding, LeituraDoSite } from './onboarding-tipos'
import { aplicarLeitura, identidadeDoWorkspace } from './regras-onboarding'

const VAZIO: ChecklistNorte = {
  miniIcp: '',
  oQueVende: '',
  porQueCompram: '',
  personas: [],
  produto: 'pendente',
  persona: 'pendente',
  sinal: 'pendente',
}

const PRIMEIRA: LeituraDoSite = {
  oQueVende: 'Sensores de vibração.',
  miniIcp: 'Indústrias de processo contínuo.',
  porQueCompram: 'Para prever falhas.',
  personas: ['Gerente de Manutenção'],
}

const SEGUNDA: LeituraDoSite = {
  oQueVende: 'Software para clínicas.',
  miniIcp: 'Clínicas com mais de dez consultórios.',
  porQueCompram: 'Para confirmar consultas.',
  personas: ['Gestora da Clínica'],
}

describe('Regras do onboarding: a leitura do site no checklist', () => {
  it('sem leitura anterior, a leitura preenche o que está vazio e não toca no que a pessoa escreveu', () => {
    expect(aplicarLeitura({ ...VAZIO, miniIcp: 'Times de receita no Sul.' }, null, PRIMEIRA)).toMatchObject({
      miniIcp: 'Times de receita no Sul.',
      oQueVende: PRIMEIRA.oQueVende,
      porQueCompram: PRIMEIRA.porQueCompram,
      personas: PRIMEIRA.personas,
    })
  })

  it('uma nova leitura troca só o que ainda é a sugestão da anterior; o editado e o descartado ficam', () => {
    const editado = { ...aplicarLeitura(VAZIO, null, PRIMEIRA), oQueVende: 'Consultoria de dados.', personas: [] }
    expect(aplicarLeitura(editado, PRIMEIRA, SEGUNDA)).toMatchObject({
      miniIcp: SEGUNDA.miniIcp,
      porQueCompram: SEGUNDA.porQueCompram,
      oQueVende: 'Consultoria de dados.',
      personas: [],
    })
  })

  it('devolve um checklist novo, sem mudar o recebido', () => {
    const checklist = structuredClone(VAZIO)
    aplicarLeitura(checklist, null, PRIMEIRA)
    expect(checklist).toEqual(VAZIO)
  })
})

describe('Regras do onboarding: a identidade do Workspace na Casca', () => {
  const estado = (mudanca: Partial<EstadoDeOnboarding>) =>
    ({ workspace: null, checklist: VAZIO, logoDoSite: null, ...mudanca }) as EstadoDeOnboarding

  it('sem um Workspace criado com nome, a Casca fica com o da demonstração', () => {
    expect(identidadeDoWorkspace(estado({}))).toBeNull()
    expect(identidadeDoWorkspace(estado({ workspace: { id: 'ws', nomeSugerido: '' } }))).toBeNull()
  })

  it('o Workspace criado aparece com o nome sugerido, o que o Cliente vende e o logo do site', () => {
    const logo = 'https://nortedados.com.br/favicon.svg'
    expect(
      identidadeDoWorkspace(
        estado({
          workspace: { id: 'ws', nomeSugerido: 'Norte Dados' },
          checklist: { ...VAZIO, oQueVende: 'Plataforma de dados.' },
          logoDoSite: logo,
        }),
      ),
    ).toEqual({ nome: 'Norte Dados', descricao: 'Plataforma de dados.', logo })
  })
})
