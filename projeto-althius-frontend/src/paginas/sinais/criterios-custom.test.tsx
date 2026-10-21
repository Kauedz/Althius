import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'
import { adicionarCargosCustom, cargosCustom, limparTextoCustom, manterCargosCustom } from './criterios-custom'
import { criteriosFormatados } from './resumos'

describe('Critérios Custom de Abertura de vagas: regras', () => {
  it('limpa o texto, não repete, respeita as opções da tela e o limite de 10 cargos Custom', () => {
    expect(limparTextoCustom('  Óleo   e gás ')).toBe('Óleo e gás')
    const opcoes = ['Analista fiscal', 'Contador']
    expect(adicionarCargosCustom([], 'SDR, LDR , bdr, sdr', opcoes).funcoes).toEqual(['SDR', 'LDR', 'bdr'])
    expect(adicionarCargosCustom(['SDR'], 'contador', opcoes).funcoes).toEqual(['SDR', 'Contador'])
    const longo = adicionarCargosCustom([], 'x'.repeat(61), opcoes)
    expect(longo.funcoes).toEqual([])
    expect(longo.erro).toBe('Cada cargo tem até 60 caracteres.')
    const dez = Array.from({ length: 10 }, (_, i) => `Cargo ${i}`)
    const cheio = adicionarCargosCustom(dez, 'Mais um', opcoes)
    expect(cheio.funcoes).toHaveLength(10)
    expect(cheio.erro).toBe('Até 10 cargos Custom por Monitoramento.')
    expect(cargosCustom(['SDR', 'Contador'], opcoes)).toEqual(['SDR'])
    expect(manterCargosCustom(['SDR', 'Contador', 'Engenharia de dados'])).toEqual(['SDR'])
  })

  it('o resumo mostra o nicho pelo nome ou como foi escrito, nunca a letra interna', () => {
    const custom = criteriosFormatados({ tipoId: 'abertura-de-vagas', criterios: { nicho: 'custom', nichoCustom: 'Naval', funcoes: ['SDR'] } })
    expect(custom[0]).toEqual({ rotulo: 'Nicho do cargo', texto: 'Naval', numerico: false })
    expect(custom.find((c) => c.rotulo === 'Cargos ou funções')?.texto).toBe('SDR')
    const pronto = criteriosFormatados({ tipoId: 'abertura-de-vagas', criterios: { nicho: 'comex-e-importacao' } })
    expect(pronto[0].texto).toBe('Comex e importação')
    expect(criteriosFormatados({ tipoId: 'abertura-de-vagas', criterios: { nicho: 'qualquer' } })).toEqual([])
  })
})

describe('Critérios Custom de Abertura de vagas: tela', () => {
  it('escreve um nicho Custom e cargos exatos, remove um e mantém os cargos Custom ao trocar de nicho', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')
    await usuario.click(await screen.findByRole('link', { name: 'Ativar Monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    const nicho = screen.getByRole('radiogroup', { name: 'Nicho do cargo' })
    expect(screen.queryByRole('textbox', { name: 'Nicho Custom' })).not.toBeInTheDocument()
    await usuario.click(within(nicho).getByRole('radio', { name: 'Custom' }))
    const campoNicho = screen.getByRole('textbox', { name: 'Nicho Custom' })
    expect(campoNicho).toHaveAttribute('maxLength', '60')
    await usuario.type(campoNicho, 'Óleo e gás')
    expect(campoNicho).toHaveValue('Óleo e gás')

    const cargos = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(cargos).getByRole('checkbox', { name: 'Custom' }))
    const campoCargo = screen.getByRole('textbox', { name: 'Cargo Custom' })
    await usuario.type(campoCargo, 'SDR, LDR, BDR{Enter}')
    expect(campoCargo).toHaveValue('')
    for (const cargo of ['SDR', 'LDR', 'BDR']) {
      expect(within(cargos).getByRole('checkbox', { name: cargo })).toHaveAttribute('aria-checked', 'true')
    }

    await usuario.type(campoCargo, 'sdr')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar cargo' }))
    expect(within(cargos).getAllByRole('checkbox', { name: /sdr/i })).toHaveLength(1)

    await usuario.click(within(cargos).getByRole('checkbox', { name: 'LDR' }))
    expect(within(cargos).queryByRole('checkbox', { name: 'LDR' })).not.toBeInTheDocument()

    await usuario.click(within(nicho).getByRole('radio', { name: 'Comex e importação' }))
    expect(screen.queryByRole('textbox', { name: 'Nicho Custom' })).not.toBeInTheDocument()
    expect(within(cargos).getByRole('checkbox', { name: 'Analista de comércio exterior' })).toBeInTheDocument()
    expect(within(cargos).getByRole('checkbox', { name: 'SDR' })).toHaveAttribute('aria-checked', 'true')
    expect(within(cargos).getByRole('checkbox', { name: 'BDR' })).toHaveAttribute('aria-checked', 'true')
    expect(nicho.textContent).not.toMatch(/\b[A-H]\b/)
  })
})
