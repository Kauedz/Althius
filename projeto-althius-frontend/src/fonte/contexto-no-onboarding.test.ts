import { describe, expect, it, vi } from 'vitest'
import type { ContextoDaEmpresa, FonteDoContextoDaEmpresa, VersaoDoContexto } from './contexto-da-empresa-tipos'
import { gerarContextoDoOnboarding, pendenciaDoContexto } from './contexto-no-onboarding'

const VIGENTE: VersaoDoContexto = {
  versao: 1, empresa: 'E', icp: 'I', personas: 'P', origem: 'geracao', autor: null, em: '2026-11-06T10:00:00Z',
}
const contexto = (mudanca: Partial<ContextoDaEmpresa> = {}): ContextoDaEmpresa => ({
  site: 'norte.test', vigente: null, geracao: null, ...mudanca,
})

function fonteFalsa(atual: ContextoDaEmpresa) {
  const gerar = vi.fn(async () => {})
  const fonte = { contexto: async () => atual, gerar } as unknown as FonteDoContextoDaEmpresa
  return { fonte, gerar }
}

describe('Contexto da empresa no onboarding: a geração', () => {
  it('sem contexto e sem leitura, o site confirmado começa a geração, sem outra confirmação', async () => {
    const { fonte, gerar } = fonteFalsa(contexto())
    expect(await gerarContextoDoOnboarding(fonte, 'norte.test')).toBe(true)
    expect(gerar).toHaveBeenCalledWith('norte.test')
  })

  it('não repete a geração quando já há leitura em andamento ou contexto vigente (Workspace existente)', async () => {
    for (const atual of [
      contexto({ geracao: { id: 'g', site: 'norte.test', estado: 'gerando', iniciadaEm: '' } }),
      contexto({ vigente: VIGENTE }),
    ]) {
      const { fonte, gerar } = fonteFalsa(atual)
      expect(await gerarContextoDoOnboarding(fonte, 'norte.test')).toBe(false)
      expect(gerar).not.toHaveBeenCalled()
    }
  })

  it('sem site confirmado, não há o que ler', async () => {
    const { fonte, gerar } = fonteFalsa(contexto({ site: '' }))
    expect(await gerarContextoDoOnboarding(fonte, '')).toBe(false)
    expect(gerar).not.toHaveBeenCalled()
  })
})

describe('Contexto da empresa no onboarding: a pendência', () => {
  it('com versão vigente não há pendência, mesmo com nova leitura em andamento ou com falha', () => {
    expect(pendenciaDoContexto(contexto({ vigente: VIGENTE }))).toBeNull()
    expect(
      pendenciaDoContexto(contexto({ vigente: VIGENTE, geracao: { id: 'g', site: 's', estado: 'falha', motivo: 'falhou', iniciadaEm: '' } })),
    ).toBeNull()
  })

  it('sem versão vigente, diz o que falta: o site, esperar a leitura, resolver a falha ou gerar', () => {
    expect(pendenciaDoContexto(contexto({ site: '' }))).toBe('sem_site')
    expect(pendenciaDoContexto(contexto({ geracao: { id: 'g', site: 's', estado: 'gerando', iniciadaEm: '' } }))).toBe('gerando')
    expect(
      pendenciaDoContexto(contexto({ geracao: { id: 'g', site: 's', estado: 'falha', motivo: 'site_insuficiente', iniciadaEm: '' } })),
    ).toBe('falha')
    expect(pendenciaDoContexto(contexto())).toBe('sem_contexto')
  })
})
